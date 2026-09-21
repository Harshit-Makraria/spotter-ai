"""Persisted trips, so every plan has a shareable permalink."""

from __future__ import annotations

import secrets

from django.db import models


def make_share_id() -> str:
    """A short, unguessable, URL-safe identifier."""
    return secrets.token_urlsafe(8)


class Trip(models.Model):
    share_id = models.CharField(
        max_length=16, unique=True, db_index=True, default=make_share_id
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # --- inputs, exactly as the brief specifies them ---
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    cycle_hours_used = models.FloatField()

    start_time = models.DateTimeField()
    avg_speed_mph = models.FloatField(default=55.0)
    cycle_limit_hours = models.PositiveSmallIntegerField(default=70)
    include_inspections = models.BooleanField(default=False)

    # --- computed output, cached so a permalink is instant and stable ---
    payload = models.JSONField()
    total_miles = models.FloatField(default=0)
    driving_hours = models.FloatField(default=0)
    log_day_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self) -> str:
        return f"{self.pickup_location} → {self.dropoff_location} ({self.share_id})"
