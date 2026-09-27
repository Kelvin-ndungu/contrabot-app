"""Frontend API routes under /api prefix."""

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api_schemas import (
    WebChatRequest,
    WebChatResponse,
    ChatSource,
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
from services.knowledge import query_all_collections, retrieve
from services.chat_router import mentions_assault, route_message
from app.openai_client import chat_completion

router = APIRouter()

# How many earlier messages are sent back to the model with each new question.
HISTORY_TURNS = 6

_CHAT_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "chat_system.txt"
CHAT_SYSTEM_PROMPT = (
    _CHAT_PROMPT_PATH.read_text(encoding="utf-8")
    if _CHAT_PROMPT_PATH.exists()
    else "You are {doctor}, a kind family planning doctor in Kenya. Use simple words and short sentences."
)

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


STYLE_NAMES = {"en": "English", "sw": "Kiswahili", "sheng": "Sheng"}

DEFAULT_DOCTOR = "Dr. Amara"

TRIAGE_REPLY = {
    "en": (
        "I would love to help you choose. First I need to know a little about you and your body, "
        "so I can tell you what is safe for you. It is quick, and it stays private. "
        "Tap \"Start the questions\" below when you are ready."
    ),
    "sw": (
        "Ningependa kukusaidia kuchagua. Kwanza nahitaji kujua kidogo kuhusu wewe na mwili wako, "
        "ili nikuambie kilicho salama kwako. Ni haraka, na ni siri. "
        "Bonyeza \"Anza maswali\" hapa chini ukiwa tayari."
    ),
    "sheng": (
        "Poa, nitakusaidia kuchagua. Kwanza nataka kujua kiasi kuhusu wewe na body yako, "
        "ndio nikuambie kitu iko safe kwako. Ni haraka na ni siri. "
        "Bonyeza \"Anza maswali\" hapo chini ukiwa ready."
    ),
}
# Safety messages stay in standard Kiswahili for Sheng speakers, so nothing is lost in slang.
URGENT_PREFIX = {
    "en": "This could be serious. Please go to the nearest health facility now, or call 999 or 112 in an emergency.",
    "sw": "Hii inaweza kuwa hatari. Tafadhali nenda kwenye kituo cha afya kilicho karibu sasa hivi, au piga 999 au 112 wakati wa dharura.",
}
ASSAULT_NOTE = {
    "en": (
        "If you were forced to have sex, go to a facility as soon as you can: emergency contraception works "
        "up to 5 days after, and medicine to prevent HIV (PEP) must start within 72 hours. You can call the "
        "free GBV helpline on 1195."
    ),
    "sw": (
        "Kama ulilazimishwa kufanya ngono, nenda kituo cha afya haraka iwezekanavyo: dawa ya dharura ya kuzuia "
        "mimba hufanya kazi hadi siku 5 baadaye, na dawa ya kuzuia HIV (PEP) lazima ianzishwe ndani ya saa 72. "
        "Unaweza kupiga simu ya bure ya GBV 1195."
    ),
}
GREETING_FALLBACK = {
    "en": "Hi! I'm here to answer your questions about contraception and family planning. What would you like to know?",
    "sw": "Habari! Niko hapa kujibu maswali yako kuhusu uzazi wa mpango. Ungependa kujua nini?",
    "sheng": "Niaje! Niko hapa kukujibu maswali za family planning. Unataka kujua nini?",
}


def _lang_code(language: str) -> str:
    return "sw" if language.lower() in ("sw", "kiswahili", "swahili") else "en"


def _to_english(text: str) -> str:
    # The guidelines and the embedding model are English-only, so other languages retrieve poorly.
    try:
        out = chat_completion(
            messages=[
                {"role": "system", "content": "Translate the user's text to English. Reply with the translation only."},
                {"role": "user", "content": text},
            ],
            task="router",
            temperature=0,
            max_tokens=120,
        )
        return out.strip() or text
    except Exception:
        return text


def _retrieval_query(body: WebChatRequest, style: str, routed_query: str = "") -> str:
    # The router already rewrote the message as a standalone English query; this is the fallback.
    if routed_query:
        return routed_query
    # Short follow-ups ("and for implants?") need the previous question to retrieve well.
    last_user = next((t.content for t in reversed(body.history) if t.role == "user"), "")
    query = f"{last_user} {body.message}" if last_user and len(body.message.split()) < 6 else body.message
    return query if style == "en" else _to_english(query)


def _clean_reply(reply: str) -> tuple[str, set[int]]:
    """Return the reply as the person should see it, and the excerpt numbers it cited.

    The model marks each fact with [n] so answers stay grounded and auditable; the markers are
    removed from the text because they mean nothing to the person reading it."""
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", reply)}
    reply = re.sub(r"\s*\[\d+\]", "", reply)
    # The chat bubble shows plain text; drop markdown bullets and bold if the model adds them.
    reply = re.sub(r"^\s*[*\-•]\s+", "", reply, flags=re.M).replace("**", "")
    return reply.strip(), cited


def _history(body: WebChatRequest) -> list[dict]:
    return [{"role": t.role, "content": t.content} for t in body.history[-HISTORY_TURNS:]]


def _system_prompt(body: WebChatRequest) -> str:
    return CHAT_SYSTEM_PROMPT.replace("{doctor}", (body.context or {}).get("doctor") or DEFAULT_DOCTOR)


def _answer_from_guidelines(
    body: WebChatRequest, style: str, routed_query: str = "", urgent: bool = False
) -> tuple[str, list[ChatSource]]:
    hits = retrieve(_retrieval_query(body, style, routed_query), k=5)
    excerpts = "\n\n".join(
        f"[{i}] ({h['citation']}{', ' + h['chapter'] if h.get('chapter') else ''})\n{h['text']}" for i, h in enumerate(hits, 1)
    )
    triage_summary = (body.context or {}).get("triage_summary")
    prompt = (
        f"Guideline excerpts:\n{excerpts or '(none found)'}\n\n"
        + (f"The person's triage summary: {triage_summary}\n\n" if triage_summary else "")
        + ("The person may be describing an emergency. A line telling them to get care now is already shown; "
           "add only what else they should know.\n\n" if urgent else "")
        + f"Reply in {STYLE_NAMES[style]}.\nMessage: {body.message}"
    )
    reply = chat_completion(
        messages=[{"role": "system", "content": _system_prompt(body)}, *_history(body), {"role": "user", "content": prompt}],
        max_tokens=600,
        temperature=0.3,
    )
    reply, cited = _clean_reply(reply)
    # Not shown under each reply; the page keeps them so "where is this from?" can be answered.
    sources, seen = [], set()
    for i, h in enumerate(hits, 1):
        if i in cited and h["citation"] not in seen:
            seen.add(h["citation"])
            sources.append(ChatSource(ref=i, citation=h["citation"], chapter=h.get("chapter") or None))
    return reply, sources


def _small_talk(body: WebChatRequest, style: str) -> str:
    first = not any(t.role == "assistant" for t in body.history[1:])
    prompt = (
        "This message is small talk (a greeting, thanks, goodbye, a question about you or where your "
        "information comes from) and needs no guideline excerpts. Reply naturally in 1 to 3 short sentences"
        + (", say you are here to help them understand family planning, and gently ask what brings them here today"
           if first else "")
        + f". Reply in {STYLE_NAMES[style]}.\nMessage: {body.message}"
    )
    reply = chat_completion(
        messages=[{"role": "system", "content": _system_prompt(body)}, *_history(body), {"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.7,
    )
    return _clean_reply(reply)[0]


@router.post("/chat", response_model=WebChatResponse)
def api_chat(body: WebChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    has_triage = bool((body.context or {}).get("triage_summary"))
    decision = route_message(body.message, has_triage=has_triage, history=_history(body))
    # Reply in the style the person wrote in; the UI language is the fallback.
    style = decision.lang or _lang_code(body.language)
    fixed = "en" if style == "en" else "sw"

    sources = []
    if decision.route == "triage":
        reply = TRIAGE_REPLY[style]
    elif decision.route == "chat":
        try:
            reply = _small_talk(body, style)
        except Exception:
            reply = GREETING_FALLBACK[style]
    else:
        urgent = decision.route == "urgent"
        try:
            reply, sources = _answer_from_guidelines(body, style, decision.query, urgent=urgent)
        except Exception:
            reply, sources = ("" if urgent else _fallback_chat_reply(body.message)), []
        if urgent:
            lead = URGENT_PREFIX[fixed] + (" " + ASSAULT_NOTE[fixed] if mentions_assault(body.message) else "")
            reply = f"{lead}\n\n{reply}".strip()

    quick = []
    if body.context and body.context.get("mode") == "side_effects":
        quick = ["Thank you", "Find a clinic"]
    return WebChatResponse(
        reply=reply,
        quick_replies=quick,
        state=body.context.get("mode") if body.context else None,
        session_id=session_id,
        route=decision.route,
        sources=sources,
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

