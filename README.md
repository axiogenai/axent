# Axent — Autonomous Academic & Technical Examination Platform

Axent is an institutional examination management, authoring, proctoring, and automated evaluation platform designed for colleges, universities, and technical academies.

---

## Key Capabilities

- **Paper Setter Portal**: Author question banks, generate full examination papers autonomously with AI, configure strict time windows, and schedule proctored sessions.
- **Dual Examination Formats**:
  - **MCQ Examination**: Real-time timer countdown, anti-tamper kiosk mode, deterministic candidate audit tokens, and WhatsApp results dispatch.
  - **Monaco Coding Practical**: Full in-browser IDE with live compiler execution, automated unit test grading, and anti-plagiarism forensics.
- **Proctoring & Invigilation**:
  - Live candidate telemetry grid with tab-switch infraction tracking.
  - Automatic workstation lockdown on academic policy violation.
  - Instant candidate pardon and emergency time extension controls.
- **Cloud Infrastructure & Sync**:
  - Integrated PostgreSQL database for central sync.
  - Real-time station heartbeat telemetry.
  - CSV/JSON ledger exports for department recordkeeping.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Monaco Editor, Lucide Icons, Framer Motion
- **Backend**: Python 3.11+, Django REST framework
- **Cloud / Telemetry**: Supabase Realtime & PostgreSQL

---

## Getting Started

### 1. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:4000`.

### 2. Backend Setup (Optional for cloud mode)

```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python manage.py runserver
```

---

## Deployment & Hosting

<a href="https://vercel.com?utm_source=team-axiogen&utm_campaign=oss">
  <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/powered-by-vercel.svg" alt="Powered by Vercel" />
</a>

---

## License

Institutional Proprietary — Developed for Enterprise & University Examination Administrations.
