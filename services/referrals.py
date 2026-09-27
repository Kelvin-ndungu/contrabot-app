"""CHW referral queue + live handoff helpers (client phones never stored in SQL)."""

from __future__ import annotations

import secrets
import string
from typing import Optional

from sqlalchemy.orm import Session

from services.database import Referral, get_db
from services.chw_roster import pick_chw_for_district, digits_only
from services.handoff_contact import store_handoff_contact, get_handoff_contact, wa_deep_link


def _short_code(length: int = 4) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "CB-" + "".join(secrets.choice(alphabet) for _ in range(length))


def create_referral(
    district: str,
    channel: str = "web",
    method_interest: Optional[str] = None,
    notes: Optional[str] = None,
    handoff: bool = False,
    consent_given: bool = False,
    notified_chw_id: Optional[str] = None,
) -> Optional[dict]:
    db: Session = get_db()
    try:
        code = _short_code()
        for _ in range(5):
            existing = db.query(Referral).filter(Referral.code == code).first()
            if not existing:
                break
            code = _short_code()

        row = Referral(
            code=code,
            district=(district or "Unknown").strip(),
            channel=(channel or "web").strip().lower(),
            method_interest=method_interest,
            status="open",
            notes=notes,
            handoff=bool(handoff),
            consent_given=bool(consent_given),
            notified_chw_id=notified_chw_id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _to_dict(row)
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


def create_live_handoff(
    district: str,
    user_whatsapp: str,
    channel: str = "whatsapp",
    method_interest: Optional[str] = None,
    notes: Optional[str] = None,
) -> Optional[dict]:
    """
    Consent-backed handoff: anonymous referral in SQL + ephemeral phone in Redis.
    Returns referral dict plus notify payload for the caller to message the CHW.
    """
    digits = digits_only(user_whatsapp)
    if len(digits) < 9:
        return None

    chw = pick_chw_for_district(district)
    row = create_referral(
        district=district,
        channel=channel,
        method_interest=method_interest,
        notes=notes or "Live handoff — user consented to CHW WhatsApp contact",
        handoff=True,
        consent_given=True,
        notified_chw_id=(chw or {}).get("chw_id"),
    )
    if not row:
        return None

    store_handoff_contact(row["code"], digits)

    intro = (
        f"Hi, I'm a ContraBot CHW. Your referral code is {row['code']}. "
        "How can I help with contraception counseling?"
    )
    result = {
        **row,
        "contact_stored": True,
        "chw": chw,
        "user_wa_link": wa_deep_link(digits, intro),
        "chw_notify_text": _chw_notify_message(row, chw, digits),
    }
    return result


def _chw_notify_message(row: dict, chw: Optional[dict], user_digits: str) -> str:
    name = (chw or {}).get("name") or "CHW"
    link = wa_deep_link(
        user_digits,
        f"Hi, I'm a ContraBot CHW. Your code is {row['code']}. How can I help?",
    )
    method = row.get("method_interest") or "not specified"
    return (
        f"ContraBot handoff for {name}.\n"
        f"Code: {row['code']}\n"
        f"District: {row.get('district')}\n"
        f"Interest: {method}\n"
        f"User consented to WhatsApp contact.\n"
        f"Open chat: {link}\n"
        f"(Contact link expires in 24 hours.)"
    )


def get_referral(referral_id: int) -> Optional[dict]:
    db: Session = get_db()
    try:
        row = db.query(Referral).filter(Referral.id == referral_id).first()
        return _to_dict(row) if row else None
    except Exception:
        return None
    finally:
        db.close()


def get_referral_contact_link(referral_id: int) -> Optional[dict]:
    row = get_referral(referral_id)
    if not row:
        return None
    digits = get_handoff_contact(row["code"])
    if not digits:
        return {"id": row["id"], "code": row["code"], "wa_link": None, "expired": True}
    return {
        "id": row["id"],
        "code": row["code"],
        "wa_link": wa_deep_link(
            digits,
            f"Hi, I'm a ContraBot CHW. Your code is {row['code']}. How can I help?",
        ),
        "expired": False,
    }


def list_referrals(district: Optional[str] = None, status: Optional[str] = "open", limit: int = 50) -> list[dict]:
    db: Session = get_db()
    try:
        query = db.query(Referral)
        if district:
            query = query.filter(Referral.district.ilike(f"%{district}%"))
        if status:
            query = query.filter(Referral.status == status)
        rows = query.order_by(Referral.id.desc()).limit(limit).all()
        return [_to_dict(r) for r in rows]
    except Exception:
        return []
    finally:
        db.close()


def update_referral(referral_id: int, status: str = "claimed", chw_id: Optional[str] = None) -> Optional[dict]:
    db: Session = get_db()
    try:
        row = db.query(Referral).filter(Referral.id == referral_id).first()
        if not row:
            return None
        if status not in ("open", "claimed", "completed"):
            status = "claimed"
        row.status = status
        if chw_id:
            row.claimed_by_chw_id = chw_id
        db.commit()
        db.refresh(row)
        return _to_dict(row)
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


def referral_counts(district: Optional[str] = None) -> dict:
    db: Session = get_db()
    try:
        query = db.query(Referral)
        if district:
            query = query.filter(Referral.district.ilike(f"%{district}%"))
        rows = query.all()
        counts = {"open": 0, "claimed": 0, "completed": 0, "handoff": 0, "total": len(rows)}
        for r in rows:
            if r.status in counts:
                counts[r.status] += 1
            if getattr(r, "handoff", False):
                counts["handoff"] += 1
        return counts
    except Exception:
        return {"open": 0, "claimed": 0, "completed": 0, "handoff": 0, "total": 0}
    finally:
        db.close()


def _to_dict(row: Referral) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "district": row.district,
        "channel": row.channel,
        "method_interest": row.method_interest,
        "status": row.status,
        "claimed_by_chw_id": row.claimed_by_chw_id,
        "notes": row.notes,
        "handoff": bool(getattr(row, "handoff", False)),
        "consent_given": bool(getattr(row, "consent_given", False)),
        "notified_chw_id": getattr(row, "notified_chw_id", None),
        "created_at": row.created_at,
    }
