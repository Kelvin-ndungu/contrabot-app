"""Shared intake state machine for USSD and WhatsApp channels."""

import re

from engine.models import UserProfile
from engine.pipeline import run_recommendation
from services.facilities import find_nearest_facilities, format_facilities_message

LANGUAGE_OPTIONS = {
    "1": "english",
    "2": "kiswahili",
    "3": "luganda",
    "4": "french",
    "5": "kinyarwanda",
}

LANGUAGE_LABELS = {
    "english": "English",
    "kiswahili": "Kiswahili",
    "luganda": "Luganda",
    "french": "French",
    "kinyarwanda": "Kinyarwanda",
}

STAGES = [
    "language",
    "age",
    "breastfeeding",
    "health_flags",
    "preference",
    "access",
    "district",
    "recommendation",
    "facility_lookup",
]


def new_session(phone: str, channel: str = "ussd") -> dict:
    return {
        "phone_number": phone,
        "channel": channel,
        "stage": "language",
        "language": "english",
        "profile": {},
        "awaiting_facility": False,
    }


def profile_from_session(session: dict) -> UserProfile:
    p = session.get("profile", {})
    return UserProfile(
        age=int(p.get("age", 25)),
        breastfeeding=p.get("breastfeeding") == "yes",
        health_risk=p.get("health_flags") == "yes",
        preference="long_acting" if p.get("preference") == "long_acting" else "daily",
        clinic_access=p.get("clinic_access") != "no",
        parity=p.get("parity") == "yes",
        language=session.get("language", "english"),
        district=p.get("district"),
        region=p.get("region"),
        channel=session.get("channel", "web"),
    )


def get_prompt_for_stage(stage: str, language: str = "english") -> str:
    prompts = {
        "language": (
            "Welcome to ContraBot. Choose language:\n"
            "1. English  2. Kiswahili  3. Luganda\n4. French  5. Kinyarwanda"
        ),
        "age": "Enter your age (years):",
        "breastfeeding": "Breastfeeding baby under 6 months?\n1. Yes  2. No",
        "health_flags": (
            "Any of these? Reply with numbers (e.g. 1,3) or type your own:\n"
            "1. High blood pressure\n"
            "2. Migraine with aura\n"
            "3. Blood clots / DVT\n"
            "4. Diabetes\n"
            "5. Liver disease\n"
            "6. Breast cancer history\n"
            "0. None of these"
        ),
        "preference": (
            "What do you prefer?\n"
            "1. Daily pill\n"
            "2. Set-and-forget (long-acting)\n"
            "Or type what you want in your own words."
        ),
        "access": "Can you visit a clinic for FP services?\n1. Yes  2. No",
        "district": "Enter your district (e.g. Nairobi, Kampala):",
        "facility_offer": "Find nearest clinic?\n1. Yes  2. No",
    }
    return prompts.get(stage, "Thank you.")


HEALTH_FLAG_MAP = {
    "1": "high_blood_pressure",
    "2": "migraines_aura",
    "3": "blood_clots",
    "4": "diabetes",
    "5": "liver_disease",
    "6": "breast_cancer",
    "high blood pressure": "high_blood_pressure",
    "hypertension": "high_blood_pressure",
    "migraine": "migraines_aura",
    "migraines": "migraines_aura",
    "blood clot": "blood_clots",
    "blood clots": "blood_clots",
    "dvt": "blood_clots",
    "diabetes": "diabetes",
    "liver": "liver_disease",
    "breast cancer": "breast_cancer",
}


def parse_health_selection(text: str) -> tuple[str, list[str], str | None]:
    """
    Parse multi-select health answers.
    Returns (health_flags yes/no, selected flag ids, free_text_or_none).
    """
    raw = (text or "").strip()
    lowered = raw.lower()
    if not raw:
        return "no", [], None
    if lowered in ("0", "none", "no", "2", "health_no", "none of these", "hapana", "zii"):
        return "no", [], None
    if lowered in ("1", "yes", "health_yes", "ndiyo", "ndio"):
        # legacy single yes without specifics
        return "yes", [], None

    selected: list[str] = []
    # numbers like 1,3 or 1 3 or 1and3
    tokens = [t for t in re.split(r"[\s,;/|+]+", lowered) if t]
    for t in tokens:
        if t in HEALTH_FLAG_MAP:
            flag = HEALTH_FLAG_MAP[t]
            if flag not in selected:
                selected.append(flag)
        elif t.isdigit() and t in HEALTH_FLAG_MAP:
            flag = HEALTH_FLAG_MAP[t]
            if flag not in selected:
                selected.append(flag)

    # phrase scan for free text
    for phrase, flag in HEALTH_FLAG_MAP.items():
        if not phrase.isdigit() and phrase in lowered and flag not in selected:
            selected.append(flag)

    if selected:
        return "yes", selected, None

    # free-form concern the user typed
    if len(raw) >= 3 and lowered not in ("1", "2"):
        return "yes", [], raw[:300]

    return "no", [], None


