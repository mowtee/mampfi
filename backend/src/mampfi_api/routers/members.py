from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Membership, Payment, Purchase, User
from ..timeutils import now_utc

router = APIRouter(prefix="/v1/events/{event_id}/members", tags=["members"])


class LeaveIntentIn(BaseModel):
    wants_to_leave: bool


class LeaveIntentOut(BaseModel):
    status: str
    wants_to_leave: bool


@router.post("/me/leave-intent", response_model=LeaveIntentOut)
def set_leave_intent(
    event_id: uuid.UUID, data: LeaveIntentIn, user: User = Depends(get_current_user)
) -> LeaveIntentOut:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        mem = session.get(Membership, (user.id, ev.id))
        if not mem:
            raise HTTPException(status_code=403, detail="not a member of this event")
        mem.wants_to_leave = bool(data.wants_to_leave)
        session.add(mem)
        session.commit()
        return LeaveIntentOut(status="ok", wants_to_leave=mem.wants_to_leave)


def _compute_balances_for_event(session, event_id: uuid.UUID) -> dict[uuid.UUID, int]:
    balances: dict[uuid.UUID, int] = {}
    purchases = session.exec(select(Purchase).where(Purchase.event_id == event_id)).all()
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
    for pay in session.exec(
        select(Payment).where(Payment.event_id == event_id, Payment.status == "confirmed")
    ).all():
        balances[pay.from_user_id] = balances.get(pay.from_user_id, 0) + int(pay.amount_minor)
        balances[pay.to_user_id] = balances.get(pay.to_user_id, 0) - int(pay.amount_minor)
    return balances


@router.post("/me/leave", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def leave_event(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> Response:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        mem = session.get(Membership, (user.id, ev.id))
        if not mem:
            raise HTTPException(status_code=403, detail="not a member of this event")

        balances = _compute_balances_for_event(session, ev.id)
        my_bal = int(balances.get(user.id, 0))

        if my_bal != 0:
            # build plan
            # creditors: positive balances (others should pay them)
            # debtors: negative balances (they owe money)
            all_mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
            wants_map = {m.user_id: bool(m.wants_to_leave) for m in all_mems}
            totals = [
                {"user_id": uid, "balance_minor": bal, "wants_to_leave": wants_map.get(uid, False)}
                for uid, bal in balances.items()
            ]

            plan: list[dict] = []
            if my_bal < 0:
                remaining = -my_bal
                creditors = [
                    t for t in totals if t["balance_minor"] > 0 and t["user_id"] != user.id
                ]
                # prioritize creditors who want to leave
                creditors.sort(
                    key=lambda t: (not t.get("wants_to_leave", False), -t["balance_minor"])
                )
                for c in creditors:
                    if remaining <= 0:
                        break
                    can = min(remaining, int(c["balance_minor"]))
                    if can > 0:
                        plan.append(
                            {
                                "action": "pay",
                                "to_user_id": str(c["user_id"]),
                                "amount_minor": int(can),
                            }
                        )
                        remaining -= can
            else:
                remaining = my_bal
                debtors = [t for t in totals if t["balance_minor"] < 0 and t["user_id"] != user.id]
                # prioritize debtors who want to leave (so they settle sooner)
                debtors.sort(key=lambda t: (not t.get("wants_to_leave", False), t["balance_minor"]))
                for d in debtors:
                    if remaining <= 0:
                        break
                    will = min(remaining, -int(d["balance_minor"]))
                    if will > 0:
                        plan.append(
                            {
                                "action": "receive",
                                "from_user_id": str(d["user_id"]),
                                "amount_minor": int(will),
                            }
                        )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "reason": "balance_not_zero",
                    "currency": ev.currency,
                    "balance_minor": my_bal,
                    "plan": plan,
                },
            )

        # Balance is zero: allow leaving
        mem.left_at = now_utc()
        mem.wants_to_leave = False
        session.add(mem)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
