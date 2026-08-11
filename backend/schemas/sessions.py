from datetime import date

from pydantic import BaseModel


class SessionScheduleRequest(BaseModel):
    start_date: date
