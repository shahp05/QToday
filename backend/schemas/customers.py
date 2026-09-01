from pydantic import BaseModel


class CustomerUpdateRequest(BaseModel):
    customer_name: str
    customer_address: str
    customer_city: str
    customer_state: str
    customer_zip: str
    customer_email: str
    customer_phone: str
    customer_gstn: str | None = None
