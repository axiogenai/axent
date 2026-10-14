"""
URL configuration for backend project.
"""
from django.contrib import admin
from django.urls import path
from api.views import api_root, health_check, system_info

urlpatterns = [
    path('', api_root, name='api-root'),
    path('api/health/', health_check, name='api-health'),
    path('api/system-info/', system_info, name='api-system-info'),
    path('admin/', admin.site.urls),
]
