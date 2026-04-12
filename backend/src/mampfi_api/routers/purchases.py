from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Membership, PriceItem, Purchase, User
from ..timeutils import now_utc

router = APIRouter(prefix="/v1/events/{event_id}/purchases", tags=["purchases"])


class AllocationIn(BaseModel):
    user_id: str
    qty: int


class PurchaseLineIn(BaseModel):
    type: Literal["price_item", "custom"]
    price_item_id: uuid.UUID | None = None
    name: str | None = None
    qty_final: int
    unit_price_minor: int
    reason: str | None = None  # 'unavailable' | 'substituted' | None
    allocations: list[AllocationIn] | None = None


class PurchaseCreateIn(BaseModel):
    date: dt.date
    lines: list[PurchaseLineIn]
    notes: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
def finalize_purchase(
    event_id: uuid.UUID, data: PurchaseCreateIn, user: User = Depends(get_current_user)
) -> dict:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")

        # Check existing purchase for the date
        existing = session.exec(
            select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == data.date)
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="purchase already finalized for this date")

        # Optional validation for price_item lines
        # SQLModel 0.0.24: Session.exec(select(PriceItem.id)) already returns a ScalarResult
        # so calling .scalars() again raises AttributeError. Collect directly via .all().
        price_item_ids = set(
            session.exec(select(PriceItem.id).where(PriceItem.event_id == ev.id)).all()
        )
        normalized_lines: list[dict] = []
        total_minor = 0
        for raw in data.lines:
            t = raw.type
            qty = int(raw.qty_final)
            unit = int(raw.unit_price_minor)
            if qty < 0 or unit < 0:
                raise HTTPException(status_code=400, detail="qty and unit_price must be >= 0")
            if t == "price_item":
                pid = raw.price_item_id
                if pid not in price_item_ids:
                    raise HTTPException(status_code=400, detail=f"unknown price_item_id {pid}")
            elif t == "custom":
                if not raw.name:
                    raise HTTPException(status_code=400, detail="custom line requires name")
            else:
                raise HTTPException(status_code=400, detail="invalid line type")

            # Validate allocations sum equals qty_final
            allocs = list(raw.allocations or [])
            alloc_sum = 0
            for a in allocs:
                if int(a.qty) < 0:
                    raise HTTPException(status_code=400, detail="allocation qty must be >= 0")
                alloc_sum += int(a.qty)
            if alloc_sum != qty:
                raise HTTPException(status_code=400, detail="allocations qty must sum to qty_final")

            total_minor += qty * unit
            normalized_lines.append(
                {
                    "type": t,
                    # Store UUIDs as strings inside JSONB to ensure JSON-serializable payloads
                    "price_item_id": str(raw.price_item_id)
                    if raw.price_item_id is not None
                    else None,
                    "name": raw.name,
                    "qty_final": qty,
                    "unit_price_minor": unit,
                    "reason": raw.reason,
                    "allocations": [a.model_dump() for a in allocs],
                }
            )

        purchase = Purchase(
            event_id=ev.id,
            date=data.date,
            buyer_id=user.id,
            finalized_at=now_utc(),
            lines=normalized_lines,
            total_minor=total_minor,
            notes=data.notes,
        )
        session.add(purchase)
        session.commit()
        return {"status": "created", "total_minor": total_minor}


@router.get("/{for_date}")
def get_purchase(
    event_id: uuid.UUID, for_date: dt.date, user: User = Depends(get_current_user)
) -> dict:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        if not session.get(Membership, (user.id, ev.id)):
            raise HTTPException(status_code=403, detail="not a member of this event")
        purchase = session.exec(
            select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == for_date)
        ).first()
        if not purchase:
            raise HTTPException(status_code=404, detail="no purchase for this date")
        return {
            "event_id": str(purchase.event_id),
            "date": str(purchase.date),
            "buyer_id": str(purchase.buyer_id),
            "finalized_at": purchase.finalized_at.isoformat(),
            "lines": purchase.lines,
            "total_minor": purchase.total_minor,
            "notes": purchase.notes,
        }


@router.get("")
def list_purchases(
    event_id: uuid.UUID,
    start_date: dt.date | None = Query(default=None),
    end_date: dt.date | None = Query(default=None),
    user: User = Depends(get_current_user),
) -> list[dict]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        if not session.get(Membership, (user.id, ev.id)):
            raise HTTPException(status_code=403, detail="not a member of this event")
        stmt = select(Purchase).where(Purchase.event_id == ev.id)
        if start_date is not None:
            stmt = stmt.where(Purchase.date >= start_date)
        if end_date is not None:
            stmt = stmt.where(Purchase.date <= end_date)
        # order by date desc, finalized_at desc
        items = session.exec(
            stmt.order_by(Purchase.date.desc(), Purchase.finalized_at.desc())
        ).all()
        out = []
        for p in items:
            out.append(
                {
                    "event_id": str(p.event_id),
                    "date": str(p.date),
                    "buyer_id": str(p.buyer_id),
                    "finalized_at": p.finalized_at.isoformat(),
                    "total_minor": p.total_minor,
                    "notes": p.notes,
                }
            )
        return out
