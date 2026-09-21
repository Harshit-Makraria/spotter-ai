"""The trip planning API."""

from __future__ import annotations

import logging

from django.db import DatabaseError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .models import Trip
from .serializers import TripRequestSerializer, TripSummarySerializer
from .services.geo import GeoError
from .services.hos import InfeasibleTrip
from .services.planner import plan_from_locations, serialise

log = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Turn service-layer errors into clean, actionable API responses."""
    if isinstance(exc, GeoError):
        return Response(
            {"error": "location_error", "detail": str(exc)},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if isinstance(exc, InfeasibleTrip):
        return Response(
            {"error": "infeasible_trip", "detail": str(exc)},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    response = exception_handler(exc, context)
    if response is None:
        log.exception("Unhandled API error", exc_info=exc)
        return Response(
            {
                "error": "server_error",
                "detail": "Something went wrong while planning the trip.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return response


@api_view(["GET"])
def health(_request):
    """Liveness probe, also used by the keep-warm ping."""
    return Response({"status": "ok"})


@api_view(["POST"])
def plan_trip_view(request):
    """Plan a trip and return the route, the stops and the daily log sheets."""
    serializer = TripRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    trip = plan_from_locations(
        current_location=data["current_location"],
        pickup_location=data["pickup_location"],
        dropoff_location=data["dropoff_location"],
        cycle_hours_used=data["cycle_hours_used"],
        start_time=data["start_time"],
        avg_speed_mph=data["avg_speed_mph"],
        cycle_limit_hours=data["cycle_limit_hours"],
        include_inspections=data["include_inspections"],
    )
    payload = serialise(trip)

    # Persistence is a convenience, never a reason to fail a good plan.
    try:
        record = Trip.objects.create(
            current_location=data["current_location"],
            pickup_location=data["pickup_location"],
            dropoff_location=data["dropoff_location"],
            cycle_hours_used=data["cycle_hours_used"],
            start_time=data["start_time"],
            avg_speed_mph=data["avg_speed_mph"],
            cycle_limit_hours=data["cycle_limit_hours"],
            include_inspections=data["include_inspections"],
            payload=payload,
            total_miles=payload["summary"]["total_miles"],
            driving_hours=payload["summary"]["driving_hours"],
            log_day_count=len(payload["log_days"]),
        )
        payload["share_id"] = record.share_id
    except DatabaseError:
        log.exception("Could not persist trip; returning the plan anyway")
        payload["share_id"] = None

    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def trip_detail(_request, share_id: str):
    """Reload a previously planned trip by its permalink."""
    try:
        trip = Trip.objects.get(share_id=share_id)
    except Trip.DoesNotExist:
        return Response(
            {"error": "not_found", "detail": "No trip with that link."},
            status=status.HTTP_404_NOT_FOUND,
        )

    payload = dict(trip.payload)
    payload["share_id"] = trip.share_id
    return Response(payload)


@api_view(["GET"])
def recent_trips(_request):
    """The handful of most recent plans, for the examples rail."""
    trips = Trip.objects.all()[:8]
    return Response({"results": TripSummarySerializer(trips, many=True).data})
