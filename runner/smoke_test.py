#!/usr/bin/env python3
"""Live runner smoke/load check. Run only against a dedicated staging runner."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE_URL = os.environ.get("AXENT_RUNNER_URL", "").rstrip("/")
SECRET = os.environ.get("AXENT_RUNNER_SECRET", "")

def signed_token(code: str, nonce: str) -> str:
    payload = {
        "candidate_hash": hashlib.sha256(nonce.encode()).hexdigest(),
        "problem_id": "runner-smoke",
        "language": "Python",
        "code_sha256": hashlib.sha256(code.encode()).hexdigest(),
        "exp": int(time.time()) + 30,
        "nonce": nonce,
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    signed = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return encoded + "." + signed

def send_one(index: int):
    code = "import sys\nvalue = sys.stdin.read().strip()\nprint('AXENT_SMOKE_' + value)\n"
    nonce = str(uuid.uuid4())
    body = json.dumps({
        "token": signed_token(code, nonce),
        "code": code,
        "language": "Python",
        "stdin": str(index),
    }).encode()
    request = Request(BASE_URL + "/judge", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode())
    expected = f"AXENT_SMOKE_{index}"
    if response.status != 200 or result.get("stdout", "").strip() != expected:
        raise AssertionError(f"candidate {index}: unexpected judge response {result}")
    if result.get("runtimeMs") is None or result.get("memoryKb") is None:
        raise AssertionError(f"candidate {index}: runtime/memory telemetry missing: {result}")
    return index

async def main():
    if not BASE_URL or not SECRET:
        raise SystemExit("Set AXENT_RUNNER_URL and AXENT_RUNNER_SECRET; use a dedicated staging runner.")
    started = time.monotonic()
    results = await asyncio.gather(*(asyncio.to_thread(send_one, i) for i in range(8)), return_exceptions=True)
    failures = [str(item) for item in results if isinstance(item, Exception)]
    elapsed = time.monotonic() - started
    if failures:
        raise SystemExit("Concurrent judge smoke test FAILED:\n" + "\n".join(failures))
    print(f"PASS: {len(results)} concurrent candidate-style judge requests; {elapsed:.2f}s elapsed.")

if __name__ == "__main__":
    asyncio.run(main())
