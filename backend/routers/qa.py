from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.qa import QARequest, QAResponse
from services.qa_service import get_or_generate_qa

router = APIRouter(prefix="/api/qa", tags=["qa"])


@router.post("", response_model=QAResponse)
async def fetch_qa(payload: QARequest, db: Session = Depends(get_db)):
    try:
        items = await get_or_generate_qa(
            db,
            subject_name=payload.subject_name,
            topic_name=payload.topic_name,
            grade=payload.grade,
            user_country_id=payload.user_country_id,
            student_id=payload.student_id,
            customer_id=payload.customer_id,
        )
        return {"items": items}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
