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
import re
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import JSONResponse

SECRET = os.environ.get("AXENT_RUNNER_SECRET", "")
IMAGE = os.environ.get("EXECUTION_IMAGE", "axent-code-sandbox:latest")
ALLOWED_ORIGINS = {x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "https://axent.axiogen.in").split(",") if x.strip()}
LANGUAGES = {"C": "c", "C++": "cpp", "Python": "py", "Java": "java"}
MAX_SOURCE = 100_000
MAX_OUTPUT = 64_000
MAX_SESSION_SECONDS = 90
MAX_JUDGE_SECONDS = 12
JUDGE_CONCURRENCY = int(os.environ.get("JUDGE_CONCURRENCY", "4"))
JUDGE_SEMAPHORE = asyncio.Semaphore(max(1, min(JUDGE_CONCURRENCY, 16)))
USED_NONCES = {}

app = FastAPI(title="Axent Interactive Terminal", docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "axent-interactive-terminal", "pty": True}



def judge_command_for(language: str):
    metric = "/usr/bin/time -f '__AXENT_METRICS__%e|%M'"
    if language == "Python":
        return ["sh", "-lc", f"exec {metric} python3 -u /workspace/Main.py"]
    if language == "C":
        return ["sh", "-lc", f"gcc -std=c11 -O2 -pipe /workspace/Main.c -o /tmp/axent-program || exit 86; exec {metric} /tmp/axent-program"]
    if language == "C++":
        return ["sh", "-lc", f"g++ -std=c++17 -O2 -pipe /workspace/Main.cpp -o /tmp/axent-program || exit 86; exec {metric} /tmp/axent-program"]
    if language == "Java":
        return ["sh", "-lc", f"javac -d /tmp /workspace/Main.java || exit 86; exec {metric} java -cp /tmp Main"]
    raise ValueError("Unsupported language.")


def run_judge(code: str, language: str, stdin: str):
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="axent-judge-") as folder:
        prepare_source(language, code, folder)
        container_name = "axent-judge-" + uuid.uuid4().hex[:12]
        docker_command = [
            "docker", "run", "--rm", "--name", container_name, "--init", "-i",
            "--network", "none", "--memory", "128m", "--memory-swap", "128m",
            "--cpus", "0.50", "--pids-limit", "48", "--read-only",
            "--tmpfs", "/tmp:rw,nosuid,size=32m",
            "--user", "10001:10001", "--security-opt", "no-new-privileges",
            "--cap-drop", "ALL", "--ulimit", "cpu=8:8",
            "--ulimit", "fsize=1048576:1048576", "--ulimit", "nofile=64:64",
            "--mount", f"type=bind,src={folder},dst=/workspace,readonly",
            "--workdir", "/workspace", IMAGE, *judge_command_for(language),
        ]
        try:
            completed = subprocess.run(
                docker_command, input=stdin.encode("utf-8"),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=MAX_JUDGE_SECONDS, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            subprocess.run(["docker", "rm", "-f", container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
            raise TimeoutError("Judge worker exceeded its hard safety timeout; retry evaluation.") from exc
        except (FileNotFoundError, OSError) as exc:
            raise RuntimeError("The isolated judge runtime is unavailable.") from exc

        if completed.returncode == 125:
            raise RuntimeError("The isolated sandbox could not start. Retry evaluation; no marks were awarded.")
        stdout = completed.stdout[:MAX_OUTPUT].decode("utf-8", errors="replace")
        stderr = completed.stderr[:MAX_OUTPUT].decode("utf-8", errors="replace")
        if len(completed.stdout) > MAX_OUTPUT or len(completed.stderr) > MAX_OUTPUT:
            return {
                "exitCode": 125, "stdout": stdout, "stderr": "Output limit exceeded (64 KB).",
                "compileError": False, "runtimeMs": None, "memoryKb": None,
                "wallTimeMs": round((time.monotonic() - started) * 1000, 2),
                "statusDescription": "Output Limit Exceeded",
            }

        runtime_ms = None
        memory_kb = None
        match = re.search(r"__AXENT_METRICS__(\d+(?:\.\d+)?)\|(\d+)", stderr)
        if match:
            runtime_ms = round(float(match.group(1)) * 1000, 3)
            memory_kb = int(match.group(2))
            stderr = stderr[:match.start()].rstrip()

        compile_error = completed.returncode == 86
        status = "Compilation Error" if compile_error else "Accepted" if completed.returncode == 0 else "Runtime Error"
        return {
            "exitCode": int(completed.returncode),
            "stdout": stdout,
            "stderr": stderr or None,
            "compileError": compile_error,
            "runtimeMs": runtime_ms,
            "memoryKb": memory_kb,
            "wallTimeMs": round((time.monotonic() - started) * 1000, 2),
            "statusDescription": status,
        }


@app.post("/judge")
async def judge(request: Request):
    if not SECRET:
        raise HTTPException(status_code=503, detail="Judge authentication is not configured.")
    try:
        payload = await request.json()
        token = decode_token(str(payload.get("token", "")))
        code = str(payload.get("code", ""))
        language = str(payload.get("language", ""))
        stdin = str(payload.get("stdin", ""))
        if language not in LANGUAGES or not code.strip() or len(code.encode("utf-8")) > MAX_SOURCE or len(stdin.encode("utf-8")) > 20_000:
            raise ValueError("Invalid judge request.")
        digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(digest, str(token.get("code_sha256", ""))) or language != token.get("language"):
            raise ValueError("The source code changed after judge authorization.")
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc)[:180]) from exc

    acquired = False
    try:
        await asyncio.wait_for(JUDGE_SEMAPHORE.acquire(), timeout=20)
        acquired = True
        result = await asyncio.to_thread(run_judge, code, language, stdin)
        return result
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=503, detail="Judge capacity is busy. Retry the evaluation.") from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        if acquired:
            JUDGE_SEMAPHORE.release()


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
