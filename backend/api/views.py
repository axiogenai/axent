from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import time
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

def api_root(request):
    return JsonResponse({
        "service": "Axent Cloud Examination Platform Backend",
        "status": "operational",
        "version": "2.4.0",
        "architecture": "Supabase PostgreSQL Database + Render Python Service + Vercel SPA",
        "endpoints": {
            "root": "/",
            "health": "/api/health/",
            "system_info": "/api/system-info/",
            "test_smtp": "/api/codespark/test-smtp/",
            "send_emails": "/api/codespark/send-emails/"
        },
        "timestamp": int(time.time())
    })

def health_check(request):
    return JsonResponse({
        "status": "healthy",
        "service": "axent-backend",
        "uptime": "active",
        "timestamp": int(time.time())
    })

def system_info(request):
    return JsonResponse({
        "engine": "Axent Autonomous Examination Engine",
        "proctoring_protocol": "Real-Time Cloud Telemetry Bus",
        "supported_modes": ["MCQ", "CODING", "HYBRID"],
        "telemetry_sync": "Supabase Realtime + Edge Broadcast",
        "timestamp": int(time.time())
    })

@csrf_exempt
def test_smtp(request):
    if request.method != 'POST':
        return JsonResponse({"success": False, "error": "POST method required."}, status=405)
    
    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception as e:
        return JsonResponse({"success": False, "error": f"Invalid JSON body: {str(e)}"}, status=400)
    
    smtp_user = str(body.get('smtp_user', '')).strip()
    smtp_password = str(body.get('smtp_password', '')).replace(' ', '').strip()
    smtp_host = str(body.get('smtp_host', 'smtp.gmail.com')).strip()
    smtp_port = int(body.get('smtp_port', 587))
    
    if not smtp_user or not smtp_password:
        return JsonResponse({
            "success": False,
            "error": "Both Gmail address (smtp_user) and 16-digit App Password (smtp_password) are required."
        }, status=400)
    
    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.quit()
        return JsonResponse({
            "success": True,
            "message": f"SMTP authentication successful for {smtp_user}! Ready to dispatch Round 2 access codes."
        })
    except smtplib.SMTPAuthenticationError:
        return JsonResponse({
            "success": False,
            "error": "Authentication Failed: Gmail rejected credentials. Ensure 2-Step Verification is ON and you are using a 16-character Google App Password (not your account password)."
        }, status=200)
    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": f"SMTP Connection Error: {str(e)}"
        }, status=200)

