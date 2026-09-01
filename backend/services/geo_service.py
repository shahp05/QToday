"""
Seeds states for a country from the CountriesNow API (free, keyless).
Called once per country — on signup, when the signing-up country has no
states yet (see jobs/tasks.py's seed_country_geo_task and its trigger in
services/signup_service.py), and manually for the initial India seed.

Cities are NOT seeded here — CountriesNow's city-level data (checked across
every endpoint that returns one: /state/cities, /cities, and even the
separately-keyed countrystatecity.in API) turned out to be a raw
settlement/locality gazetteer, not an actual "cities" list: for Delhi alone
it includes neighborhoods like "Karol Bagh" and "Najafgarh" alongside real
cities, with no reliable signal anywhere to tell them apart (a curated
population-based endpoint exists but has zero coverage for entire states
like Goa and Sikkim). customers.customer_city stays free text instead.
"""
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import State

_BASE_URL = "https://countriesnow.space/api/v0.1/countries"


async def seed_country_geo(db: Session, *, country_id: int, country_name: str) -> dict:
    """Idempotent: no-ops if this country already has states seeded."""
    already_seeded = db.execute(
        select(State.state_id).where(State.country_id == country_id).limit(1)
    ).scalar_one_or_none()
    if already_seeded is not None:
        return {"skipped": True, "reason": "already seeded", "states": 0}

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        states_resp = await client.get(f"{_BASE_URL}/states/q", params={"country": country_name})
        states_resp.raise_for_status()
        states_payload = states_resp.json()
        if states_payload.get("error"):
            return {"skipped": True, "reason": states_payload.get("msg", "states lookup failed"), "states": 0}
        state_entries = states_payload["data"]["states"]

        for entry in state_entries:
            db.add(State(
                country_id=country_id,
                state_name=entry["name"],
                state_code=entry.get("state_code"),
                is_active=True,
            ))

        db.flush()

    return {"skipped": False, "states": len(state_entries)}
