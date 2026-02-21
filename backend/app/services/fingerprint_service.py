"""
Device fingerprinting and IP enrichment service.
Processes browser signals and geolocation data for risk assessment.
"""
import hashlib
import math
from typing import Optional
import httpx
import structlog

from app.core.config import settings
from app.core.redis_client import redis_client

log = structlog.get_logger()

# Earth radius in km
EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in km."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def enrich_ip(ip_address: str) -> dict:
    """
    Enrich an IP address with geolocation and reputation data.
    Uses IPQualityScore API; falls back to mock data in dev.
    """
    cache_key = f"ip_enrichment:{ip_address}"
    cached = await redis_client.get(cache_key)
    if cached:
        return cached

    result = {
        "country": "US",
        "city": "New York",
        "lat": 40.7128,
        "lon": -74.0060,
        "is_vpn": False,
        "is_tor": False,
        "is_proxy": False,
        "fraud_score": 0,
    }

    if settings.IPQUALITYSCORE_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    f"https://ipqualityscore.com/api/json/ip/{settings.IPQUALITYSCORE_API_KEY}/{ip_address}",
                    params={"strictness": 1, "allow_public_access_points": True},
                )
                data = resp.json()
                if data.get("success"):
                    result.update({
                        "country": data.get("country_code", "US"),
                        "city": data.get("city", ""),
                        "lat": data.get("latitude", 0),
                        "lon": data.get("longitude", 0),
                        "is_vpn": data.get("vpn", False),
                        "is_tor": data.get("tor", False),
                        "is_proxy": data.get("proxy", False),
                        "fraud_score": data.get("fraud_score", 0),
                    })
        except Exception as e:
            log.warning("IP enrichment failed", ip=ip_address, error=str(e))

    await redis_client.set(cache_key, result, ttl=3600)
    return result


async def compute_geo_delta(
    user_id: str,
    current_lat: float,
    current_lon: float,
    time_delta_seconds: float,
) -> tuple[float, bool]:
    """
    Compute distance from last transaction location.
    Returns (distance_km, impossible_travel_flag).
    Impossible travel: distance implies speed > 1000 km/h.
    """
    last_location_key = f"last_location:{user_id}"
    last_loc = await redis_client.get(last_location_key)

    geo_delta_km = 0.0
    impossible_travel = False

    if last_loc and time_delta_seconds > 0:
        dist = haversine_distance(
            last_loc["lat"], last_loc["lon"], current_lat, current_lon
        )
        speed_kmh = (dist / time_delta_seconds) * 3600
        geo_delta_km = dist
        impossible_travel = speed_kmh > 1000  # > ~Mach 0.8

    # Update last location
    await redis_client.set(
        last_location_key,
        {"lat": current_lat, "lon": current_lon},
        ttl=86400,
    )
    return geo_delta_km, impossible_travel


def hash_fingerprint(components: dict) -> str:
    """Create a stable SHA-256 fingerprint hash from browser components."""
    canonical = "|".join(f"{k}={v}" for k, v in sorted(components.items()))
    return hashlib.sha256(canonical.encode()).hexdigest()


async def is_known_device(user_id: str, fingerprint_hash: str) -> bool:
    """Check if a device fingerprint has been seen for this user before."""
    key = f"known_devices:{user_id}"
    known = await redis_client.get(key) or []
    return fingerprint_hash in known


async def register_device(user_id: str, fingerprint_hash: str):
    """Add a device fingerprint to the user's known devices."""
    key = f"known_devices:{user_id}"
    known = await redis_client.get(key) or []
    if fingerprint_hash not in known:
        known.append(fingerprint_hash)
        await redis_client.set(key, known, ttl=86400 * 365)
