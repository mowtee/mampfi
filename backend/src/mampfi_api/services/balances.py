import uuid

from sqlmodel import Session, select

from ..models import Membership, Payment, Purchase, User
from ..schemas.balances import BalanceLine, BalancesOut
from ..services.events import get_event, require_member


def compute_balances(session: Session, event_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Compute net balances for all participants in an event.

    Positive balance: this user is owed money.
    Negative balance: this user owes money.
    """
    balances: dict[uuid.UUID, int] = {}

    purchases = session.exec(select(Purchase).where(Purchase.event_id == event_id)).all()
    for pur in purchases:
        balances[pur.buyer_id] = balances.get(pur.buyer_id, 0) + int(pur.total_minor or 0)
        for line in pur.lines or []:
            unit = int(line.get("unit_price_minor") or 0)
            for alloc in line.get("allocations") or []:
                try:
                    uid = uuid.UUID(str(alloc.get("user_id")))
                except (ValueError, AttributeError):
                    continue
                qty = int(alloc.get("qty") or 0)
                balances[uid] = balances.get(uid, 0) - unit * qty

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
