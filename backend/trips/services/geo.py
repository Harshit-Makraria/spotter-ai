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
from dataclasses import dataclass, asdict

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


def _geocode_nominatim(text: str) -> Place | None:
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

    key = _cache_key("route", *(f"{p.lat:.4f},{p.lon:.4f}" for p in places))
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
        return Route(
            distance_miles=round(summary["distance"], 1),
            duration_hours=round(summary["duration"] / 3600, 2),
            geometry=simplify_geometry(
                [[lat, lon] for lon, lat in feature["geometry"]["coordinates"]]
            ),
            legs=legs,
            provider="openrouteservice/driving-hgv",
        )
    except Exception as exc:  # pragma: no cover - network path
        log.warning("ORS routing failed: %s", exc)
        return None


def _route_osrm(places: list[Place]) -> Route | None:
    try:
        coords = ";".join(f"{p.lon},{p.lat}" for p in places)
        response = _get(
            f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords}",
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
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
        return Route(
            distance_miles=round(route["distance"] / METERS_PER_MILE, 1),
            duration_hours=round(route["duration"] / 3600, 2),
            geometry=simplify_geometry(
                [[lat, lon] for lon, lat in route["geometry"]["coordinates"]]
            ),
            legs=legs,
            provider="osrm/driving",
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
    }


def _route_from_dict(data: dict) -> Route:
    return Route(
        distance_miles=data["distance_miles"],
        duration_hours=data["duration_hours"],
        geometry=data["geometry"],
        legs=[RouteLeg(**leg) for leg in data["legs"]],
        provider=data["provider"],
    )
