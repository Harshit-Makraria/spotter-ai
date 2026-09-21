"""Request validation for the trip planning API."""

from __future__ import annotations

from datetime import datetime

from rest_framework import serializers

from .models import Trip


class TripRequestSerializer(serializers.Serializer):
    """The four inputs from the brief, plus optional planning assumptions."""

    current_location = serializers.CharField(max_length=255, trim_whitespace=True)
    pickup_location = serializers.CharField(max_length=255, trim_whitespace=True)
    dropoff_location = serializers.CharField(max_length=255, trim_whitespace=True)
    cycle_hours_used = serializers.FloatField(min_value=0, max_value=70)

    start_time = serializers.DateTimeField(required=False)
    avg_speed_mph = serializers.FloatField(
        required=False, min_value=25, max_value=75, default=55.0
    )
    cycle_limit_hours = serializers.ChoiceField(
        choices=[60, 70], required=False, default=70
    )
    include_inspections = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        limit = attrs.get("cycle_limit_hours", 70)
        used = attrs["cycle_hours_used"]
        if used > limit:
            raise serializers.ValidationError(
                {
                    "cycle_hours_used": (
                        f"Cannot exceed the {limit}-hour cycle limit."
                    )
                }
            )
        attrs.setdefault("start_time", datetime.now().replace(second=0, microsecond=0))
        # Logs are kept in home-terminal local time, so drop any incoming offset.
        if attrs["start_time"].tzinfo is not None:
            attrs["start_time"] = attrs["start_time"].replace(tzinfo=None)
        return attrs


class TripSummarySerializer(serializers.ModelSerializer):
    """Compact shape for the 'recent trips' list."""

    class Meta:
        model = Trip
        fields = (
            "share_id",
            "created_at",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "cycle_hours_used",
            "total_miles",
            "driving_hours",
            "log_day_count",
        )
