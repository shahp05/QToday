"""
Core country-refresh logic — fetches from the World Bank country API,
matches by country_code (stable even when the official name changes,
e.g. Turkey -> Turkiye), inserts new countries, updates renamed ones.

World Bank chosen over REST Countries: REST Countries deprecated its free
v3.1 API and now requires a paid account (verified live — it redirects to
a deprecation notice). World Bank's country list is free, requires no key,
is an authoritative public institution (unlikely to ever be paywalled),
and already reflects the Turkey -> Turkiye rename as of this writing.

Response includes statistical AGGREGATES (e.g. "Africa Eastern and
Southern") alongside real countries — aggregates have region.id == "NA"
and must be filtered out.

Kept separate from jobs/tasks.py so this logic is testable on its own and
isn't tied to Procrastinate's task-decoration machinery.
"""
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import Country


async def fetch_and_sync_countries(db: Session) -> dict:
    """Returns a summary dict: {"inserted": [...], "updated": [...], "total_fetched": N}."""
    url = get_setting(
        "rest_countries_api_url",
        "https://api.worldbank.org/v2/country?format=json&per_page=300",
    )

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        # World Bank wraps results as [metadata, [country dicts]]
        countries_data = response.json()[1]

    existing = {c.country_code: c for c in db.execute(select(Country)).scalars()}

    inserted, updated = [], []
    for entry in countries_data:
        if entry.get("region", {}).get("id") == "NA":
            continue  # statistical aggregate, not a real country

        code = entry.get("iso2Code")
        name = entry.get("name")
        if not code or not name:
            continue

        existing_row = existing.get(code)
        if existing_row is None:
            db.add(Country(country_code=code, country_name=name, is_active=True))
            inserted.append(code)
        elif existing_row.country_name != name:
            existing_row.country_name = name
            updated.append(code)

    db.flush()
    return {"inserted": inserted, "updated": updated, "total_fetched": len(countries_data)}
