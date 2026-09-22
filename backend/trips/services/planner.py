"""
Turn the four trip inputs into a routed, HOS-compliant plan.

This is the seam between the network-facing map services and the pure
regulatory simulator: it geocodes the locations, asks for a truck route,
hands the leg distances to the HOS engine, then labels every resulting
duty-status change with the place it happened.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from . import geo
from .hos import (
    DEFAULT_AVG_SPEED_MPH,
    STOP_KINDS,
    DutyStatus,
    EventKind,
    Plan,
    PlanInput,
    build_legs,
    plan_trip,
)
from .logsheets import LogDay, build_log_days

#: Friendly wording for the itinerary and the map popups.
STOP_TITLES = {
    EventKind.PRETRIP: "Pre-trip inspection",
    EventKind.POSTTRIP: "Post-trip inspection",
    EventKind.PICKUP: "Pickup",
    EventKind.DROPOFF: "Drop-off",
    EventKind.FUEL: "Fuel stop",
    EventKind.BREAK_30: "30-minute break",
    EventKind.REST_10: "10-hour reset",
    EventKind.RESTART_34: "34-hour restart",
}


@dataclass
class PlannedTrip:
    places: dict[str, geo.Place]
    route: geo.Route
    plan: Plan
    log_days: list[LogDay]
    inputs: dict


def plan_from_locations(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    cycle_hours_used: float,
    start_time: datetime,
    *,
    avg_speed_mph: float = DEFAULT_AVG_SPEED_MPH,
    cycle_limit_hours: int = 70,
    include_inspections: bool = False,
) -> PlannedTrip:
    current = geo.geocode(current_location)
    pickup = geo.geocode(pickup_location)
    dropoff = geo.geocode(dropoff_location)

    route = geo.build_route([current, pickup, dropoff])

    # Prefer the routing provider's own per-leg distances; fall back to an even
    # split only if the provider did not break the route down.
    if len(route.legs) >= 2:
        to_pickup = route.legs[0].distance_miles
        to_dropoff = sum(leg.distance_miles for leg in route.legs[1:])
    else:
        to_pickup = route.distance_miles / 2
        to_dropoff = route.distance_miles - to_pickup

    plan = plan_trip(
        PlanInput(
            start_time=start_time,
            cycle_hours_used=cycle_hours_used,
            legs=build_legs(to_pickup, to_dropoff),
            cycle_limit_hours=cycle_limit_hours,
            avg_speed_mph=avg_speed_mph,
            include_inspections=include_inspections,
        )
    )

    _label_segments(plan, route, current, pickup, dropoff)
    _name_departures(route, [current, pickup])

    log_days = build_log_days(
        plan.segments,
        cycle_limit_hours=cycle_limit_hours,
        cycle_days=8 if cycle_limit_hours == 70 else 7,
        # Carrying the driver's pre-trip history through means the recap box on
        # each sheet shows the true rolling cycle, not just this trip's hours.
        daily_on_duty=plan.daily_on_duty,
    )

    return PlannedTrip(
        places={"current": current, "pickup": pickup, "dropoff": dropoff},
        route=route,
        plan=plan,
        log_days=log_days,
        inputs={
            "current_location": current_location,
            "pickup_location": pickup_location,
            "dropoff_location": dropoff_location,
            "cycle_hours_used": cycle_hours_used,
            "start_time": start_time.isoformat(),
            "avg_speed_mph": avg_speed_mph,
            "cycle_limit_hours": cycle_limit_hours,
            "include_inspections": include_inspections,
        },
    )


def _label_segments(
    plan: Plan,
    route: geo.Route,
    current: geo.Place,
    pickup: geo.Place,
    dropoff: geo.Place,
) -> None:
    """Attach a coordinate and a place name to every segment.

    Known endpoints keep the name the driver typed; everything else is resolved
    from its mile offset along the route.
    """
    total = route.distance_miles or 1.0

    for seg in plan.segments:
        if seg.kind is EventKind.PICKUP:
            seg.lat, seg.lon, seg.location = pickup.lat, pickup.lon, pickup.name
            continue
        if seg.kind is EventKind.DROPOFF:
            seg.lat, seg.lon, seg.location = dropoff.lat, dropoff.lon, dropoff.name
            continue
        if seg.start_mile <= 0.05 and seg.kind is not EventKind.DRIVE:
            seg.lat, seg.lon, seg.location = current.lat, current.lon, current.name
            continue

        # A stop happens where the driver came to rest: the end of the drive.
        mile = min(seg.start_mile, total)
        try:
            seg.lat, seg.lon = route.point_at_mile(mile)
        except geo.GeoError:
            seg.lat, seg.lon = current.lat, current.lon

        if seg.kind in STOP_KINDS:
            seg.location = geo.describe_point(seg.lat, seg.lon)
        else:
            seg.location = ""

    # Drive segments take the name of where they began, so the log's remarks
    # column reads as a sequence of places.
    previous_place = current.name
    for seg in plan.segments:
        if seg.kind is EventKind.DRIVE:
            seg.location = previous_place
        elif seg.location:
            previous_place = seg.location


def _name_departures(route: geo.Route, origins: list[geo.Place]) -> None:
    """Start each leg's directions from the place the driver actually is."""
    for direction in route.directions:
        if direction["kind"] == "depart" and direction["leg"] < len(origins):
            direction["text"] = f"Depart {origins[direction['leg']].name}"


