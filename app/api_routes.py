"""Frontend API routes under /api prefix."""

import uuid

from fastapi import APIRouter, HTTPException

from app.api_schemas import (
    WebChatRequest,
    WebChatResponse,
    WebRecommendRequest,
    WebRecommendResponse,
    MethodRecommendation,
    SafetyElimination,
)
from engine.models import UserProfile, OutcomeLog, ReferralCreate, ReferralClaim, HandoffCreate
from engine.method_catalog import build_method_payload, all_methods_list
from engine.pipeline import run_recommendation
from engine.recommender import load_system_prompt
from services.facilities import find_nearest_facilities, get_outcome_analytics, log_outcome
from services.referrals import (
    create_referral,
    create_live_handoff,
    list_referrals,
    update_referral,
    referral_counts,
    get_referral_contact_link,
)
from services.knowledge import query_all_collections
from app.openai_client import chat_completion

router = APIRouter()

AGE_MAP = {"under_18": 17, "18-24": 21, "25-34": 30, "35-44": 40, "45+": 47}
RED_FLAG_FLAGS = {
    "high_blood_pressure",
    "migraines_aura",
    "blood_clots",
    "diabetes",
    "liver_disease",
    "breast_cancer",
}
PREF_MAP = {
    "set_forget": "long_acting",
    "daily_control": "daily",
    "non_hormonal": "non_hormonal",
    "unsure": "daily",
}


def _fallback_chat_reply(message: str) -> str:
    text = message.lower()
    if "breast" in text:
        return (
            "If you are breastfeeding, options that are often considered include lactational amenorrhea "
            "in the first 6 months when strict criteria are met, progestogen-only pills, implants, injectables, "
            "IUDs, and condoms. A clinic or CHW should confirm what is safest for your health history."
        )
    if "side effect" in text or "bleeding" in text:
        return (
            "Some side effects, such as irregular bleeding or mild headaches, can happen with hormonal methods "
            "and may settle with time. Heavy bleeding, severe pain, chest pain, fainting, or symptoms that worry "
            "you should be checked at a clinic promptly."
        )
    if "clinic" in text or "facility" in text:
        return "A nearby health facility or community health worker can help you find family planning services."
    return (
        "I can help with contraception options, side effects, breastfeeding considerations, and clinic access. "
        "For a personalized recommendation, tap \"Get a recommendation\" and answer the questions."
    )


LANGUAGE_NAMES = {"en": "english", "sw": "kiswahili", "lg": "luganda", "fr": "french"}


def _language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, code)


def _to_user_profile(body: WebRecommendRequest) -> UserProfile:
    if body.triage:
        t = body.triage
        return UserProfile(
            **t.model_dump(),
            # Coarse flags stay off: the detailed rules replace them.
            breastfeeding=t.breastfeeding_mode in ("exclusive", "partial") and t.postpartum not in (None, "none"),
            health_risk=False,
            preference="long_acting" if set(t.comfortable_with) & {"implant", "iud", "injection"} else "daily",
            clinic_access=True,
            language=_language_name(body.language),
            district=body.district,
            channel="web",
        )

    health_risk = any(f in RED_FLAG_FLAGS for f in body.health_flags)
    clinic_access = body.access == "clinic"
    return UserProfile(
        age=AGE_MAP[body.age_group],
        breastfeeding=body.breastfeeding,
        health_risk=health_risk,
        preference=PREF_MAP.get(body.preference, "daily"),
        clinic_access=clinic_access,
        parity=body.parity,
        language=_language_name(body.language),
        district=body.district,
        channel="web",
    )


