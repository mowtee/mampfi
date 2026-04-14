from pydantic import BaseModel, Field


class LeaveIntentIn(BaseModel):
    wants_to_leave: bool


class LeaveIntentOut(BaseModel):
    status: str
    wants_to_leave: bool


class MemberNoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class RolloverIn(BaseModel):
    enabled: bool