@csrf_exempt
def send_codespark_emails(request):
    if request.method != 'POST':
        return JsonResponse({"success": False, "error": "POST method required."}, status=405)
    
    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception as e:
        return JsonResponse({"success": False, "error": f"Invalid JSON body: {str(e)}"}, status=400)
    
    smtp_user = str(body.get('smtp_user', '')).strip()
    smtp_password = str(body.get('smtp_password', '')).replace(' ', '').strip()
    smtp_host = str(body.get('smtp_host', 'smtp.gmail.com')).strip()
    smtp_port = int(body.get('smtp_port', 587))
    smtp_from_name = str(body.get('smtp_from_name', 'CodeSpark 2026 Examination Authority')).strip()
    recipients = body.get('recipients', [])
    
    if not smtp_user or not smtp_password:
        return JsonResponse({
            "success": False,
            "error": "Gmail address (smtp_user) and 16-digit App Password (smtp_password) are required."
        }, status=400)
        
    if not isinstance(recipients, list) or len(recipients) == 0:
        return JsonResponse({
            "success": False,
            "error": "No shortlisted recipients provided for dispatch."
        }, status=400)
    
    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_password)
    except smtplib.SMTPAuthenticationError:
        return JsonResponse({
            "success": False,
            "error": "Authentication Failed: Gmail rejected credentials. Verify your 16-digit App Password."
        }, status=200)
    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": f"Failed to connect to SMTP server: {str(e)}"
        }, status=200)
    
    sent_list = []
    failed_list = []
    
    for r in recipients:
        r_name = str(r.get('name', 'Candidate')).strip()
        r_email = str(r.get('email', '')).strip()
        r_roll = str(r.get('rollNumber', '')).strip()
        r_r2_key = str(r.get('round2Key', '')).strip()
        r_score = r.get('round1Score', 'N/A')
        r_max_score = r.get('round1MaxScore', 'N/A')
        exam_url = str(r.get('examUrl', 'http://localhost:4000/codespark-exams?round=2')).strip()
        
        if not r_email or '@' not in r_email:
            failed_list.append({"email": r_email, "name": r_name, "reason": "Missing or invalid email address"})
            continue
            
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"CodeSpark 2026: Round 2 Shortlist Clearance & Access Code [{r_r2_key}]"
            msg['From'] = formataddr((smtp_from_name, smtp_user))
            msg['To'] = formataddr((r_name, r_email))
            
            text_body = f"""Hello {r_name},

Congratulations! You have been shortlisted for Round 2 of CodeSpark 2026: Algorithmic Code Sprint Arena.

Candidate: {r_name}
Roll Number / USN: {r_roll}
Round 1 Score: {r_score} / {r_max_score}

YOUR OFFICIAL ROUND 2 ACCESS KEY: {r_r2_key}

Direct Access URL: {exam_url}

Instructions:
1. Ensure you are seated at your assigned workstation.
2. Visit the examination portal and enter your Round 2 key.
3. Fullscreen proctoring and real-time CCTV monitoring will be active.

Best regards,
CodeSpark 2026 Examination Authority
Axent Academic Platform
"""
            
            html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CodeSpark 2026 - Round 2 Clearance</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #121214; border: 1px solid #27272a; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px 32px; background-color: #050505; border-bottom: 2px solid #ea1a1c;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div style="font-size: 11px; font-weight: 800; font-family: monospace; color: #ea1a1c; letter-spacing: 0.12em; text-transform: uppercase;">AXENT ACADEMIC &bull; CODESPARK 2026</div>
              <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">Round 2 Shortlist Clearance</h1>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    
    <tr>
      <td style="padding: 32px;">
        <p style="margin: 0 0 16px 0; font-size: 15px; color: #f4f4f5; line-height: 1.5;">
          Dear <strong>{r_name}</strong>,
        </p>
        <p style="margin: 0 0 24px 0; font-size: 13.5px; color: #a1a1aa; line-height: 1.6;">
          Congratulations! Following the combined evaluation of Round 1 (Cognitive Aptitude &amp; Reasoning) across all laboratories, you have successfully cleared the institutional cutoff and have been <strong>officially shortlisted for Round 2: Algorithmic Code Sprint Arena</strong>.
        </p>
        
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border: 1px solid #3f3f46; border-radius: 6px; margin: 0 0 28px 0;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Your Private Round 2 Access Key</div>
              <div style="font-family: monospace; font-size: 26px; font-weight: 800; color: #ffffff; background-color: #09090b; border: 1px solid #ea1a1c; padding: 10px 20px; display: inline-block; letter-spacing: 0.15em; border-radius: 4px;">
                {r_r2_key}
              </div>
              <div style="margin-top: 12px; font-size: 12px; color: #71717a; font-family: monospace;">
                Candidate Roll: <strong style="color: #e4e4e7;">{r_roll}</strong> &bull; Round 1 Score: <strong style="color: #10b981;">{r_score}/{r_max_score}</strong>
              </div>
            </td>
          </tr>
        </table>
        
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
          <tr>
            <td align="center">
              <a href="{exam_url}" style="background-color: #ea1a1c; color: #ffffff; text-decoration: none; padding: 13px 28px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 4px; display: inline-block;">
                Enter Round 2 Coding Arena &rarr;
              </a>
            </td>
          </tr>
        </table>
        
        <div style="background-color: #09090b; border-left: 3px solid #3b82f6; padding: 14px 16px; border-radius: 0 4px 4px 0; margin-bottom: 24px;">
          <strong style="font-size: 12px; color: #ffffff; display: block; margin-bottom: 4px;">Important Examination Instructions:</strong>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #a1a1aa; line-height: 1.6;">
            <li>Keep this access key confidential. It is bound specifically to your candidate record.</li>
            <li>Take your seat at your assigned workstation before unlocking the arena.</li>
            <li>Autonomous proctoring and CCTV screen surveillance will be live during the session.</li>
          </ul>
        </div>
        
        <p style="margin: 0; font-size: 12px; color: #71717a;">
          Best of luck,<br>
          <strong style="color: #a1a1aa;">CodeSpark 2026 Examination Authority</strong><br>
          Axent Autonomous Examination Platform
        </p>
      </td>
    </tr>
    
    <tr>
      <td style="padding: 16px 32px; background-color: #050505; border-top: 1px solid #27272a; text-align: center; font-size: 11px; color: #52525b; font-family: monospace;">
        ISO-27001 AUDIT COMPLIANT &bull; AUTOMATED CONTEST DISPATCH SYSTEM
      </td>
    </tr>
  </table>
</body>
</html>
"""
            msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))
            
            server.sendmail(smtp_user, [r_email], msg.as_string())
            sent_list.append({"email": r_email, "name": r_name, "key": r_r2_key})
        except Exception as send_err:
            failed_list.append({"email": r_email, "name": r_name, "reason": str(send_err)})
            
    try:
        server.quit()
    except Exception:
        pass
        
    return JsonResponse({
        "success": True,
        "total": len(recipients),
        "sentCount": len(sent_list),
        "failedCount": len(failed_list),
        "sent": sent_list,
        "failed": failed_list
    })
