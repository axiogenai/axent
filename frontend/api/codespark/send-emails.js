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
    const smtp_from_name = String(body.smtp_from_name || 'CodeSpark 2026 Examination Authority').trim();
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    if (!smtp_user || !smtp_password) {
      return res.status(400).json({
        success: false,
        error: 'Gmail address (smtp_user) and 16-digit App Password (smtp_password) are required.'
      });
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipients provided for dispatch.'
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
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000
    });

    const sent = [];
    const failed = [];

    for (const r of recipients) {
      const name = String(r.name || 'Candidate').trim();
      const email = String(r.email || '').trim();
      const roll = String(r.rollNumber || r.accessKey || '').trim();
      const r2Key = String(r.round2Key || '').trim();
      const score = r.round1Score !== undefined ? r.round1Score : '—';
      const maxScore = r.round1MaxScore !== undefined ? r.round1MaxScore : '—';
      const examUrl = String(r.examUrl || 'https://axent.axiogen.in/codespark').trim();

      if (!email || !email.includes('@')) {
        failed.push({ email, name, reason: 'Invalid or missing email address' });
        continue;
      }

      const textBody = `Hello ${name},

Congratulations! You have been shortlisted for Round 2 of CodeSpark 2026: Algorithmic Code Sprint Arena.

Candidate: ${name}
Access Key / Roll: ${roll}
Round 1 Score: ${score} / ${maxScore}

YOUR OFFICIAL ROUND 2 ACCESS KEY: ${r2Key}

Direct Access URL: ${examUrl}

Instructions:
1. Navigate to the CodeSpark Examination Portal: ${examUrl}
2. Enter your 4-digit or dedicated Round 2 access key: ${r2Key}
3. Fullscreen proctoring and real-time CCTV monitoring will be active.

Best regards,
CodeSpark 2026 Examination Authority
Axent Platform (axent.axiogen.in)`;

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CodeSpark 2026 - Round 2 Clearance</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #121214; border: 1px solid #27272a; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #27272a;">
              <span style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #ea1a1c; font-weight: 700;">CodeSpark 2026 &bull; Official Clearance</span>
              <h1 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">Round 2 Shortlist Qualification</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #d4d4d8;">
                Dear <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                Congratulations! Based on your performance in the Round 1 Cognitive Assessment (Score: <strong style="color: #ffffff;">${score} / ${maxScore}</strong>), you have successfully qualified for <strong>Round 2: Algorithmic Code Sprint</strong>.
              </p>
              
              <!-- Key Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border: 1px solid #3f3f46; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #a1a1aa; margin-bottom: 8px;">Your Official Round 2 Access Key</div>
                    <div style="font-family: monospace; font-size: 26px; font-weight: 800; color: #ea1a1c; letter-spacing: 0.08em;">${r2Key}</div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${examUrl}" target="_blank" style="display: inline-block; padding: 12px 32px; background-color: #ea1a1c; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; border-radius: 6px; letter-spacing: 0.04em;">ENTER ROUND 2 ARENA &rarr;</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #71717a;">
                <strong>Exam Arena Instructions:</strong> Ensure you are seated at your assigned arena workstation. Fullscreen proctoring and real-time telemetry verification will be in effect.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0c0c0e; border-top: 1px solid #27272a; text-align: center; font-size: 11px; color: #52525b;">
              CodeSpark 2026 Autonomous Examination System &bull; Axent Academic Platform (<a href="https://axent.axiogen.in" style="color: #71717a; text-decoration: none;">axent.axiogen.in</a>)
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        await transporter.sendMail({
          from: `"${smtp_from_name}" <${smtp_user}>`,
          to: `"${name}" <${email}>`,
          subject: `CodeSpark 2026: Round 2 Shortlist Clearance & Access Code [${r2Key}]`,
          text: textBody,
          html: htmlBody
        });
        sent.push({ email, name, round2Key: r2Key });
      } catch (sendErr) {
        console.error(`Failed to send email to ${email}:`, sendErr);
        failed.push({ email, name, reason: sendErr.message || String(sendErr) });
      }
    }

    return res.status(200).json({
      success: sent.length > 0,
      total: recipients.length,
      sent_count: sent.length,
      failed_count: failed.length,
      sent,
      failed
    });
  } catch (err) {
    console.error('Send emails error:', err);
    return res.status(500).json({
      success: false,
      error: `Server error during email dispatch: ${err.message || String(err)}`
    });
  }
}
