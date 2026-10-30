import nodemailer from "nodemailer";
import { escapeHtml, readBody, requireAdmin, setApiHeaders, smtpConfiguration } from "./_security.js";

export const config = { maxDuration: 60 };

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

// Keep a persistent warm transporter pool in serverless memory for ultra-fast reuse
let cachedTransporter = null;
let cachedTransporterKey = "";

function getTransporter(smtp) {
  const key = `${smtp.user}:${smtp.host}:${smtp.port}`;
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 10,
    maxMessages: 200,
    rateDelta: 1000,
    rateLimit: 14,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 6000
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const smtp = smtpConfiguration();
  if (!smtp) {
    return res.status(503).json({
      success: false,
      error: "SMTP credentials not found on server. Configure SMTP_USER and SMTP_PASSWORD."
    });
  }

  // Handle connection test
  if (req.query?.action === "test" || req.body?.action === "test") {
    try {
      const transporter = getTransporter(smtp);
      await transporter.verify();
      return res.status(200).json({ success: true, message: `Connected to ${smtp.host} as ${smtp.user}.` });
    } catch (err) {
      return res.status(502).json({ success: false, error: `SMTP verification failed: ${err?.message || err}` });
    }
  }

  let body;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ success: false, error: "Invalid JSON request body." });
  }

  const recipients = body.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, error: "Provide at least 1 recipient." });
  }

  const transporter = getTransporter(smtp);
  const configuredPublicUrl = String(process.env.APP_PUBLIC_URL || "https://axent.axiogen.in").replace(/\/$/, "");

  const sent = [];
  const failed = [];

  // Send all emails in parallel using connection pool
  await Promise.allSettled(
    recipients.map(async (recipient) => {
      const name = String(recipient.name || "Candidate").trim().slice(0, 100);
      const email = String(recipient.email || "").trim().toLowerCase();
      const roll = String(recipient.rollNumber || recipient.roll || "").trim().slice(0, 50);
      const key = String(recipient.round2Key || recipient.key || "").trim().slice(0, 50);
      const score = recipient.round1Score !== undefined ? String(recipient.round1Score) : "—";
      const maxScore = recipient.round1MaxScore !== undefined ? String(recipient.round1MaxScore) : "—";

      if (!validEmail(email)) {
        failed.push({ email, name, reason: "Invalid email format." });
        return;
      }

      if (!key) {
        failed.push({ email, name, reason: "Missing Round 2 key." });
        return;
      }

      const safeName = escapeHtml(name);
      const safeRoll = escapeHtml(roll);
      const safeKey = escapeHtml(key);
      const portalUrl = `${configuredPublicUrl}/code-spark?key=${encodeURIComponent(key)}`;

      const textBody = `Hello ${name},

Congratulations! You have been officially shortlisted for Round 2 of CodeSpark 2026.

Candidate: ${name}
Roll: ${roll}
Status: QUALIFIED // SHORTLISTED FOR ROUND 2

YOUR ROUND 2 ACCESS CODE:
${key}

Direct Access URL:
${portalUrl}

Please keep your access code confidential. Enter it on the portal to access the Algorithmic Coding Sprint Arena.

CodeSpark 2026 Examination Board
Axent Platform · Axiogen Cloud Infrastructure`;

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeSpark 2026 Round 2 Clearance</title>
</head>
<body style="margin:0;padding:24px 16px;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4f4f5;">
  <div style="max-width:560px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:32px 24px;">
    
    <div style="display:inline-block;padding:4px 10px;border-radius:4px;background:#27272a;color:#a1a1aa;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:20px;">
      CODESPARK 2026 // OFFICIAL CLEARANCE
    </div>

    <h2 style="margin:0 0 12px 0;font-size:22px;font-weight:800;color:#f4f4f5;letter-spacing:-0.5px;">
      Round 2 Coding Sprint Invitation
    </h2>

    <p style="margin:0 0 20px 0;font-size:13.5px;color:#a1a1aa;line-height:1.6;">
      Dear <strong style="color:#ffffff;">${safeName}</strong>, congratulations on clearing the institutional cutoff for Round 1 General Aptitude! You are officially cleared to enter the Round 2 Algorithmic Coding Sprint Arena.
    </p>

    <div style="background:#121214;border:1px solid #27272a;border-radius:6px;padding:16px;margin-bottom:24px;">
      <div style="font-size:11px;color:#71717a;text-transform:uppercase;font-weight:700;letter-spacing:1px;margin-bottom:6px;">Your Round 2 Access Key</div>
      <div style="font-size:24px;font-family:monospace;font-weight:900;color:#ef4444;letter-spacing:2px;">
        ${safeKey}
      </div>
      <div style="font-size:12px;color:#a1a1aa;margin-top:6px;">
        Roll / USN: <strong style="color:#f4f4f5;">${safeRoll || 'Verified Candidate'}</strong> &bull; Status: <strong style="color:#10b981;">Qualified for Round 2</strong>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#ffffff;color:#09090b;text-decoration:none;font-weight:800;font-size:13px;border-radius:6px;letter-spacing:0.5px;">
        START ROUND 2 CODING SPRINT &rarr;
      </a>
    </div>

    <div style="border-top:1px solid #27272a;padding-top:16px;font-size:11.5px;color:#71717a;line-height:1.5;">
      Direct link: <a href="${portalUrl}" style="color:#a1a1aa;">${portalUrl}</a><br>
      Examination Board &bull; Axent Platform Powered by Team Axiogen
    </div>
  </div>
</body>
</html>`;

      try {
        await transporter.sendMail({
          from: { name: smtp.fromName, address: smtp.user },
          to: { name, address: email },
          subject: `CodeSpark 2026: You are Shortlisted for Round 2! [Key: ${key}]`,
          text: textBody,
          html: htmlBody
        });
        sent.push({ email, name, key });
      } catch (err) {
        console.error(`[SMTP send error for ${email}]:`, err?.message || err);
        failed.push({ email, name, reason: err?.message || "Delivery failed" });
      }
    })
  );

  return res.status(sent.length > 0 ? 200 : 502).json({
    success: sent.length > 0,
    total: recipients.length,
    sent_count: sent.length,
    failed_count: failed.length,
    sent,
    failed,
    message: `Successfully delivered ${sent.length} of ${recipients.length} invitation emails.`
  });
}
