"""
Pure-Python WHO MEC safety screen (5th edition, 2015; categories for starting a method).
Eliminates methods based on user health flags — no LLM involved.
MEC categories: 1=use, 2=benefits outweigh risks, 3=risks outweigh, 4=do not use.

Every rule only raises a method's category, so the strictest applicable rule wins.
"""

from engine.models import ContraceptiveMethod as M, METHOD_LABELS, SafetyScreenResult, UserProfile

ALL_METHODS = list(M)
FEMALE_ONLY = (M.COC, M.POP, M.INJECTABLE, M.IMPLANT, M.IUD_COPPER, M.IUD_LNG, M.LAM, M.EMERGENCY)
HORMONAL = (M.COC, M.POP, M.INJECTABLE, M.IMPLANT, M.IUD_LNG)
PROGESTOGEN_ONLY = (M.POP, M.INJECTABLE, M.IMPLANT, M.IUD_LNG)
IUDS = (M.IUD_COPPER, M.IUD_LNG)
EARLY_POSTPARTUM = {"lt48h", "2d_3w", "3_4w", "4_6w"}
WITHIN_6_MONTHS = EARLY_POSTPARTUM | {"6w_6m"}

# Stable reason codes (the web app translates them); the text is the English fallback.
REASONS = {
    "no_restriction": "No restriction for this profile.",
    "female_only": "This method is for females only.",
    "health_risk": "Combined hormonal methods are contraindicated with hypertension, migraine with aura, or clot history.",
    "health_risk_lng": "Hormonal IUD may carry additional risk with cardiovascular conditions — clinic review needed.",
    "breastfeeding_under_6m": "Combined pills may reduce milk supply before 6 months postpartum.",
    "lam_not_breastfeeding": "LAM only works while breastfeeding.",
    "adolescent_sterilization": "Permanent sterilization is not appropriate for adolescents.",
    "adolescent": "Adolescents may use with counseling and follow-up.",
    "needs_provider": "This method requires a trained provider — limited access may be a barrier.",
    "under_20_iud": "Under 20: slightly higher chance the IUD comes out.",
    "age_40_coc": "40 or older: higher heart and clot risk with estrogen.",
    "age_45_injectable": "Over 45: possible small effect on bone density.",
    "pregnant": "Contraception isn't needed during pregnancy.",
    "pregnancy_not_ruled_out": "Pregnancy not ruled out: an IUD can't be inserted during pregnancy.",
    "bf_under_6w": "Breastfeeding, under 6 weeks since birth.",
    "bf_6w_6m": "Breastfeeding, 6 weeks to 6 months after birth: estrogen may reduce milk.",
    "bf_over_6m": "Breastfeeding, more than 6 months after birth.",
    "pp_under_3w": "Under 3 weeks since birth: high clot risk.",
    "pp_3_6w": "3 to 6 weeks since birth: raised clot risk.",
    "pp_iud_timing": "48 hours to 4 weeks after birth: insert an IUD within 48 hours or from 4 weeks.",
    "pp_lng_48h_bf": "Within 48 hours of birth while breastfeeding.",
    "lam_over_6m": "LAM only works in the first 6 months after birth.",
    "lam_not_exclusive": "LAM needs breast milk only, day and night.",
    "lam_periods_back": "LAM stops working once periods return.",
    "bp_controlled": "High blood pressure, controlled with treatment.",
    "bp_140_159": "Blood pressure 140–159 / 90–99.",
    "bp_160_plus": "Blood pressure 160/100 or more.",
    "bp_unknown": "High blood pressure, not measured recently.",
    "migraine_aura": "Migraine with aura: stroke risk with estrogen.",
    "migraine_aura_po": "Migraine with aura.",
    "migraine": "Migraine without aura.",
    "migraine_35": "Migraine without aura, age 35 or older.",
    "smoker": "Smokes.",
    "smoker_35": "Smokes, age 35 or older.",
    "smoker_35_heavy": "Smokes 15 or more a day, age 35 or older.",
    "blood_clot": "Past blood clot (DVT/PE).",
    "stroke_heart": "Stroke or heart disease.",
    "diabetes_complications": "Diabetes with complications.",
    "diabetes": "Diabetes.",
    "liver_disease": "Serious liver disease.",
    "breast_cancer_current": "Breast cancer now.",
    "breast_cancer_past": "Past breast cancer.",
    "cervical_cancer": "Cancer of the cervix or womb, awaiting treatment.",
    "heavy_periods": "Heavy or painful periods: the copper IUD can make them heavier.",
    "unexplained_bleeding_iud": "Unexplained bleeding: check the cause before insertion.",
    "unexplained_bleeding": "Unexplained bleeding: check the cause first.",
    "sti_signs": "Signs of infection: treat before inserting an IUD.",
    "rifampicin": "Rifampicin can make this method less effective.",
    "anticonvulsant": "This epilepsy medicine can make this method less effective.",
    "lamotrigine": "The combined pill lowers lamotrigine levels.",
    "efavirenz": "Efavirenz or nevirapine may make this method less effective.",
    "ritonavir": "Ritonavir can make this method less effective.",
}


