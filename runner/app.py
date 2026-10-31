import asyncio
import base64
import hashlib
import hmac
import json
import os
import pty
import select
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

SECRET = os.environ.get("AXENT_RUNNER_SECRET", "")
IMAGE = os.environ.get("EXECUTION_IMAGE", "axent-code-sandbox:latest")
ALLOWED_ORIGINS = {x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "https://axent.axiogen.in").split(",") if x.strip()}
LANGUAGES = {"C": "c", "C++": "cpp", "Python": "py", "Java": "java"}
MAX_SOURCE = 100_000
MAX_OUTPUT = 64_000
MAX_SESSION_SECONDS = 90
USED_NONCES = {}

app = FastAPI(title="Axent Interactive Terminal", docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "axent-interactive-terminal", "pty": True}


def decode_token(token: str):
    if not SECRET or "." not in token:
        raise ValueError("Runner authentication is not configured.")
    encoded, signature = token.rsplit(".", 1)
    expected = hmac.new(SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
    if not hmac.compare_digest(expected, supplied):
        raise ValueError("Invalid terminal session token.")
    payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Terminal session token expired.")
    nonce = str(payload.get("nonce", ""))
    now = int(time.time())
    for used, expiry in list(USED_NONCES.items()):
        if expiry < now:
            USED_NONCES.pop(used, None)
    if not nonce or nonce in USED_NONCES:
        raise ValueError("This terminal session token has already been used.")
    USED_NONCES[nonce] = int(payload["exp"])
    return payload


def command_for(language: str):
    return {
        "Python": ["python3", "-u", "/workspace/Main.py"],
        "C": ["sh", "-lc", "gcc -std=c11 -O2 -pipe /workspace/Main.c -o /tmp/axent-program && exec /tmp/axent-program"],
        "C++": ["sh", "-lc", "g++ -std=c++17 -O2 -pipe /workspace/Main.cpp -o /tmp/axent-program && exec /tmp/axent-program"],
        "Java": ["sh", "-lc", "javac -d /tmp /workspace/Main.java && exec java -cp /tmp Main"],
    }[language]


def prepare_source(language: str, code: str, folder: str):
    import re
    names = {"Python": "Main.py", "C": "Main.c", "C++": "Main.cpp", "Java": "Main.java"}
    if language == "Java":
        code = re.sub(r"\bpublic\s+class\b", "class", code)
    Path(folder, names[language]).write_text(code, encoding="utf-8")


async def pump_output(ws: WebSocket, master: int, proc: subprocess.Popen):
    sent = 0
    while True:
        readable, _, _ = await asyncio.to_thread(select.select, [master], [], [], 0.12)
        if not readable:
            if proc.poll() is not None:
                break
            continue
        try:
            chunk = await asyncio.to_thread(os.read, master, 4096)
        except OSError:
            break
        if not chunk:
            break
        sent += len(chunk)
        if sent > MAX_OUTPUT:
            await ws.send_json({"type": "error", "message": "Output limit exceeded (64 KB)."})
            if proc.poll() is None:
                proc.kill()
            break
        await ws.send_json({"type": "output", "data": chunk.decode("utf-8", errors="replace")})


@app.websocket("/ws/terminal")
async def terminal(ws: WebSocket):
    if ws.headers.get("origin", "") not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    proc = None
    container_name = None
    master = slave = None
    try:
        start = await asyncio.wait_for(ws.receive_json(), timeout=8)
        if start.get("type") != "start":
            raise ValueError("Expected terminal start message.")
        token = decode_token(str(start.get("token", "")))
        code = str(start.get("code", ""))
        language = str(start.get("language", ""))
        if language not in LANGUAGES or not code.strip() or len(code.encode("utf-8")) > MAX_SOURCE:
            raise ValueError("Invalid source code or language.")
        digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(digest, str(token.get("code_sha256", ""))) or language != token.get("language"):
            raise ValueError("The source code changed after this session was authorized.")

        await ws.send_json({"type": "status", "message": "Compiling and starting program..."})
        with tempfile.TemporaryDirectory(prefix="axent-") as folder:
            prepare_source(language, code, folder)
            master, slave = pty.openpty()
            container_name = "axent-run-" + uuid.uuid4().hex[:12]
            docker_command = [
                "docker", "run", "--rm", "--name", container_name, "--init", "-i", "-t", "--network", "none",
                "--memory", "128m", "--memory-swap", "128m", "--cpus", "0.50",
                "--pids-limit", "48", "--read-only",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
                "--user", "10001:10001", "--security-opt", "no-new-privileges",
                "--cap-drop", "ALL", "--ulimit", "cpu=5:5",
                "--ulimit", "fsize=1048576:1048576", "--ulimit", "nofile=64:64",
                "--mount", f"type=bind,src={folder},dst=/workspace,readonly",
                "--workdir", "/workspace", IMAGE, *command_for(language),
            ]
            proc = subprocess.Popen(
                docker_command, stdin=slave, stdout=slave, stderr=slave,
                close_fds=True, start_new_session=True,
            )
            os.close(slave)
            slave = None
            await ws.send_json({"type": "ready", "message": "Process started. Type directly in this terminal."})

            async def receive_input():
                while proc.poll() is None:
                    message = await ws.receive_json()
                    if message.get("type") == "input":
                        data = str(message.get("data", ""))
                        if len(data) > 4096:
                            raise ValueError("Input chunk too large.")
                        await asyncio.to_thread(os.write, master, data.encode("utf-8"))
                    elif message.get("type") == "terminate":
                        if proc.poll() is None:
                            proc.terminate()
                        return

            reader = asyncio.create_task(pump_output(ws, master, proc))
            writer = asyncio.create_task(receive_input())
            try:
                done, _ = await asyncio.wait(
                    {reader, writer}, timeout=MAX_SESSION_SECONDS,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    if proc.poll() is None:
                        proc.kill()
                    await ws.send_json({"type": "error", "message": "Terminal session timed out (90 seconds)."})
                elif writer in done and writer.exception():
                    raise writer.exception()
                if proc.poll() is None:
                    try:
                        await asyncio.wait_for(asyncio.to_thread(proc.wait), timeout=2)
                    except asyncio.TimeoutError:
                        proc.kill()
            except WebSocketDisconnect:
                if proc.poll() is None:
                    proc.kill()
                raise
            finally:
                if proc.poll() is None:
                    proc.kill()
                for task in (reader, writer):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(reader, writer, return_exceptions=True)
            await ws.send_json({"type": "exit", "exitCode": proc.returncode})
    except WebSocketDisconnect:
        if proc and proc.poll() is None:
            proc.kill()
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)[:240]})
            await ws.close(code=1008)
        except Exception:
            pass
    finally:
        if proc and proc.poll() is None:
            proc.kill()
        if container_name:
            try:
                subprocess.run(["docker", "rm", "-f", container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
            except Exception:
                pass
        for fd in (master, slave):
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
