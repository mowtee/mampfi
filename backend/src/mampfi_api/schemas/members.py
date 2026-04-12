from pydantic import BaseModel


class LeaveIntentIn(BaseModel):
    wants_to_leave: bool


class LeaveIntentOut(BaseModel):
    status: str
    wants_to_leave: bool