def _mec_table(profile: UserProfile) -> dict[M, tuple[int, str]]:
    """Return (MEC category, reason code) for each method given the profile."""
    table = {method: (1, "no_restriction") for method in ALL_METHODS}

    def restrict(methods, category: int, code: str) -> None:
        for method in methods:
            if category > table[method][0]:
                table[method] = (category, code)

    if profile.gender == "male":
        restrict(FEMALE_ONLY, 4, "female_only")

    # Coarse flags used by USSD and WhatsApp. The detailed breastfeeding answers replace the flag.
    if profile.health_risk:
        restrict([M.COC], 4, "health_risk")
        restrict([M.IUD_LNG], 3, "health_risk_lng")
    if profile.breastfeeding_mode is None:
        if profile.breastfeeding:
            restrict([M.COC], 3, "breastfeeding_under_6m")
        else:
            restrict([M.LAM], 4, "lam_not_breastfeeding")
    if profile.age < 18:
        restrict([M.STERILIZATION], 4, "adolescent_sterilization")
        restrict([M.COC, M.POP, M.INJECTABLE, M.IMPLANT], 2, "adolescent")
    if not profile.clinic_access:
        restrict([M.INJECTABLE, M.IMPLANT, M.IUD_COPPER, M.IUD_LNG, M.STERILIZATION], 3, "needs_provider")

    if profile.gender != "male":
        _detailed_rules(profile, restrict)

    return table


