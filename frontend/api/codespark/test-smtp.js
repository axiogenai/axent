import nodemailer from "nodemailer";
import { requireAdmin, setApiHeaders, smtpConfiguration } from "./_security.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const smtp = smtpConfiguration();
  if (!smtp) return res.status(503).json({ success: false, error: "SMTP is not configured on the server. Configure SMTP_USER, SMTP_PASSWORD and optional SMTP_HOST/SMTP_PORT." });

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 12000
    });
    await transporter.verify();
    return res.status(200).json({ success: true, message: "Server SMTP connection verified successfully." });
  } catch (error) {
    console.error("[CodeSpark SMTP] verification failed:", error?.code || "SMTP_ERROR");
    return res.status(502).json({ success: false, error: "SMTP verification failed. Check the server-side SMTP configuration." });
  }
}
