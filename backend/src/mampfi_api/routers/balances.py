from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Membership, Payment, Purchase, User

router = APIRouter(prefix="/v1/events/{event_id}", tags=["balances"])


class BalanceLine(BaseModel):
    user_id: uuid.UUID
    balance_minor: int
    wants_to_leave: bool | None = None


class BalancesOut(BaseModel):
    currency: str
    totals: list[BalanceLine]


@router.get("/balances", response_model=BalancesOut)
def get_balances(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> BalancesOut:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        if not session.get(Membership, (user.id, ev.id)):
            raise HTTPException(status_code=403, detail="not a member of this event")

        balances: dict[uuid.UUID, int] = {}

        # Purchases: credit buyer by total, debit consumers by allocations
        purchases = session.exec(select(Purchase).where(Purchase.event_id == ev.id)).all()
        for pur in purchases:
            balances[pur.buyer_id] = balances.get(pur.buyer_id, 0) + int(pur.total_minor or 0)
            for line in pur.lines or []:
                unit = int(line.get("unit_price_minor") or 0)
                for alloc in line.get("allocations") or []:
                    try:
                        uid = uuid.UUID(str(alloc.get("user_id")))
                    except Exception:
                        continue
                    qty = int(alloc.get("qty") or 0)
                    balances[uid] = balances.get(uid, 0) - unit * qty

        # Confirmed payments: move balances from debtor to creditor
        for pay in session.exec(
            select(Payment).where(Payment.event_id == ev.id, Payment.status == "confirmed")
        ).all():
            balances[pay.from_user_id] = balances.get(pay.from_user_id, 0) + int(pay.amount_minor)
            balances[pay.to_user_id] = balances.get(pay.to_user_id, 0) - int(pay.amount_minor)

        # Ensure all members show up, even zero balances
        mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
        for m in mems:
            balances.setdefault(m.user_id, 0)

        # Build output merging wants_to_leave
        wants_map: dict[uuid.UUID, bool] = {m.user_id: bool(m.wants_to_leave) for m in mems}
        totals = [
            BalanceLine(user_id=k, balance_minor=v, wants_to_leave=wants_map.get(k))
            for k, v in balances.items()
        ]
        return BalancesOut(currency=ev.currency, totals=totals)
