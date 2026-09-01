from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.database import get_db

router = APIRouter(tags=["geo"])


@router.get("/api/states")
def list_states(country_id: int = Query(...), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            "SELECT state_id, state_name FROM states "
            "WHERE country_id = :cid AND is_active = TRUE ORDER BY state_name"
        ),
        {"cid": country_id},
    ).fetchall()
    return [{"id": r[0], "name": r[1]} for r in rows]
