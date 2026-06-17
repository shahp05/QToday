from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.database import get_db

router = APIRouter(prefix="/api/countries", tags=["countries"])


@router.get("")
def list_countries(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            "SELECT country_code, country_name FROM countries "
            "WHERE is_active = TRUE ORDER BY country_name"
        )
    ).fetchall()
    return [{"code": r[0], "name": r[1]} for r in rows]
