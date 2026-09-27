from pathlib import Path

from engine.models import RecommendationResult, SafetyScreenResult, ScoredMethod, UserProfile
from app.openai_client import chat_completion

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_system_prompt() -> str:
    path = PROMPTS_DIR / "system.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return "You are ContraBot, a contraception counselor."


def _format_ranked_methods(ranked: list[ScoredMethod]) -> str:
    lines = []
    for i, item in enumerate(ranked[:3], 1):
        lines.append(f"{i}. {item.label} (score: {item.score:.2f})")
    return "\n".join(lines)


def _format_rag_context(chunks: list[str]) -> str:
    if not chunks:
        return "No additional context retrieved."
    return "\n---\n".join(chunk[:400] for chunk in chunks[:3])


def _format_triage_details(profile: UserProfile) -> str:
    """Prompt lines for the detailed web triage answers; empty for coarse channels."""
    details = {
        "Pregnancy status": profile.pregnancy_status,
        "Time since birth": profile.postpartum,
        "Breastfeeding": profile.breastfeeding_mode,
        "Blood pressure": profile.blood_pressure,
        "Smoking": profile.smoking,
        "Conditions": ", ".join(profile.conditions),
        "Medicines": ", ".join(profile.medications),
        "Fertility plans": profile.fertility_intent,
        "Comfortable with": ", ".join(profile.comfortable_with),
    }
    return "".join(f"- {k}: {v}\n" for k, v in details.items() if v)


def _fallback_recommendation(profile: UserProfile, ranked: list[ScoredMethod], safety: SafetyScreenResult) -> str:
    if not ranked:
        return (
            "Based on your profile, please visit a clinic for a full assessment. "
            "Condoms are widely available without a prescription."
        )
    top = ranked[0]
    msg = f"We suggest: {top.label}."
    if safety.warnings:
        msg += f" Note: {safety.warnings[0]}"
    msg += " Visit a clinic or CHW to confirm."
    return msg[:500]


def generate_recommendation(
    profile: UserProfile,
    safety: SafetyScreenResult,
    ranked: list[ScoredMethod],
    rag_context: list[str],
    max_chars: int | None = None,
) -> RecommendationResult:
    if max_chars is None:
        max_chars = {"ussd": 160, "whatsapp": 300, "web": 500, "chw": 600}.get(profile.channel, 400)

    system_prompt = load_system_prompt()
    from engine.models import LOCAL_NAMES
    local_names_str = ", ".join(f"{method.value}: {', '.join(names)}" for method, names in LOCAL_NAMES.items())

    user_prompt = (
        f"User profile:\n"
        f"- Name: {profile.name or 'unknown'}\n"
        f"- Gender: {profile.gender}\n"
        f"- Age: {profile.age}\n"
        f"- Breastfeeding (<6mo): {profile.breastfeeding}\n"
        f"- Health risk (HTN/migraine/clots): {profile.health_risk}\n"
        f"{_format_triage_details(profile)}"
        f"- Preference: {profile.preference}\n"
        f"- Clinic access: {profile.clinic_access}\n"
        f"- Region/district: {profile.region or profile.district or 'unknown'}\n"
        f"- Output Language requested: {profile.language}\n\n"
        f"Contraceptive local names (use these terms if language is Swahili or Sheng):\n"
        f"{local_names_str}\n\n"
        f"Eliminated methods (MEC): {', '.join(safety.eliminated) or 'none'}\n"
        f"Warnings: {'; '.join(safety.warnings) or 'none'}\n\n"
        f"Ranked methods:\n{_format_ranked_methods(ranked)}\n\n"
        f"Reference context:\n{_format_rag_context(rag_context)}\n\n"
        f"Write a friendly recommendation in {profile.language} addressing them by their name (if known) in under {max_chars} characters for channel '{profile.channel}'."
    )

    try:
        recommendation_text = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=min(400, max_chars // 2 + 50),
            temperature=0.5,
        )
        recommendation_text = recommendation_text.strip()[:max_chars]
    except Exception:
        recommendation_text = _fallback_recommendation(profile, ranked, safety)[:max_chars]

    top_method = ranked[0].method if ranked else "condom"

    return RecommendationResult(
        profile=profile,
        safety=safety,
        ranked_methods=ranked,
        recommendation_text=recommendation_text,
        top_method=top_method,
        rag_context=rag_context,
    )
