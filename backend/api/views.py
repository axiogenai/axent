from django.http import JsonResponse
import time

def api_root(request):
    return JsonResponse({
        "service": "Axent Cloud Examination Platform Backend",
        "status": "operational",
        "version": "2.4.0",
        "architecture": "Supabase PostgreSQL Database + Render Python Service + Vercel SPA",
        "endpoints": {
            "root": "/",
            "health": "/api/health/",
            "system_info": "/api/system-info/"
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
