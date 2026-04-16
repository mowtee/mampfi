import uuid

from sqlmodel import Session, select

from ..models import Event, Membership, Payment, Purchase, User
from ..schemas.balances import BalanceLine, BalancesOut
from ..services.events import get_event, require_member


def compute_balances(session: Session, event_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Compute net balances for all participants in an event.

    Positive balance: this user is owed money.
    Negative balance: this user owes money.
    """
    balances: dict[uuid.UUID, int] = {}

    ev = session.get(Event, event_id)
    event_fee = int(ev.delivery_fee_minor or 0) if ev else 0

    purchases = session.exec(
        select(Purchase).where(
            Purchase.event_id == event_id,
            Purchase.invalidated_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for pur in purchases:
        balances[pur.buyer_id] = balances.get(pur.buyer_id, 0) + int(pur.total_minor or 0)

        # Collect members who received items (for delivery fee splitting)
        members_in_purchase: set[uuid.UUID] = set()
        for line in pur.lines or []:
            unit = int(line.get("unit_price_minor") or 0)
            for alloc in line.get("allocations") or []:
                try:
                    uid = uuid.UUID(str(alloc.get("user_id")))
                except ValueError, AttributeError:
                    continue
                qty = int(alloc.get("qty") or 0)
                if qty > 0:
                    members_in_purchase.add(uid)
                balances[uid] = balances.get(uid, 0) - unit * qty

        # Split delivery fee among members who received items (excluding buyer)
        fee_members = members_in_purchase - {pur.buyer_id}
        if pur.delivery_fee_applied and event_fee > 0 and fee_members:
            fee_per_member = event_fee // len(fee_members)
            remainder = event_fee - fee_per_member * len(fee_members)
            for i, uid in enumerate(sorted(fee_members)):
                share = fee_per_member + (1 if i < remainder else 0)
                balances[uid] = balances.get(uid, 0) - share

    for pay in session.exec(
        select(Payment).where(Payment.event_id == event_id, Payment.status == "confirmed")
    ).all():
        balances[pay.from_user_id] = balances.get(pay.from_user_id, 0) + int(pay.amount_minor)
        balances[pay.to_user_id] = balances.get(pay.to_user_id, 0) - int(pay.amount_minor)

    return balances


def get_balances(session: Session, event_id: uuid.UUID, user: User) -> BalancesOut:
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)

    balances = compute_balances(session, ev.id)

    mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
    for m in mems:
        balances.setdefault(m.user_id, 0)

    wants_map: dict[uuid.UUID, bool] = {m.user_id: bool(m.wants_to_leave) for m in mems}
    totals = [
        BalanceLine(user_id=k, balance_minor=v, wants_to_leave=wants_map.get(k))
        for k, v in balances.items()
    ]
    return BalancesOut(currency=ev.currency, totals=totals)