def process_intake_input(session: dict, user_input: str) -> tuple[dict, str, bool]:
    """
    Process one user input in the intake flow.
    Returns (updated_session, response_message, end_session).
    """
    stage = session.get("stage", "language")
    profile = session.setdefault("profile", {})
    text = (user_input or "").strip()
    channel = session.get("channel", "ussd")
    max_chars = 160 if channel == "ussd" else 300
    lang = session.get("language", "english")

    if session.get("awaiting_facility"):
        if text in ("1", "yes", "y"):
            district = profile.get("district", "Nairobi")
            facilities = find_nearest_facilities(district)
            msg = format_facilities_message(facilities, max_chars=max_chars)
            session["awaiting_facility"] = False
            return session, msg, True
        return session, "Thank you. Visit a CHW when ready.", True

    if stage == "language":
        selected = LANGUAGE_OPTIONS.get(text, "english" if text.lower() in LANGUAGE_LABELS else None)
        if not selected:
            return session, "Invalid. " + get_prompt_for_stage("language"), False
        session["language"] = selected
        session["stage"] = "age"
        return session, get_prompt_for_stage("age"), False

    if stage == "age":
        if not text.isdigit() or not (10 <= int(text) <= 55):
            return session, "Enter a valid age (10-55):", False
        profile["age"] = text
        session["stage"] = "breastfeeding"
        return session, get_prompt_for_stage("breastfeeding"), False

    if stage == "breastfeeding":
        if text not in ("1", "2", "breastfeeding_yes", "breastfeeding_no", "yes", "no"):
            return session, get_prompt_for_stage("breastfeeding"), False
        profile["breastfeeding"] = "yes" if text in ("1", "breastfeeding_yes", "yes") else "no"
        session["stage"] = "health_flags"
        return session, get_prompt_for_stage("health_flags"), False

    if stage == "health_flags":
        flag_status, flags, free_text = parse_health_selection(text)
        profile["health_flags"] = flag_status
        profile["health_flag_list"] = flags
        if free_text:
            profile["other_concerns"] = free_text
        session["stage"] = "preference"
        return session, get_prompt_for_stage("preference"), False

    if stage == "preference":
        lowered = text.lower()
        if text in ("pref_type", "type") or lowered in ("i'll type", "ill type", "nitaandika", "andika"):
            session["awaiting_pref_text"] = True
            if lang == "kiswahili":
                return session, "Andika unavyopendelea kwa maneno yako:", False
            return session, "Type what you prefer in your own words:", False
        if session.get("awaiting_pref_text"):
            session.pop("awaiting_pref_text", None)
            profile["preference"] = "daily"
            profile["preference_notes"] = text[:300]
            session["stage"] = "access"
            return session, get_prompt_for_stage("access"), False
        if text in ("1", "daily") or "daily" in lowered or "pill" in lowered:
            profile["preference"] = "daily"
        elif text in ("2", "long_acting", "long-acting") or "forget" in lowered or "implant" in lowered or "iud" in lowered:
            profile["preference"] = "long_acting"
        elif len(text) >= 3:
            # free-text preference typed directly
            profile["preference"] = "daily"
            profile["preference_notes"] = text[:300]
        else:
            return session, get_prompt_for_stage("preference"), False
        session.pop("awaiting_pref_text", None)
        session["stage"] = "access"
        return session, get_prompt_for_stage("access"), False

    if stage == "access":
        if text not in ("1", "2", "access_yes", "access_no", "yes", "no"):
            # allow free text note then ask again simply
            if len(text) >= 3:
                profile["access_notes"] = text[:300]
                profile["clinic_access"] = "yes"
                session["stage"] = "district"
                return session, get_prompt_for_stage("district"), False
            return session, get_prompt_for_stage("access"), False
        profile["clinic_access"] = "yes" if text in ("1", "access_yes", "yes") else "no"
        session["stage"] = "district"
        return session, get_prompt_for_stage("district"), False

    if stage == "district":
        if len(text) < 2:
            return session, "Please enter your district name:", False
        profile["district"] = text
        session["stage"] = "recommendation"
        user_profile = profile_from_session(session)
        result = run_recommendation(user_profile)
        session["last_recommendation"] = result.model_dump()
        rec = result.recommendation_text[:max_chars]
        if channel == "ussd":
            session["awaiting_facility"] = True
            return session, rec + "\nFind clinic?\n1. Yes  2. No", False
        session["awaiting_facility"] = True
        return session, rec + "\n\nReply 1 to find nearest clinic, 2 to finish.", False

    return session, "Session error. Please start again.", True
