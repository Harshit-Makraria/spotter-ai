"""Routes for the trips API."""

from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("trips/", views.plan_trip_view, name="plan-trip"),
    path("trips/recent/", views.recent_trips, name="recent-trips"),
    path("trips/<str:share_id>/", views.trip_detail, name="trip-detail"),
]