def serialise(trip: PlannedTrip) -> dict:
    """Shape a planned trip for the API and the React client."""
    plan, route = trip.plan, trip.route
    summary = plan.summary

    return {
        "inputs": trip.inputs,
        "places": {name: place.as_dict() for name, place in trip.places.items()},
        "route": {
            "distance_miles": route.distance_miles,
            "provider": route.provider,
            "geometry": route.geometry,
            "legs": [
                {
                    "distance_miles": leg.distance_miles,
                    "duration_hours": leg.duration_hours,
                }
                for leg in route.legs
            ],
            "directions": route.directions,
        },
        "summary": {
            "total_miles": summary.total_miles,
            "driving_hours": summary.driving_hours,
            "on_duty_hours": summary.on_duty_hours,
            "off_duty_hours": summary.off_duty_hours,
            "sleeper_hours": summary.sleeper_hours,
            "total_elapsed_hours": summary.total_hours,
            "start_time": summary.start_time.isoformat(),
            "end_time": summary.end_time.isoformat(),
            "cycle_hours_used_start": summary.cycle_hours_used_start,
            "cycle_hours_used_end": summary.cycle_hours_used_end,
            "cycle_hours_remaining_end": summary.cycle_hours_remaining_end,
            "fuel_stops": summary.fuel_stops,
            "rest_breaks": summary.rest_breaks,
            "daily_resets": summary.daily_resets,
            "restarts": summary.restarts,
            "log_days": summary.log_days,
        },
        "segments": [
            {
                "index": index,
                "status": seg.status.value,
                "kind": seg.kind.value,
                "title": STOP_TITLES.get(seg.kind, seg.label),
                "label": seg.label,
                "start": seg.start.isoformat(),
                "end": seg.end.isoformat(),
                "hours": round(seg.hours, 2),
                "miles": seg.miles,
                "start_mile": round(seg.start_mile, 1),
                "end_mile": round(seg.end_mile, 1),
                "location": seg.location,
                "lat": seg.lat,
                "lon": seg.lon,
            }
            for index, seg in enumerate(plan.segments)
        ],
        "stops": [
            {
                "index": index,
                "kind": seg.kind.value,
                "title": STOP_TITLES.get(seg.kind, seg.label),
                "label": seg.label,
                "start": seg.start.isoformat(),
                "end": seg.end.isoformat(),
                "hours": round(seg.hours, 2),
                "mile": round(seg.start_mile, 1),
                "location": seg.location,
                "lat": seg.lat,
                "lon": seg.lon,
            }
            for index, seg in enumerate(plan.segments)
            if seg.kind in STOP_KINDS
        ],
        "log_days": [
            {
                "date": day.day.isoformat(),
                "miles_driven": day.miles_driven,
                "total_on_duty_hours": day.total_on_duty_hours,
                "cycle_hours_used": day.cycle_hours_used,
                "cycle_hours_remaining": day.cycle_hours_remaining,
                "rolling_on_duty": {
                    str(days): hours for days, hours in day.rolling_on_duty.items()
                },
                "balanced": day.is_balanced(),
                "totals": {
                    status.value: round(day.totals[status] / 60, 2)
                    for status in DutyStatus
                },
                "entries": [
                    {
                        "status": entry.status.value,
                        "row": entry.row,
                        "start_minute": entry.start_minute,
                        "end_minute": entry.end_minute,
                        "kind": entry.kind.value,
                        "label": entry.label,
                        "location": entry.location,
                        "segment_index": entry.segment_index,
                    }
                    for entry in day.entries
                ],
                "remarks": [
                    {
                        "minute": remark.minute,
                        "location": remark.location,
                        "note": remark.note,
                        "kind": remark.kind.value,
                    }
                    for remark in day.remarks
                ],
            }
            for day in trip.log_days
        ],
        "compliance": {
            "feasible": plan.feasible,
            "violations": plan.violations,
            "notes": plan.notes,
            "checks": _compliance_checks(plan),
        },
    }


def _compliance_checks(plan: Plan) -> list[dict]:
    """The rule-by-rule checklist shown in the UI."""
    summary = plan.summary
    return [
        {
            "rule": "11-hour driving limit",
            "cfr": "395.3(a)(3)",
            "passed": not any("11-hour" in v for v in plan.violations),
            "detail": f"{summary.driving_hours:g} h driving across "
                      f"{summary.daily_resets + 1} duty period(s).",
        },
        {
            "rule": "14-hour driving window",
            "cfr": "395.3(a)(2)",
            "passed": not any("14-hour" in v for v in plan.violations),
            "detail": "No driving after the 14th hour of any duty period.",
        },
        {
            "rule": "30-minute break after 8 h driving",
            "cfr": "395.3(a)(3)(ii)",
            "passed": not any("30-minute" in v for v in plan.violations),
            "detail": f"{summary.rest_breaks} dedicated break(s); on-duty stops "
                      f"satisfy the rule where they run 30 minutes or longer.",
        },
        {
            "rule": "70-hour / 8-day cycle",
            "cfr": "395.3(b)",
            "passed": not any("cycle" in v for v in plan.violations),
            "detail": f"{summary.cycle_hours_used_end:g} h used, "
                      f"{summary.cycle_hours_remaining_end:g} h remaining at arrival.",
        },
        {
            "rule": "34-hour restart",
            "cfr": "395.3(c)",
            "passed": True,
            "detail": (
                f"{summary.restarts} restart(s) scheduled."
                if summary.restarts
                else "Not required for this trip."
            ),
        },
        {
            "rule": "Fuel at least every 1,000 miles",
            "cfr": "Trip assumption",
            "passed": True,
            "detail": f"{summary.fuel_stops} fuel stop(s) over "
                      f"{summary.total_miles:g} miles.",
        },
    ]
