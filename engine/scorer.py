"""
5-dimension weighted scoring for contraceptive method ranking.
Dimensions: effectiveness, convenience, cost/access, reversibility, side-effect profile.
"""

from engine.models import (
    ContraceptiveMethod,
    METHOD_LABELS,
    METHOD_METADATA,
    ScoredMethod,
    SafetyScreenResult,
    UserProfile,
)

WEIGHTS = {
    "effectiveness": 0.25,
    "convenience": 0.25,
    "cost_access": 0.20,
    "reversibility": 0.15,
    "side_effects": 0.15,
}


def _convenience_score(method: ContraceptiveMethod, profile: UserProfile) -> float:
    meta = METHOD_METADATA[method]
    if profile.preference == "non_hormonal":
        if method in (ContraceptiveMethod.CONDOM, ContraceptiveMethod.IUD_COPPER):
            return 0.95
        if method in (ContraceptiveMethod.COC, ContraceptiveMethod.POP, ContraceptiveMethod.INJECTABLE, ContraceptiveMethod.IMPLANT, ContraceptiveMethod.IUD_LNG):
            return 0.2
    if profile.preference == "daily":
        return meta["convenience_daily"]
    return meta["convenience_laa"]


def _cost_access_score(method: ContraceptiveMethod, profile: UserProfile) -> float:
    meta = METHOD_METADATA[method]
    score = meta["cost_score"]
    if not profile.clinic_access and meta["requires_clinic"]:
        score *= 0.4
    return score


METHOD_STYLE = {
    ContraceptiveMethod.COC: "pill",
    ContraceptiveMethod.POP: "pill",
    ContraceptiveMethod.INJECTABLE: "injection",
    ContraceptiveMethod.IMPLANT: "implant",
    ContraceptiveMethod.IUD_COPPER: "iud",
    ContraceptiveMethod.IUD_LNG: "iud",
    ContraceptiveMethod.CONDOM: "condom",
}
LONG_ACTING = (ContraceptiveMethod.IMPLANT, ContraceptiveMethod.IUD_COPPER, ContraceptiveMethod.IUD_LNG)


def _fit_adjustment(method: ContraceptiveMethod, profile: UserProfile) -> float:
    """Shift the score by the detailed triage preferences. Never changes eligibility."""
    adj = 0.0
    style = METHOD_STYLE.get(method)
    if profile.comfortable_with and style:
        adj += 0.15 if style in profile.comfortable_with else -0.25
    if profile.fertility_intent == "within_2y" and method == ContraceptiveMethod.INJECTABLE:
        adj -= 0.1  # fertility can take up to ~10 months to return
    if method == ContraceptiveMethod.STERILIZATION:
        adj += 0.1 if profile.fertility_intent == "no_more" else -0.5
    if profile.fertility_intent == "no_more" and method in LONG_ACTING:
        adj += 0.05
    if profile.bleeding_changes_ok is False and method in (ContraceptiveMethod.INJECTABLE, ContraceptiveMethod.IMPLANT):
        adj -= 0.1
    if profile.needs_privacy:
        if method == ContraceptiveMethod.CONDOM:
            adj -= 0.1
        elif method in LONG_ACTING or method == ContraceptiveMethod.INJECTABLE:
            adj += 0.05
    if profile.sti_protection and method == ContraceptiveMethod.CONDOM:
        adj += 0.1
    if profile.clinic_visits == "hard":
        if method == ContraceptiveMethod.INJECTABLE:
            adj -= 0.1  # needs a visit every 3 months
        elif method in (ContraceptiveMethod.COC, ContraceptiveMethod.POP):
            adj -= 0.05  # needs regular refills
        elif method in LONG_ACTING:
            adj += 0.05  # one visit lasts years
    elif profile.clinic_visits == "sometimes" and method == ContraceptiveMethod.INJECTABLE:
        adj -= 0.05
    return adj


def score_method(method: ContraceptiveMethod, profile: UserProfile) -> ScoredMethod:
    meta = METHOD_METADATA[method]
    breakdown = {
        "effectiveness": meta["effectiveness"],
        "convenience": _convenience_score(method, profile),
        "cost_access": _cost_access_score(method, profile),
        "reversibility": meta["reversibility"],
        "side_effects": meta["side_effect_score"],
    }
    total = sum(breakdown[dim] * WEIGHTS[dim] for dim in WEIGHTS) + _fit_adjustment(method, profile)
    return ScoredMethod(
        method=method.value,
        label=METHOD_LABELS[method],
        score=round(total, 4),
        breakdown={k: round(v, 3) for k, v in breakdown.items()},
    )


def rank_methods(profile: UserProfile, safety: SafetyScreenResult, top_n: int = 5) -> list[ScoredMethod]:
    # Emergency pills are a backup, never a regular recommendation.
    eligible = [ContraceptiveMethod(m) for m in safety.eligible if m != ContraceptiveMethod.EMERGENCY.value]
    scored = [score_method(m, profile) for m in eligible]
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:top_n]


def score_methods(user_input: dict, eliminations: list[dict]) -> list[str]:
    """Score methods function for compatibility with the reproducibility package."""
    eliminated_names = {e['method'] for e in eliminations}

    # Base scores
    scores = {
        "hormonal_implant": 0.8,
        "copper_iud": 0.75,
        "POP": 0.7,
        "DMPA": 0.65,
        "condoms": 0.6,
        "COC": 0.55,
        "combined_patch": 0.5,
        "combined_ring": 0.45
    }

    # Adjustments based on pregnancy goal
    goal = user_input.get("pregnancy_goal", "")
    if goal == "avoid_long_term":
        scores["hormonal_implant"] += 0.2
        scores["copper_iud"] += 0.15
    elif goal == "spacing_1_3_years":
        scores["POP"] += 0.20
        scores["copper_iud"] += 0.11
        scores["DMPA"] += 0.17
        scores["hormonal_implant"] -= 0.10

    # Adjustments based on access
    access = user_input.get("access", "")
    if access == "pharmacy_only":
        # Penalize clinic-based methods
        scores["hormonal_implant"] -= 0.6
        scores["copper_iud"] -= 0.4
        scores["DMPA"] -= 0.4

    # Filter out eliminated
    available = [m for m in scores if m not in eliminated_names]
    # Sort by score descending
    available.sort(key=lambda m: scores[m], reverse=True)
    return available