def _detailed_rules(p: UserProfile, restrict) -> None:
    """Rules for the detailed web triage. Fields a channel didn't ask stay None and add nothing."""
    if p.age < 20:
        restrict(IUDS, 2, "under_20_iud")
    if p.age >= 40:
        restrict([M.COC], 2, "age_40_coc")
    if p.age > 45:
        restrict([M.INJECTABLE], 2, "age_45_injectable")

    if p.pregnancy_status == "pregnant":
        restrict([m for m in ALL_METHODS if m is not M.CONDOM], 4, "pregnant")
    elif p.pregnancy_status == "unsure":
        restrict(IUDS, 4, "pregnancy_not_ruled_out")

    # Birth and breastfeeding
    pp = p.postpartum
    breastfeeding = p.breastfeeding_mode in ("exclusive", "partial")
    if breastfeeding:
        if pp in EARLY_POSTPARTUM:
            restrict([M.COC], 4, "bf_under_6w")
            restrict([M.INJECTABLE], 3, "bf_under_6w")
            restrict([M.POP, M.IMPLANT], 2, "bf_under_6w")
        elif pp == "6w_6m":
            restrict([M.COC], 3, "bf_6w_6m")
        else:
            restrict([M.COC], 2, "bf_over_6m")
    elif p.breastfeeding_mode == "none":
        if pp in ("lt48h", "2d_3w"):
            restrict([M.COC], 4, "pp_under_3w")
        elif pp in ("3_4w", "4_6w"):
            restrict([M.COC], 2, "pp_3_6w")
    if pp in ("2d_3w", "3_4w"):
        restrict(IUDS, 3, "pp_iud_timing")
    if pp == "lt48h" and breastfeeding:
        restrict([M.IUD_LNG], 2, "pp_lng_48h_bf")
    if p.breastfeeding_mode is not None:
        if pp not in WITHIN_6_MONTHS:
            restrict([M.LAM], 4, "lam_over_6m")
        elif p.breastfeeding_mode != "exclusive":
            restrict([M.LAM], 4, "lam_not_exclusive")
        elif p.periods_returned:
            restrict([M.LAM], 4, "lam_periods_back")

    # Blood pressure
    bp = p.blood_pressure
    if bp in ("controlled", "140_159"):
        code = "bp_controlled" if bp == "controlled" else "bp_140_159"
        restrict([M.COC], 3, code)
        restrict([M.INJECTABLE], 2, code)
    elif bp == "160_plus":
        restrict([M.COC], 4, "bp_160_plus")
        restrict([M.INJECTABLE], 3, "bp_160_plus")
        restrict([M.POP, M.IMPLANT, M.IUD_LNG], 2, "bp_160_plus")
    elif bp == "unknown":
        restrict([M.COC], 3, "bp_unknown")
        restrict(PROGESTOGEN_ONLY, 2, "bp_unknown")

    conditions = set(p.conditions)
    if "migraine_aura" in conditions:
        restrict([M.COC], 4, "migraine_aura")
        restrict(PROGESTOGEN_ONLY, 2, "migraine_aura_po")
    elif "migraine" in conditions:
        restrict([M.COC], 3 if p.age >= 35 else 2, "migraine_35" if p.age >= 35 else "migraine")

    if p.smoking in ("under_15", "15_plus"):
        if p.age < 35:
            restrict([M.COC], 2, "smoker")
        elif p.smoking == "15_plus":
            restrict([M.COC], 4, "smoker_35_heavy")
        else:
            restrict([M.COC], 3, "smoker_35")

    if "blood_clot" in conditions:
        restrict([M.COC], 4, "blood_clot")
        restrict(PROGESTOGEN_ONLY, 2, "blood_clot")
    if "stroke_heart" in conditions:
        restrict([M.COC], 4, "stroke_heart")
        restrict([M.INJECTABLE], 3, "stroke_heart")
        restrict([M.POP, M.IMPLANT, M.IUD_LNG], 2, "stroke_heart")
    if "diabetes_complications" in conditions:
        restrict([M.COC, M.INJECTABLE], 3, "diabetes_complications")
        restrict([M.POP, M.IMPLANT, M.IUD_LNG], 2, "diabetes_complications")
    elif "diabetes" in conditions:
        restrict(HORMONAL, 2, "diabetes")
    if "liver_disease" in conditions:
        restrict([M.COC], 4, "liver_disease")
        restrict(PROGESTOGEN_ONLY, 3, "liver_disease")
    if "breast_cancer_current" in conditions:
        restrict(HORMONAL, 4, "breast_cancer_current")
    elif "breast_cancer_past" in conditions:
        restrict(HORMONAL, 3, "breast_cancer_past")
    if "cervical_cancer" in conditions:
        restrict(IUDS, 4, "cervical_cancer")
    if "heavy_periods" in conditions:
        restrict([M.IUD_COPPER], 2, "heavy_periods")
    if "unexplained_bleeding" in conditions:
        restrict(IUDS, 4, "unexplained_bleeding_iud")
        restrict([M.INJECTABLE, M.IMPLANT], 3, "unexplained_bleeding")
        restrict([M.COC, M.POP], 2, "unexplained_bleeding")
    if "sti_signs" in conditions:
        restrict(IUDS, 4, "sti_signs")

    medications = set(p.medications)
    if "rifampicin" in medications:
        restrict([M.COC, M.POP], 3, "rifampicin")
        restrict([M.IMPLANT], 2, "rifampicin")
    if "anticonvulsant" in medications:
        restrict([M.COC, M.POP], 3, "anticonvulsant")
        restrict([M.IMPLANT], 2, "anticonvulsant")
    if "lamotrigine" in medications:
        restrict([M.COC], 3, "lamotrigine")
    if "efavirenz" in medications:
        restrict([M.COC, M.POP, M.IMPLANT], 2, "efavirenz")
    if "ritonavir" in medications:
        restrict([M.COC, M.POP], 3, "ritonavir")
        restrict([M.IMPLANT], 2, "ritonavir")


