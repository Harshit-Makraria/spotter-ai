"""Project URL configuration."""

from django.http import JsonResponse
from django.urls import include, path


def index(_request):
    return JsonResponse(
        {
            "service": "ELD Trip Planner API",
            "docs": "/api/health/",
            "endpoints": ["/api/trips/", "/api/trips/<share_id>/", "/api/health/"],
        }
    )


urlpatterns = [
    path("", index),
    path("api/", include("trips.urls")),
]
