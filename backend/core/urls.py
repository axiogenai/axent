"""
URL configuration for backend project.
"""
from django.contrib import admin
from django.urls import path
from api.views import api_root, health_check, system_info, test_smtp, send_codespark_emails

urlpatterns = [
    path('', api_root, name='api-root'),
    path('api/health/', health_check, name='api-health'),
    path('api/system-info/', system_info, name='api-system-info'),
    path('api/codespark/test-smtp/', test_smtp, name='api-codespark-test-smtp'),
    path('api/codespark/send-emails/', send_codespark_emails, name='api-codespark-send-emails'),
    path('admin/', admin.site.urls),
]