def _alerts(profile: UserProfile) -> list[str]:
    alerts = []
    if profile.pregnancy_status == "pregnant":
        alerts.append("pregnant")
    elif profile.unprotected_sex_5d:
        alerts.append("emergency_contraception")
    if profile.pregnancy_status == "unsure":
        alerts.append("pregnancy_test")
    if profile.sti_protection:
        alerts.append("add_condoms")
    if profile.fertility_intent == "no_more":
        alerts.append("permanent_option")
    return alerts


def screen_methods(profile: UserProfile) -> SafetyScreenResult:
    mec = _mec_table(profile)
    eliminated: list[str] = []
    eligible: list[str] = []
    mec_categories: dict[str, int] = {}
    reason_codes: dict[str, str] = {}
    reasons: dict[str, str] = {}
    warnings: list[str] = []

    for method, (category, code) in mec.items():
        key = method.value
        mec_categories[key] = category
        reason_codes[key] = code
        reasons[key] = REASONS[code]
        if category >= 3:
            eliminated.append(key)
            if category == 4:
                warnings.append(f"{METHOD_LABELS[method]}: {REASONS[code]}")
        else:
            eligible.append(key)

    if profile.health_risk:
        warnings.insert(
            0,
            "Based on your health history, please visit a clinic before starting any hormonal method.",
        )

    return SafetyScreenResult(
        eliminated=eliminated,
        mec_categories=mec_categories,
        warnings=warnings,
        eligible=eligible,
        reason_codes=reason_codes,
        reasons=reasons,
        alerts=_alerts(profile),
    )


def safety_screen(user_input: dict) -> list[dict]:
    """Safety screen function for compatibility with the reproducibility package."""
    eliminated = []

    # 1. Breastfeeding < 6 months postpartum contraindicates combined hormonal methods
    is_breastfeeding = user_input.get("breastfeeding", False)
    infant_months = user_input.get("breastfeeding_infant_months")
    if is_breastfeeding and infant_months is not None and infant_months < 6:
        eliminated.append({"method": "COC", "reason": "breastfeeding_under_6_months_COC_contraindicated"})
        eliminated.append({"method": "combined_patch", "reason": "breastfeeding_under_6_months_patch_contraindicated"})

    # 2. Migraines with aura or hypertension contraindicates combined hormonal methods
    health_flags = user_input.get("health_flags", [])
    if "migraines_with_aura" in health_flags or "hypertension" in health_flags:
        if "migraines_with_aura" in health_flags:
            eliminated.append({"method": "COC", "reason": "migraines_with_aura_combined_hormonal_contraindicated"})
            eliminated.append({"method": "combined_patch", "reason": "migraines_with_aura_combined_hormonal_contraindicated"})
            eliminated.append({"method": "combined_ring", "reason": "migraines_with_aura_combined_hormonal_contraindicated"})
        if "hypertension" in health_flags:
            if not any(e["method"] == "COC" for e in eliminated):
                eliminated.append({"method": "COC", "reason": "hypertension_COC_contraindicated"})
            if not any(e["method"] == "combined_patch" for e in eliminated):
                eliminated.append({"method": "combined_patch", "reason": "hypertension_patch_contraindicated"})
            if not any(e["method"] == "combined_ring" for e in eliminated):
                eliminated.append({"method": "combined_ring", "reason": "hypertension_ring_contraindicated"})

    # Deduplicate keeping order
    unique_eliminated = []
    seen = set()
    for item in eliminated:
        if item["method"] not in seen:
            seen.add(item["method"])
            unique_eliminated.append(item)

    return unique_eliminated