@router.post("/recommend", response_model=WebRecommendResponse)
def api_recommend(body: WebRecommendRequest):
    profile = _to_user_profile(body)
    result = run_recommendation(profile)

    safety = result.safety
    recommendations = []
    for scored in result.ranked_methods[:3]:
        mec_cat = safety.mec_categories.get(scored.method, 1)
        payload = build_method_payload(scored.method, mec_category=mec_cat)
        if mec_cat == 2:
            payload["caution"] = safety.reasons.get(scored.method)
            payload["caution_code"] = safety.reason_codes.get(scored.method)
        recommendations.append(MethodRecommendation(**payload))

    eliminations = [
        SafetyElimination(
            method=method_id,
            reason=safety.reasons.get(method_id, "Not recommended for this profile"),
            reason_code=safety.reason_codes.get(method_id),
            mec_category=safety.mec_categories.get(method_id, 3),
        )
        for method_id in safety.eliminated
    ]

    return WebRecommendResponse(
        recommendations=recommendations,
        safety_eliminations=eliminations,
        recommendation_text=result.recommendation_text,
        alerts=safety.alerts,
    )


@router.post("/chat", response_model=WebChatResponse)
def api_chat(body: WebChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    rag = query_all_collections(body.message, num_results=2)
    context = "\n".join(rag[:2]) if rag else ""
    system = load_system_prompt()
    try:
        reply = chat_completion(
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": (
                        f"Context:\n{context}\n\n"
                        # The triage summary lets answers take the user's health profile into account.
                        + (f"User's triage summary: {body.context['triage_summary']}\n\n" if body.context and body.context.get("triage_summary") else "")
                        + (
                            f"The user is watching a 3D explainer for {body.context.get('method_title') or body.context.get('method')}. "
                            "Keep answers short (2–4 sentences), method-focused, and practical.\n\n"
                            if body.context and body.context.get("mode") == "explainer_3d"
                            else ""
                        )
                        + f"Reply in {_language_name(body.language)}.\nUser: {body.message}"
                    ),
                },
            ],
            max_tokens=400,
            temperature=0.6,
        )
    except Exception as exc:
        reply = _fallback_chat_reply(body.message)

    quick = []
    if body.context and body.context.get("mode") == "side_effects":
        quick = ["Thank you", "Find a clinic"]
    return WebChatResponse(
        reply=reply.strip(),
        quick_replies=quick,
        state=body.context.get("mode") if body.context else None,
        session_id=session_id,
    )


@router.get("/facilities")
def api_facilities(district: str, country: str | None = None, limit: int = 5):
    items = find_nearest_facilities(district, limit=limit, country=country)
    facilities = []
    for f in items:
        services = (f.get("services") or "Family planning").split(",")
        facilities.append(
            {
                "name": f["name"],
                "district": f["district"],
                "lat": f.get("lat"),
                "lng": f.get("lng"),
                "services": [s.strip() for s in services if s.strip()],
                "phone": f.get("phone", "N/A"),
                "hours": "Mon–Fri 8am–5pm",
                "country": f.get("country", ""),
            }
        )
    return {"facilities": facilities, "district": district}


@router.get("/methods")
def api_methods():
    return {"methods": all_methods_list()}


@router.post("/outcomes")
def api_outcomes(body: OutcomeLog):
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
def api_analytics(district: str | None = None):
    return get_outcome_analytics(district=district)


@router.post("/referrals")
def api_create_referral(body: ReferralCreate):
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
def api_list_referrals(district: str | None = None, status: str | None = "open", limit: int = 50):
    return {
        "referrals": list_referrals(district=district, status=status, limit=limit),
        "counts": referral_counts(district=district),
    }


@router.patch("/referrals/{referral_id}")
def api_update_referral(referral_id: int, body: ReferralClaim):
    row = update_referral(referral_id, status=body.status, chw_id=body.chw_id)
    if not row:
        raise HTTPException(status_code=404, detail="Referral not found")
    return row


@router.post("/handoffs")
def api_create_handoff(body: HandoffCreate):
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
def api_referral_contact(referral_id: int):
    data = get_referral_contact_link(referral_id)
    if not data:
        raise HTTPException(status_code=404, detail="Referral not found")
    return data

