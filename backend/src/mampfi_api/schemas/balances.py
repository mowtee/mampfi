import uuid

from pydantic import BaseModel


class BalanceLine(BaseModel):
    user_id: uuid.UUID
    balance_minor: int
    wants_to_leave: bool | None = None


class BalancesOut(BaseModel):
    currency: str
    totals: list[BalanceLine]
