from pydantic import BaseModel


class CustomerUpdateRequest(BaseModel):
    customer_name: str
    customer_address: str | None = None
    customer_city: str | None = None
    customer_state: str | None = None
    customer_zip: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    customer_gstn: str | None = None
