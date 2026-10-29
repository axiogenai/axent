import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST method required.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const smtp_user = String(body.smtp_user || process.env.VITE_SMTP_USER || 'teamaxiogen@gmail.com').trim();
    const smtp_password = String(body.smtp_password || process.env.VITE_SMTP_PASSWORD || 'qtdpejtmmsuflijo').replace(/\s+/g, '').trim();
    const smtp_host = String(body.smtp_host || 'smtp.gmail.com').trim();
    const smtp_port = Number(body.smtp_port) || 587;

    if (!smtp_user || !smtp_password) {
      return res.status(400).json({
        success: false,
        error: 'Both Gmail address and 16-digit App Password are required.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port,
      secure: smtp_port === 465,
      auth: {
        user: smtp_user,
        pass: smtp_password
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    });

    await transporter.verify();

    return res.status(200).json({
      success: true,
      message: `SMTP connection verified successfully for ${smtp_user}! Ready to dispatch Round 2 access codes.`
    });
  } catch (err) {
    console.error('SMTP test error:', err);
    return res.status(200).json({
      success: false,
      error: `SMTP Authentication / Connection Error: ${err.message || String(err)}`
    });
  }
}
