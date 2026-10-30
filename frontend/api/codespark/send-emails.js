import nodemailer from "nodemailer";
import { escapeHtml, getCodeSparkRosterConfig, readBody, requireAdmin, setApiHeaders, smtpConfiguration } from "./_security.js";

export const config = { maxDuration: 60 };

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const smtp = smtpConfiguration();
  if (!smtp) return res.status(503).json({ success: false, error: "SMTP is not configured on the server. Configure SMTP_USER and SMTP_PASSWORD." });

  // Handle SMTP connection verification / test without extra serverless function
  if (req.query?.action === "test" || req.query?.mode === "test" || req.body?.action === "test") {
    try {
      const testTransporter = nodemailer.createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 12000
      });
      await testTransporter.verify();
      return res.status(200).json({ success: true, message: "Server SMTP connection verified successfully." });
    } catch (error) {
      console.error("[CodeSpark SMTP] verification failed:", error?.code || "SMTP_ERROR");
      return res.status(502).json({ success: false, error: "SMTP verification failed. Check the server-side SMTP configuration." });
    }
  }

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
  let rosterConfig;
  try {
    rosterConfig = await getCodeSparkRosterConfig();
  } catch {
    return res.status(503).json({ success: false, error: "The verified candidate roster is unavailable." });
  }
  if (!rosterConfig || !Array.isArray(rosterConfig.candidates)) {
    return res.status(503).json({ success: false, error: "The verified candidate roster is unavailable." });
  }

  const sent = [];
  const failed = [];

  const sendOne = async (recipient) => {
    const requestedEmail = String(recipient?.email || "").trim().toLowerCase();
    const requestedRoll = String(recipient?.rollNumber || recipient?.accessKey || "").trim().toUpperCase().slice(0, 80);
    const matchedByEmail = requestedEmail
      ? rosterConfig.candidates.find((candidate) => String(candidate.email || "").trim().toLowerCase() === requestedEmail)
      : null;
    const matchedByRoll = requestedRoll
      ? rosterConfig.candidates.find((candidate) => String(candidate.rollNumber || "").trim().toUpperCase() === requestedRoll)
      : null;
    const matchedCandidate = matchedByEmail && matchedByRoll && matchedByEmail.accessKey !== matchedByRoll.accessKey
      ? null
      : matchedByEmail || matchedByRoll;
    const name = String(matchedCandidate?.name || recipient?.name || "Candidate").trim().slice(0, 120);
    const email = String(matchedCandidate?.email || requestedEmail).trim().toLowerCase();
    const roll = String(matchedCandidate?.rollNumber || requestedRoll).trim().slice(0, 80);
    const key = String(matchedCandidate?.round2Key || "").trim().slice(0, 80);
    if (!matchedCandidate || !(matchedCandidate.isShortlisted || matchedCandidate.status === "SHORTLISTED")) {
      failed.push({ email, name, reason: "Candidate is not present on the verified Round 2 shortlist." });
      return;
    }
    const configuredPublicUrl = String(process.env.APP_PUBLIC_URL || "https://axent.axiogen.in").replace(/\/$/, "");
    const examUrl = String(recipient?.examUrl || `${configuredPublicUrl}/code-spark`).trim();
    let parsedUrl;
    let publicHost = "";
    try { publicHost = new URL(configuredPublicUrl).hostname; parsedUrl = new URL(examUrl); } catch {}
    const allowedHosts = new Set([publicHost, "axent.axiogen.in", "axent-tau.vercel.app"].filter(Boolean));
    const secureKeySuffix = key.toUpperCase().replace(/^AXENT-R2-/, "");
    if (!validEmail(email) || secureKeySuffix.length < 8 || !parsedUrl || parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
      failed.push({ email, name, reason: "Invalid recipient details or access URL." });
      return;
    }

    const safeName = escapeHtml(name);
    const safeRoll = escapeHtml(roll);
    const safeKey = escapeHtml(key);
    
    // Construct direct 1-click arena entry URL with embedded key parameter
    let safeUrlWithKey = escapeHtml(parsedUrl.toString());
    try {
      const urlWithKey = new URL(parsedUrl.toString());
      urlWithKey.searchParams.set("key", key);
      safeUrlWithKey = escapeHtml(urlWithKey.toString());
    } catch {
      safeUrlWithKey = escapeHtml(parsedUrl.toString());
    }
    const safeBaseUrl = escapeHtml(parsedUrl.toString());
    const score = escapeHtml(matchedCandidate.round1Score ?? "—");
    const maxScore = escapeHtml(matchedCandidate.round1MaxScore ?? "—");

    const textBody = `Hello ${name},

Congratulations! You have been shortlisted for Round 2 of CodeSpark 2026.

Candidate Name: ${name}
Candidate Roll: ${roll}
Round 1 Score: ${matchedCandidate.round1Score ?? "—"} / ${matchedCandidate.round1MaxScore ?? "—"} Marks
Round 2 Status: QUALIFIED // SHORTLISTED

YOUR ROUND 2 ACCESS KEY:
${key}

Enter the Round 2 Coding Arena directly:
${safeUrlWithKey}

Important Guidelines:
- Round 2 is an algorithmic code sprint featuring 5 multi-tier challenges.
- Supported languages: Python 3, C++17, C11, Java 13+.
- Fullscreen mode and tab-switch proctoring are strictly monitored.

CodeSpark 2026 Examination Authority
Axent Academic Platform · Axiogen Cloud Infrastructure`;

    const htmlBody = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>CodeSpark 2026 · Round 2 Shortlist Clearance</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100% !important; background-color: #09090b; }
    @media only screen and (max-width: 600px) {
      .outer-container { padding: 12px 8px !important; }
      .main-card { padding: 22px 16px !important; border-radius: 8px !important; }
      .header-title { font-size: 20px !important; line-height: 26px !important; }
      .stat-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; padding-left: 0 !important; padding-right: 0 !important; margin-bottom: 6px !important; }
      .key-box { padding: 14px 10px !important; }
      .key-text { font-size: 15px !important; letter-spacing: 0.5px !important; word-break: break-all !important; }
      .cta-btn { display: block !important; width: 100% !important; padding: 14px 16px !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f4f4f5;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #09090b; width: 100%;">
    <tr>
      <td align="center" class="outer-container" style="padding: 32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto;">
          
          <!-- Brand Badge Header -->
          <tr>
            <td style="padding-bottom: 16px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #18181b; border: 1px solid #27272a; border-radius: 4px; padding: 5px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; font-weight: 700; color: #a1a1aa; letter-spacing: 1.5px; text-transform: uppercase;">
                    <span style="display: inline-block; width: 6px; height: 6px; background-color: #ef4444; border-radius: 50%; margin-right: 6px; vertical-align: middle;"></span>
                    CODESPARK 2026 // OFFICIAL CLEARANCE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td class="main-card" style="background-color: #121214; border: 1px solid #27272a; border-radius: 10px; padding: 32px 28px; text-align: left;">
              
              <!-- Heading -->
              <h1 class="header-title" style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 30px;">
                Round 2 Shortlist Qualification
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #a1a1aa; line-height: 18px;">
                Algorithmic Code Sprint Arena · Official Candidate Access Pass
              </p>

              <!-- Salutation -->
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #e4e4e7; line-height: 22px;">
                Dear <strong style="color: #ffffff;">${safeName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #d4d4d8; line-height: 22px;">
                Congratulations! Based on your performance in the Round 1 Aptitude Examination, you have successfully cleared the institutional cutoff and have been <strong style="color: #10b981;">shortlisted for Round 2</strong>.
              </p>

              <!-- Candidate Record Grid Table -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td class="stat-cell" width="50%" style="padding: 4px 8px 4px 0; vertical-align: top;">
                          <div style="font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, monospace; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">Candidate Name</div>
                          <div style="font-size: 13px; font-weight: 700; color: #f4f4f5; margin-top: 2px;">${safeName}</div>
                        </td>
                        <td class="stat-cell" width="50%" style="padding: 4px 0 4px 8px; vertical-align: top;">
                          <div style="font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, monospace; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">Candidate Roll</div>
                          <div style="font-size: 13px; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 700; color: #f4f4f5; margin-top: 2px;">${safeRoll}</div>
                        </td>
                      </tr>
                      <tr>
                        <td class="stat-cell" width="50%" style="padding: 12px 8px 4px 0; vertical-align: top; border-top: 1px solid #27272a;">
                          <div style="font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, monospace; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">Round 1 Score</div>
                          <div style="font-size: 14px; font-weight: 800; color: #10b981; margin-top: 2px;">${score} / ${maxScore} <span style="font-size: 11px; font-weight: 500; color: #71717a;">Marks</span></div>
                        </td>
                        <td class="stat-cell" width="50%" style="padding: 12px 0 4px 8px; vertical-align: top; border-top: 1px solid #27272a;">
                          <div style="font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, monospace; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">Status</div>
                          <div style="margin-top: 2px;">
                            <span style="display: inline-block; padding: 2px 7px; background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 4px; font-size: 11px; font-weight: 700; color: #10b981; font-family: ui-monospace, monospace;">
                              QUALIFIED // SHORTLISTED
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Access Key Monospace Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0c0c0e; border: 1px solid #3f3f46; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td class="key-box" style="padding: 20px 16px; text-align: center;">
                    <div style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10.5px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">
                      YOUR DEDICATED ROUND 2 ACCESS KEY
                    </div>
                    <div class="key-text" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 1px; word-break: break-all; overflow-wrap: anywhere; line-height: 1.4; padding: 10px 14px; background-color: #18181b; border: 1px solid #27272a; border-radius: 4px; display: inline-block; max-width: 100%; box-sizing: border-box;">
                      ${safeKey}
                    </div>
                    <div style="font-size: 11px; color: #71717a; margin-top: 10px; line-height: 15px;">
                      This access key is strictly unique to your candidate seat. Keep it confidential.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${safeUrlWithKey}" target="_blank" class="cta-btn" style="display: block; width: 100%; padding: 15px 24px; background-color: #dc2626; color: #ffffff; text-align: center; text-decoration: none; font-size: 13.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box;">
                      ENTER ROUND 2 CODING ARENA &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Examination Guidelines & Technical Rules -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #27272a; padding-top: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                      Important Arena Instructions:
                    </div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #a1a1aa; line-height: 20px;">
                      <li>Round 2 is an algorithmic coding sprint featuring 5 multi-tier programming challenges.</li>
                      <li>Supported programming languages: <strong style="color: #e4e4e7;">Python 3, C++17, C11, Java 13+</strong>.</li>
                      <li>Run interactive test cases using the custom stdin terminal before final submission.</li>
                      <li>Fullscreen proctoring and tab-switch detection are active throughout the assessment.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Direct URL Fallback -->
              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #1f1f23; font-size: 11px; color: #71717a; line-height: 16px; word-break: break-all;">
                Direct arena access link: <br />
                <a href="${safeUrlWithKey}" style="color: #a1a1aa; text-decoration: underline;">${safeUrlWithKey}</a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 8px 12px 8px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11.5px; color: #71717a; font-family: ui-monospace, SFMono-Regular, monospace;">
                CodeSpark 2026 Examination Authority · Axent Academic Platform
              </p>
              <p style="margin: 0; font-size: 10.5px; color: #52525b;">
                Autonomous CCTV &amp; Invigilation Engine Powered by Axiogen Cloud.
              </p>
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
  };

  let nextRecipient = 0;
  await Promise.all(Array.from({ length: Math.min(8, recipients.length) }, async () => {
    while (nextRecipient < recipients.length) {
      const index = nextRecipient++;
      await sendOne(recipients[index]);
    }
  }));

  return res.status(sent.length ? 200 : 502).json({
    success: failed.length === 0,
    total: recipients.length,
    sent_count: sent.length,
    failed_count: failed.length,
    sent,
    failed
  });
}
