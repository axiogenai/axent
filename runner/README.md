# Axent interactive code runner

A dedicated Linux host service for genuine interactive Round 2 terminals. Vercel functions cannot keep a PTY process alive, so the browser connects to this WebSocket service.

## Host requirements

- A dedicated Linux VM (Ubuntu 22.04/24.04 recommended), not Vercel or a shared app host.
- Docker Engine installed and available at `/var/run/docker.sock`.
- A public HTTPS/WSS hostname such as `terminal.axent.axiogen.in`, with Caddy/Nginx terminating TLS and proxying WebSockets to `127.0.0.1:8080`.
- Firewall: expose only the HTTPS reverse-proxy port. Keep Docker and port 8080 private.

## Deploy

1. Copy `.env.example` to `.env` and set a unique random `AXENT_RUNNER_SECRET`.
2. Build the compiler sandbox image: `docker build -t axent-code-sandbox:latest ./sandbox`.
3. Start the service: `docker compose up -d --build`.
4. Configure Vercel server-only variables:
   - `CODE_RUNNER_SECRET`: exactly the same secret.
   - `CODE_RUNNER_URL`: runner HTTPS base URL, e.g. `https://terminal.axent.axiogen.in`.
5. Configure the Vercel frontend build variable:
   - `VITE_CODE_RUNNER_WS_URL`: `wss://terminal.axent.axiogen.in/ws/terminal`.
6. Rebuild/redeploy Axent and verify `GET https://terminal.axent.axiogen.in/health` returns `{"status":"ok"}`.

## Security

Each session requires a short-lived HMAC token issued by Axent's Round 2 API. It binds the candidate, assigned problem, language, and exact source-code SHA-256. The runner rejects expired or altered code. Each execution runs in a fresh, network-disabled Docker container with memory/CPU/PID/file-size limits, a read-only source mount, a non-root UID, dropped Linux capabilities, and no-new-privileges. The PTY is destroyed when the process exits, the browser disconnects, or the 90-second session limit is reached.

The runner needs access to the Docker socket, which is effectively host-root access. Use a dedicated VM, keep it patched, and never publish port 8080 directly.

## Languages

C (GCC), C++ (G++), Python 3, and Java 17. Java source is compiled as `Main.java`, so a public top-level class must be named `Main`.
