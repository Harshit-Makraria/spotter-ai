"""
Geocoding and routing against free map services.

Primary provider is OpenRouteService, which offers a genuine heavy-goods-vehicle
routing profile (``driving-hgv``) rather than car directions -- the right choice
for a CMV planner.  The keyless OSRM demo server is the fallback so the app keeps
working without a key or after the daily quota is spent.

Every outbound call is cached, so repeated demos of the same trip cost nothing
and stay fast.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
import time
from dataclasses import dataclass, asdict, field

import requests
from django.conf import settings
from django.core.cache import cache

from .us_cities import nearest_city

log = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344
CACHE_FOREVER = 60 * 60 * 24 * 30


#: Enough detail to draw a smooth line without shipping megabytes of JSON.
MAX_GEOMETRY_POINTS = 1800


class GeoError(RuntimeError):
    """A location could not be resolved or a route could not be built."""


def _cache_key(prefix: str, *parts: str) -> str:
    """Hash cache keys so they stay valid across every cache backend."""
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"eld:{prefix}:{digest}"


def simplify_geometry(
    points: list[list[float]], limit: int = MAX_GEOMETRY_POINTS
) -> list[list[float]]:
    """Evenly thin a polyline, always keeping the first and last points."""
    if len(points) <= limit:
        return points
    step = len(points) / limit
    thinned = [points[int(i * step)] for i in range(limit)]
    if thinned[-1] != points[-1]:
        thinned.append(points[-1])
    return thinned


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lon: float

    def as_dict(self) -> dict:
        return asdict(self)

    @property
    def lonlat(self) -> list[float]:
        return [self.lon, self.lat]


@dataclass
class RouteLeg:
    distance_miles: float
    duration_hours: float


@dataclass
class Route:
    distance_miles: float
    duration_hours: float
    #: [[lat, lon], ...] for drawing on the map.
    geometry: list[list[float]]
    legs: list[RouteLeg]
    provider: str
    #: Turn-by-turn instructions, already collapsed to one line per road.
    directions: list[dict] = field(default_factory=list)

    def point_at_mile(self, mile: float) -> tuple[float, float]:
        """Interpolate a coordinate a given distance along the route."""
        if not self.geometry:
            raise GeoError("Route has no geometry.")
        if mile <= 0:
            return tuple(self.geometry[0])
        if mile >= self.distance_miles:
            return tuple(self.geometry[-1])

        target = mile
        travelled = 0.0
        for start, end in zip(self.geometry, self.geometry[1:]):
            step = haversine_miles(start[0], start[1], end[0], end[1])
            if travelled + step >= target:
                remainder = (target - travelled) / step if step else 0.0
                return (
                    start[0] + (end[0] - start[0]) * remainder,
                    start[1] + (end[1] - start[1]) * remainder,
                )
            travelled += step
        return tuple(self.geometry[-1])


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 3958.7613
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def _get(url: str, **kwargs) -> requests.Response:
    kwargs.setdefault("timeout", settings.GEO_TIMEOUT_SECONDS)
    headers = kwargs.setdefault("headers", {})
    headers.setdefault("User-Agent", settings.GEO_USER_AGENT)
    return requests.get(url, **kwargs)


# --------------------------------------------------------------------------
# Forward geocoding
# --------------------------------------------------------------------------


def geocode(query: str) -> Place:
    """Resolve free text such as 'Dallas, TX' to a coordinate."""
    text = (query or "").strip()
    if not text:
        raise GeoError("Please enter a location.")

    key = _cache_key("geocode", text.lower())
    cached = cache.get(key)
    if cached:
        return Place(**cached)

    place = _geocode_ors(text) or _geocode_nominatim(text)
    if place is None:
        raise GeoError(
            f"Could not find “{text}”. Try adding a state, for example “Dallas, TX”."
        )

    cache.set(key, place.as_dict(), CACHE_FOREVER)
    return place


def _geocode_ors(text: str) -> Place | None:
    if not settings.ORS_API_KEY:
        return None
    try:
        response = _get(
            f"{settings.ORS_BASE_URL}/geocode/search",
            params={
                "api_key": settings.ORS_API_KEY,
                "text": text,
                "boundary.country": "US",
                "size": 1,
            },
        )
        response.raise_for_status()
        features = response.json().get("features") or []
        if not features:
            return None
        feature = features[0]
        lon, lat = feature["geometry"]["coordinates"]
        return Place(name=_tidy_label(feature["properties"]), lat=lat, lon=lon)
    except Exception as exc:  # pragma: no cover - network path
        log.warning("ORS geocode failed for %r: %s", text, exc)
        return None


# Nominatim's usage policy allows one request a second. A trip geocodes three
# places back to back, so calls are spaced out rather than risking a 429 that
# would surface as a misleading "could not find" error.
_NOMINATIM_LOCK = threading.Lock()
_NOMINATIM_LAST_CALL = [0.0]
_NOMINATIM_SPACING = 1.05


def _geocode_nominatim(text: str) -> Place | None:
    with _NOMINATIM_LOCK:
        wait = _NOMINATIM_SPACING - (time.monotonic() - _NOMINATIM_LAST_CALL[0])
        if wait > 0:
            time.sleep(wait)
        _NOMINATIM_LAST_CALL[0] = time.monotonic()
    try:
        response = _get(
            f"{settings.NOMINATIM_BASE_URL}/search",
            params={
                "q": text,
                "format": "json",
                "limit": 1,
                "countrycodes": "us",
                "addressdetails": 1,
            },
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        hit = results[0]
        return Place(
            name=_tidy_nominatim(hit),
            lat=float(hit["lat"]),
            lon=float(hit["lon"]),
        )
    except Exception as exc:  # pragma: no cover - network path
        log.warning("Nominatim geocode failed for %r: %s", text, exc)
        return None


def _tidy_label(properties: dict) -> str:
    """Prefer 'City, ST' over a full postal address."""
    city = properties.get("locality") or properties.get("county")
    region = properties.get("region_a") or properties.get("region")
    if city and region:
        return f"{city}, {region}"
    return properties.get("label") or properties.get("name") or "Unknown"


def _tidy_nominatim(hit: dict) -> str:
    address = hit.get("address") or {}
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
        or address.get("county")
    )
    state = address.get("ISO3166-2-lvl4", "").replace("US-", "") or address.get("state")
    if city and state:
        return f"{city}, {state}"
    return (hit.get("display_name") or "Unknown").split(",")[0]


# --------------------------------------------------------------------------
# Reverse geocoding -- used for the "Remarks" column on each log sheet
# --------------------------------------------------------------------------


def describe_point(lat: float, lon: float) -> str:
    """Name the city/state nearest a coordinate, per 395.8(c).

    Falls back to a bundled list of US cities so a stop is never unlabelled,
    even with no network access.
    """
    key = _cache_key("reverse", f"{lat:.2f}", f"{lon:.2f}")
    cached = cache.get(key)
    if cached:
        return cached

    label = _reverse_ors(lat, lon) or nearest_city(lat, lon)
    cache.set(key, label, CACHE_FOREVER)
    return label


def _reverse_ors(lat: float, lon: float) -> str | None:
    if not settings.ORS_API_KEY:
        return None
    try:
        response = _get(
            f"{settings.ORS_BASE_URL}/geocode/reverse",
            params={
                "api_key": settings.ORS_API_KEY,
                "point.lat": lat,
                "point.lon": lon,
                "size": 1,
                "layers": "locality,localadmin,county",
            },
        )
        response.raise_for_status()
        features = response.json().get("features") or []
        return _tidy_label(features[0]["properties"]) if features else None
    except Exception as exc:  # pragma: no cover - network path
        log.warning("ORS reverse geocode failed at %s,%s: %s", lat, lon, exc)
        return None


# --------------------------------------------------------------------------
# Routing
# --------------------------------------------------------------------------


def build_route(places: list[Place]) -> Route:
    """Route through the given waypoints using a truck profile where possible."""
    if len(places) < 2:
        raise GeoError("A route needs at least two points.")

    key = _cache_key("route-v3", *(f"{p.lat:.4f},{p.lon:.4f}" for p in places))
    cached = cache.get(key)
    if cached:
        return _route_from_dict(cached)

    route = _route_ors(places) or _route_osrm(places)
    if route is None:
        raise GeoError(
            "Could not build a road route between those locations. "
            "Check that each one is reachable by road within the US."
        )

    cache.set(key, _route_to_dict(route), CACHE_FOREVER)
    return route


def _route_ors(places: list[Place]) -> Route | None:
    if not settings.ORS_API_KEY:
        return None
    try:
        response = requests.post(
            f"{settings.ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
            json={
                "coordinates": [p.lonlat for p in places],
                "units": "mi",
                "geometry_simplify": True,
            },
            headers={
                "Authorization": settings.ORS_API_KEY,
                "Content-Type": "application/json",
                "User-Agent": settings.GEO_USER_AGENT,
            },
            timeout=settings.GEO_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        feature = response.json()["features"][0]
        summary = feature["properties"]["summary"]
        legs = [
            RouteLeg(
                distance_miles=round(seg["distance"], 2),
                duration_hours=round(seg["duration"] / 3600, 3),
            )
            for seg in feature["properties"]["segments"]
        ]
        steps = [
            {
                "leg": leg_index,
                "text": step.get("instruction", "").strip(),
                "road": step.get("name", "").strip(" -"),
                "miles": float(step.get("distance", 0.0)),
                "kind": _ORS_KIND.get(step.get("type"), "continue"),
            }
            for leg_index, seg in enumerate(feature["properties"]["segments"])
            for step in seg.get("steps", [])
        ]
        return Route(
            distance_miles=round(summary["distance"], 1),
            duration_hours=round(summary["duration"] / 3600, 2),
            geometry=simplify_geometry(
                [[lat, lon] for lon, lat in feature["geometry"]["coordinates"]]
            ),
            legs=legs,
            provider="openrouteservice/driving-hgv",
            directions=collapse_directions(steps),
        )
    except Exception as exc:  # pragma: no cover - network path
        log.warning("ORS routing failed: %s", exc)
        return None


def _route_osrm(places: list[Place]) -> Route | None:
    try:
        coords = ";".join(f"{p.lon},{p.lat}" for p in places)
        response = _get(
            f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords}",
            params={"overview": "full", "geometries": "geojson", "steps": "true"},
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != "Ok" or not payload.get("routes"):
            return None

        route = payload["routes"][0]
        legs = [
            RouteLeg(
                distance_miles=round(leg["distance"] / METERS_PER_MILE, 2),
                duration_hours=round(leg["duration"] / 3600, 3),
            )
            for leg in route.get("legs", [])
        ]
        steps = [
            {
                "leg": leg_index,
                "text": _osrm_instruction(step, leg_index, len(route["legs"])),
                "road": _road_label(step.get("name", ""), step.get("ref", "")),
                "miles": step.get("distance", 0.0) / METERS_PER_MILE,
                "kind": _osrm_kind(step),
            }
            for leg_index, leg in enumerate(route.get("legs", []))
            for step in leg.get("steps", [])
        ]
        return Route(
            distance_miles=round(route["distance"] / METERS_PER_MILE, 1),
            duration_hours=round(route["duration"] / 3600, 2),
            geometry=simplify_geometry(
                [[lat, lon] for lon, lat in route["geometry"]["coordinates"]]
            ),
            legs=legs,
            provider="osrm/driving",
            directions=collapse_directions(steps),
        )
    except Exception as exc:  # pragma: no cover - network path
        log.warning("OSRM routing failed: %s", exc)
        return None


def _route_to_dict(route: Route) -> dict:
    return {
        "distance_miles": route.distance_miles,
        "duration_hours": route.duration_hours,
        "geometry": route.geometry,
        "legs": [asdict(leg) for leg in route.legs],
        "provider": route.provider,
        "directions": route.directions,
    }


def _route_from_dict(data: dict) -> Route:
    return Route(
        distance_miles=data["distance_miles"],
        duration_hours=data["duration_hours"],
        geometry=data["geometry"],
        legs=[RouteLeg(**leg) for leg in data["legs"]],
        provider=data["provider"],
        directions=data.get("directions", []),
    )


# --------------------------------------------------------------------------
# Turn-by-turn directions
# --------------------------------------------------------------------------

#: Most instructions worth listing. A coast-to-coast route collapses well under
#: this once consecutive steps on the same road are merged.
MAX_DIRECTIONS = 140

#: ORS step type codes, mapped to the small vocabulary the UI draws icons for.
_ORS_KIND = {
    0: "left", 1: "right", 2: "left", 3: "right", 4: "left", 5: "right",
    6: "straight", 7: "roundabout", 8: "roundabout", 9: "uturn",
    10: "arrive", 11: "depart", 12: "left", 13: "right",
}


def _road_label(name: str, ref: str) -> str:
    """Prefer a highway number such as I-35 over a street name."""
    ref = (ref or "").split(";")[0].strip()
    if ref:
        ref = re.sub(r"^I\s+", "I-", ref)
        ref = re.sub(r"^US\s+", "US-", ref)
        return ref
    return (name or "").strip()


def _osrm_kind(step: dict) -> str:
    maneuver = step.get("maneuver", {})
    kind = maneuver.get("type", "")
    modifier = maneuver.get("modifier", "")
    if kind in ("depart", "arrive"):
        return kind
    if kind in ("roundabout", "rotary", "exit roundabout", "exit rotary"):
        return "roundabout"
    if kind in ("merge", "on ramp", "off ramp", "fork"):
        return "ramp"
    if "left" in modifier:
        return "left"
    if "right" in modifier:
        return "right"
    if modifier == "uturn":
        return "uturn"
    return "straight"


def _osrm_instruction(step: dict, leg_index: int, leg_count: int) -> str:
    """Render an OSRM maneuver as a sentence; OSRM returns no text of its own.

    Many ramps and slip roads have no name. Saying "merge onto the road" reads
    as a bug, so the road phrase is simply left off when there is none.
    """
    maneuver = step.get("maneuver", {})
    kind = maneuver.get("type", "")
    modifier = (maneuver.get("modifier") or "").replace("uturn", "U-turn")
    road = _road_label(step.get("name", ""), step.get("ref", ""))
    exits = (step.get("exits") or "").split(";")[0].strip()
    destinations = (step.get("destinations") or "").split(",")[0].strip()

    def onto(prefix: str) -> str:
        return f"{prefix} onto {road}" if road else prefix

    if kind == "depart":
        return f"Depart on {road}" if road else "Depart"
    if kind == "arrive":
        return "Arrive at pickup" if leg_index < leg_count - 1 else "Arrive at drop-off"
    if kind == "off ramp":
        parts = ["Take exit"]
        if exits:
            parts.append(exits)
        if destinations:
            parts.append(f"toward {destinations}")
        return " ".join(parts)
    if kind == "on ramp":
        return onto("Take the ramp")
    if kind == "merge":
        return onto("Merge")
    if kind == "fork":
        side = "left" if "left" in modifier else "right" if "right" in modifier else ""
        head = f"Keep {side}" if side else "Keep going"
        return f"{head} for {road}" if road else head
    if kind in ("roundabout", "rotary", "exit roundabout", "exit rotary"):
        return f"At the roundabout, exit onto {road}" if road else "Go through the roundabout"
    if kind in ("turn", "end of road") and modifier not in ("", "straight"):
        return onto(f"Turn {modifier}")
    return f"Continue on {road}" if road else "Continue straight"


def collapse_directions(steps: list[dict]) -> list[dict]:
    """Merge consecutive steps on the same road into one instruction.

    A raw route has hundreds of steps: every lane change and name change on an
    interstate. A driver's plan wants one line per road ("Merge onto I-40,
    312 mi"). Distance from absorbed steps is kept, so the total still adds up.
    """
    collapsed: list[dict] = []
    for step in steps:
        miles = max(0.0, float(step.get("miles", 0.0)))
        text = step.get("text") or "Continue"
        kind = step.get("kind", "continue")
        road = step.get("road", "")

        previous = collapsed[-1] if collapsed else None
        same_leg = previous is not None and previous["leg"] == step["leg"]
        same_road = (
            same_leg
            and bool(road)
            and previous["road"] == road
            and kind not in ("arrive", "depart")
            and previous["kind"] != "arrive"
        )
        # A step with no road and no real maneuver is noise; fold it back.
        silent = same_leg and not road and kind in ("straight", "continue")
        if same_road or silent:
            previous["miles"] += miles
            continue

        collapsed.append(
            {"leg": step["leg"], "text": text, "road": road, "miles": miles, "kind": kind}
        )

    if len(collapsed) > MAX_DIRECTIONS:
        # Keep every leg boundary, then the longest stretches, in route order.
        pinned = {i for i, d in enumerate(collapsed) if d["kind"] in ("depart", "arrive")}
        ranked = sorted(
            (i for i in range(len(collapsed)) if i not in pinned),
            key=lambda i: collapsed[i]["miles"],
            reverse=True,
        )
        keep = pinned | set(ranked[: MAX_DIRECTIONS - len(pinned)])
        collapsed = [d for i, d in enumerate(collapsed) if i in keep]

    for direction in collapsed:
        direction["miles"] = round(direction["miles"], 1)
    return collapsed
