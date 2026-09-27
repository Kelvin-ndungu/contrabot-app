"""API routes for recommend, chat, facilities, and CHW outcomes."""

from fastapi import APIRouter, HTTPException

from engine.models import ChatRequest, OutcomeLog, RecommendRequest, UserProfile, METHOD_LABELS, METHOD_METADATA, ReferralCreate, ReferralClaim, HandoffCreate
from engine.pipeline import run_recommendation
from services.facilities import find_nearest_facilities, format_facilities_message, get_outcome_analytics, log_outcome
from services.referrals import (
    create_referral,
    create_live_handoff,
    list_referrals,
    update_referral,
    referral_counts,
    get_referral_contact_link,
)
from services.knowledge import query_all_collections
from engine.recommender import load_system_prompt
from app.openai_client import chat_completion

router = APIRouter()


@router.post("/recommend")
def recommend(body: RecommendRequest):
    result = run_recommendation(body.profile)
    return result.model_dump()


@router.post("/chat")
def chat(body: ChatRequest):
    rag = query_all_collections(body.message, num_results=2)
    profile = body.profile or UserProfile(age=25, channel="web")
    system = load_system_prompt()
    context = "\n".join(rag[:2]) if rag else ""
    try:
        reply = chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Context:\n{context}\n\nUser: {body.message}"},
            ],
            max_tokens=400,
            temperature=0.6,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"reply": reply, "session_id": body.session_id}


@router.get("/facilities")
def facilities(district: str, country: str | None = None, limit: int = 3):
    items = find_nearest_facilities(district, limit=limit, country=country)
    return {"district": district, "facilities": items, "formatted": format_facilities_message(items, max_chars=500)}


@router.post("/outcomes")
def outcomes(body: OutcomeLog):
    ok = log_outcome(
        body.district,
        body.recommended_method,
        body.accepted,
        body.chosen_method,
        body.notes,
        chw_id=body.chw_id,
        followup=body.followup,
        followup_at=body.followup_at,
        session_id=body.session_id,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Could not log outcome")
    return {"status": "logged"}


@router.get("/analytics/outcomes")
def analytics_outcomes(district: str | None = None):
    return get_outcome_analytics(district=district)


@router.post("/referrals")
def referrals_create(body: ReferralCreate):
    row = create_referral(
        district=body.district,
        channel=body.channel,
        method_interest=body.method_interest,
        notes=body.notes,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Could not create referral")
    return row


@router.get("/referrals")
def referrals_list(district: str | None = None, status: str | None = "open", limit: int = 50):
    return {
        "referrals": list_referrals(district=district, status=status, limit=limit),
        "counts": referral_counts(district=district),
    }


@router.patch("/referrals/{referral_id}")
def referrals_update(referral_id: int, body: ReferralClaim):
    row = update_referral(referral_id, status=body.status, chw_id=body.chw_id)
    if not row:
        raise HTTPException(status_code=404, detail="Referral not found")
    return row


@router.post("/handoffs")
def handoffs_create(body: HandoffCreate):
    if not body.consent:
        raise HTTPException(status_code=400, detail="Consent is required for live CHW handoff")
    row = create_live_handoff(
        district=body.district,
        user_whatsapp=body.user_whatsapp,
        channel=body.channel,
        method_interest=body.method_interest,
        notes=body.notes,
    )
    if not row:
        raise HTTPException(status_code=400, detail="Could not create handoff — check WhatsApp number")
    return {
        "id": row["id"],
        "code": row["code"],
        "district": row["district"],
        "status": row["status"],
        "handoff": True,
        "notified_chw_id": row.get("notified_chw_id"),
        "chw": {"chw_id": (row.get("chw") or {}).get("chw_id"), "name": (row.get("chw") or {}).get("name")}
        if row.get("chw")
        else None,
        "chw_whatsapp": (row.get("chw") or {}).get("whatsapp"),
        "chw_notify_text": row.get("chw_notify_text"),
    }


@router.get("/referrals/{referral_id}/contact")
def referrals_contact(referral_id: int):
    data = get_referral_contact_link(referral_id)
    if not data:
        raise HTTPException(status_code=404, detail="Referral not found")
    return data


@router.get("/methods/compare")
def compare_methods():
    rows = []
    for method, label in METHOD_LABELS.items():
        meta = METHOD_METADATA[method]
        rows.append(
            {
                "id": method.value,
                "name": label,
                "duration": meta["duration"],
                "cost": meta["cost"],
                "effectiveness": meta["effectiveness"],
                "reversibility": meta["reversibility"],
                "requires_clinic": meta["requires_clinic"],
            }
        )
    return {"methods": rows}
