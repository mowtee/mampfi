import uuid

from sqlmodel import Session, select

from ..exceptions import Conflict, DomainError, NotFound
from ..models import Event, Membership, User
from ..schemas.members import LeaveIntentOut
from ..services.balances import compute_balances
from ..services.events import get_event, require_member, require_owner
from ..timeutils import now_utc


def set_leave_intent(
    session: Session, event_id: uuid.UUID, wants_to_leave: bool, user: User
) -> LeaveIntentOut:
    ev = get_event(session, event_id)
    mem = require_member(session, ev.id, user.id)
    mem.wants_to_leave = wants_to_leave
    session.add(mem)
    session.commit()
    return LeaveIntentOut(status="ok", wants_to_leave=mem.wants_to_leave)


def leave_event(session: Session, event_id: uuid.UUID, user: User) -> None:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    mem = require_member(session, ev.id, user.id)

    balances = compute_balances(session, ev.id)
    my_bal = int(balances.get(user.id, 0))

    if my_bal != 0:
        all_mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
        wants_map = {m.user_id: bool(m.wants_to_leave) for m in all_mems}
        totals = [
            {
                "user_id": uid,
                "balance_minor": bal,
                "wants_to_leave": wants_map.get(uid, False),
            }
            for uid, bal in balances.items()
        ]

        plan: list[dict] = []
        if my_bal < 0:
            remaining = -my_bal
            creditors = [t for t in totals if t["balance_minor"] > 0 and t["user_id"] != user.id]
            creditors.sort(key=lambda t: (not t.get("wants_to_leave", False), -t["balance_minor"]))
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

        raise Conflict(
            {
                "reason": "balance_not_zero",
                "currency": ev.currency,
                "balance_minor": my_bal,
                "plan": plan,
            }
        )

    mem.left_at = now_utc()
    mem.wants_to_leave = False
    session.add(mem)
    session.commit()


def remove_member(
    session: Session, event_id: uuid.UUID, target_user_id: uuid.UUID, user: User
) -> None:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)

    if target_user_id == user.id:
        raise DomainError("cannot remove yourself — use leave instead")

    mem = session.exec(
        select(Membership).where(
            Membership.event_id == ev.id,
            Membership.user_id == target_user_id,
        )
    ).first()
    if not mem:
        raise NotFound("member")
    if mem.left_at:
        raise DomainError("member already left")

    mem.left_at = now_utc()
    mem.wants_to_leave = False
    session.add(mem)
    session.commit()


def promote_member(
    session: Session, event_id: uuid.UUID, target_user_id: uuid.UUID, user: User
) -> None:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)

    if target_user_id == user.id:
        raise DomainError("you are already an admin")

    mem = session.exec(
        select(Membership).where(
            Membership.event_id == ev.id,
            Membership.user_id == target_user_id,
        )
    ).first()
    if not mem:
        raise NotFound("member")
    if mem.left_at:
        raise DomainError("member already left")
    if mem.role == "owner":
        raise DomainError("member is already an admin")

    mem.role = "owner"
    session.add(mem)
    session.commit()
