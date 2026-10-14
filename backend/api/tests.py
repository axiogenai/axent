from django.test import TestCase
from django.urls import reverse


class PublicHealthEndpointTests(TestCase):
    def test_health_endpoint_returns_healthy_json(self):
        response = self.client.get(reverse("api-health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")
        self.assertEqual(response.json()["service"], "axent-backend")

    def test_system_info_lists_supported_exam_modes(self):
        response = self.client.get(reverse("api-system-info"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("MCQ", response.json()["supported_modes"])
        self.assertIn("CODING", response.json()["supported_modes"])

    def test_root_endpoint_identifies_service(self):
        response = self.client.get(reverse("api-root"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "Axent Cloud Examination Platform Backend")
