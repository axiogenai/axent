import nodemailer from "nodemailer";
import { escapeHtml, readBody, requireAdmin, setApiHeaders, smtpConfiguration } from "./_security.js";

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const smtp = smtpConfiguration();
  if (!smtp) return res.status(503).json({ success: false, error: "SMTP is not configured on the server. Configure SMTP_USER and SMTP_PASSWORD." });

  let body;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ success: false, error: "Invalid JSON request body." });
  }
  const recipients = body.recipients;
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 500) {
    return res.status(400).json({ success: false, error: "Provide between 1 and 500 recipients." });
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 20000
  });
  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    const name = String(recipient?.name || "Candidate").trim().slice(0, 120);
    const email = String(recipient?.email || "").trim().toLowerCase();
    const roll = String(recipient?.rollNumber || recipient?.accessKey || "").trim().slice(0, 80);
    const key = String(recipient?.round2Key || "").trim().slice(0, 80);
    const configuredPublicUrl = String(process.env.APP_PUBLIC_URL || "https://axent.axiogen.in").replace(/\/$/, "");
    const examUrl = String(recipient?.examUrl || `${configuredPublicUrl}/code-spark`).trim();
    let parsedUrl;
    let publicHost = "";
    try { publicHost = new URL(configuredPublicUrl).hostname; parsedUrl = new URL(examUrl); } catch {}
    const allowedHosts = new Set([publicHost, "axent.axiogen.in", "axent-tau.vercel.app"].filter(Boolean));
    const secureKeySuffix = key.toUpperCase().replace(/^AXENT-R2-/, "");
    if (!validEmail(email) || secureKeySuffix.length < 8 || !parsedUrl || parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
      failed.push({ email, name, reason: "Invalid recipient details or access URL." });
      continue;
    }

    const safeName = escapeHtml(name);
    const safeRoll = escapeHtml(roll);
    const safeKey = escapeHtml(key);
    const safeUrl = escapeHtml(parsedUrl.toString());
    const score = escapeHtml(recipient?.round1Score ?? "—");
    const maxScore = escapeHtml(recipient?.round1MaxScore ?? "—");
    const textBody = `Hello ${name},

Congratulations! You have been shortlisted for Round 2 of CodeSpark 2026.

Candidate: ${name}
Roll Number: ${roll}
Round 1 Score: ${recipient?.round1Score ?? "—"} / ${recipient?.round1MaxScore ?? "—"}
Your Round 2 Access Key: ${key}

Enter the arena: ${parsedUrl.toString()}

CodeSpark 2026 Examination Authority
Axent Platform`;
    const htmlBody = `<!doctype html><html><body style="margin:0;padding:32px;background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:28px;background:#121214;border:1px solid #27272a;border-radius:8px"><p style="color:#ea1a1c;font-size:12px;font-weight:bold;letter-spacing:2px">CODESPARK 2026 · OFFICIAL CLEARANCE</p><h1 style="font-size:22px">Round 2 Shortlist Qualification</h1><p>Dear <strong>${safeName}</strong>,</p><p>Congratulations! You have qualified for Round 2.</p><p>Round 1 score: <strong>${score} / ${maxScore}</strong><br/>Candidate roll: <strong>${safeRoll}</strong></p><section style="padding:20px;text-align:center;background:#18181b;border:1px solid #3f3f46;border-radius:6px"><small>Your official Round 2 access key</small><h2 style="color:#ea1a1c;letter-spacing:3px">${safeKey}</h2></section><p style="text-align:center;margin:28px"><a href="${safeUrl}" style="padding:13px 24px;background:#ea1a1c;color:white;text-decoration:none;border-radius:5px">ENTER ROUND 2 ARENA</a></p><p style="font-size:12px;color:#a1a1aa">CodeSpark 2026 Examination Authority · Axent Academic Platform</p></main></body></html>`;

    try {
      await transporter.sendMail({
        from: { name: smtp.fromName, address: smtp.user },
        to: { name, address: email },
        subject: "CodeSpark 2026: Round 2 Shortlist Clearance",
        text: textBody,
        html: htmlBody
      });
      sent.push({ email, name });
    } catch (error) {
      console.error("[CodeSpark email] delivery failed:", error?.code || "SMTP_SEND_ERROR");
      failed.push({ email, name, reason: "Email delivery failed. Check server SMTP logs." });
    }
  }

  return res.status(sent.length ? 200 : 502).json({
    success: failed.length === 0,
    total: recipients.length,
    sent_count: sent.length,
    failed_count: failed.length,
    sent,
    failed
  });
}
