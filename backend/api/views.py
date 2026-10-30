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
    return JsonResponse({"success": False, "error": "This legacy endpoint is disabled. Use the authenticated Vercel API."}, status=410)

@csrf_exempt
def send_codespark_emails(request):
    return JsonResponse({"success": False, "error": "This legacy endpoint is disabled. Use the authenticated Vercel API."}, status=410)
