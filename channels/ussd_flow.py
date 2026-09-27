"""
USSD flow aligned with the web app: choose Triage (recommendation) or Chat (ask a question).

Africa's Talking sends sessionId, phoneNumber, text (path joined by *).
Each reply is the last segment of `text`. Responses must start with CON or END.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

from engine.models import UserProfile
from engine.pipeline import run_recommendation
from services.facilities import find_nearest_facilities, format_facilities_message
from services.knowledge import query_all_collections
from app.counseling import get_counseling_response

# Soft limit for CON screens (GSM). END can be a bit longer for the result.
USSD_MAX = 160

Option = tuple[str, str]  # (value, short_label)
WhenFn = Callable[[dict], bool]


def _one(answers: dict, key: str) -> Optional[str]:
    v = answers.get(key)
    if isinstance(v, list):
        return v[0] if v else None
    return v


def _female(a: dict) -> bool:
    return _one(a, "sex") != "male"


def _has_been_pregnant(a: dict) -> bool:
    return _female(a) and _one(a, "preg_history") == "yes"


_WITHIN_6M = {"lt48h", "2d_3w", "3_4w", "4_6w", "6w_6m"}

# Web-aligned steps. Labels kept short for USSD screens.
STEPS: list[dict[str, Any]] = [
    {
        "id": "sex",
        "q": "Advice for who?",
        "options": [("female", "Woman"), ("male", "Man")],
    },
    {
        "id": "age",
        "q": "Your age?",
        "options": [
            ("u18", "<18"),
            ("18_19", "18-19"),
            ("20_34", "20-34"),
            ("35_39", "35-39"),
            ("40_45", "40-45"),
            ("46", "46+"),
        ],
    },
    {
        "id": "goal",
        "q": "Your goal?",
        "options": [
            ("long", "Avoid 2+ yrs"),
            ("space12", "Child in 1-2y"),
            ("space3", "Child in 3+y"),
            ("no_more", "No more kids"),
            ("unsure", "Not sure"),
        ],
    },
    {
        "id": "preg_history",
        "q": "Ever pregnant?",
        "when": _female,
        "options": [("never", "Never"), ("yes", "Yes"), ("now", "Pregnant now")],
    },
    {
        "id": "preg_check",
        "q": "Rule out pregnancy? Pick all, 0=none",
        "multi": True,
        "when": lambda a: _female(a) and _one(a, "preg_history") != "now",
        "options": [
            ("p7", "Period <7d"),
            ("nosex", "No sex since period"),
            ("reliable", "Reliable method"),
            ("birth4", "Birth <4w"),
            ("loss7", "Loss <7d"),
            ("lamfull", "BF only, no period"),
            ("none", "None"),
        ],
        "option_when": {
            "birth4": _has_been_pregnant,
            "loss7": _has_been_pregnant,
            "lamfull": _has_been_pregnant,
        },
    },
    {
        "id": "unprotected",
        "q": "Sex without protection in last 5 days?",
        "when": lambda a: _female(a) and _one(a, "preg_history") != "now",
        "options": [("yes", "Yes"), ("no", "No")],
    },
    {
        "id": "birth",
        "q": "Last birth?",
        "when": _has_been_pregnant,
        "options": [
            ("none", ">6m / never"),
            ("lt48h", "<2 days"),
            ("2d_3w", "2d-3w"),
            ("3_4w", "3-4w"),
            ("4_6w", "4-6w"),
            ("6w_6m", "6w-6m"),
        ],
    },
    {
        "id": "bf",
        "q": "Breastfeeding?",
        "when": _has_been_pregnant,
        "options": [
            ("exclusive", "Milk only"),
            ("partial", "With other food"),
            ("none", "No"),
        ],
    },
    {
        "id": "periods_back",
        "q": "Periods back since birth?",
        "when": lambda a: (
            _has_been_pregnant(a)
            and _one(a, "bf") == "exclusive"
            and _one(a, "birth") in _WITHIN_6M
        ),
        "options": [("yes", "Yes"), ("no", "No")],
    },
    {
        "id": "health",
        "q": "Health issues? Pick all, 0=none",
        "multi": True,
        "when": _female,
        "options": [
            ("high_bp", "High BP"),
            ("migraine_aura", "Migraine+aura"),
            ("migraine", "Migraine"),
            ("blood_clot", "Blood clot"),
            ("stroke_heart", "Stroke/heart"),
            ("diabetes", "Diabetes"),
            ("liver_disease", "Liver disease"),
            ("breast_cancer", "Breast cancer"),
            ("cervical_cancer", "Cervix/womb ca"),
            ("unexplained_bleeding", "Odd bleeding"),
            ("sti_signs", "Discharge/pain"),
            ("none", "None"),
        ],
    },
    {
        "id": "bp_level",
        "q": "Last BP reading?",
        "when": lambda a: _female(a) and "high_bp" in (a.get("health") or []),
        "options": [
            ("controlled", "Normal on Rx"),
            ("140_159", "140-159"),
            ("160_plus", "160+"),
            ("unknown", "Don't know"),
        ],
    },
    {
        "id": "diabetes_level",
        "q": "Diabetes affect eyes/kidneys/nerves?",
        "when": lambda a: _female(a) and "diabetes" in (a.get("health") or []),
        "options": [("yes", "Yes"), ("no", "No")],
    },
    {
        "id": "breast_cancer_when",
        "q": "Breast cancer: now or past?",
        "when": lambda a: _female(a) and "breast_cancer" in (a.get("health") or []),
        "options": [("current", "Now"), ("past", "Past 5+ yrs clear")],
    },
    {
        "id": "meds",
        "q": "Medicines? Pick all, 0=none",
        "multi": True,
        "when": _female,
        "options": [
            ("rifampicin", "TB rifampicin"),
            ("anticonvulsant", "Epilepsy Rx"),
            ("efavirenz", "HIV EFV/NVP"),
            ("ritonavir", "HIV ritonavir"),
            ("dolutegravir", "HIV DTG/TLD"),
            ("none", "None"),
        ],
    },
    {
        "id": "smoking",
        "q": "Do you smoke?",
        "when": _female,
        "options": [("no", "No"), ("under_15", "<15/day"), ("15_plus", "15+/day")],
    },
    {
        "id": "periods",
        "q": "Usual periods?",
        "when": _female,
        "options": [
            ("regular", "Regular"),
            ("heavy", "Heavy/pain"),
            ("irregular", "Irregular"),
            ("absent", "No periods"),
        ],
    },
    {
        "id": "bleeding_ok",
        "q": "OK if method changes bleeding?",
        "when": _female,
        "options": [("ok", "Fine"), ("bother", "Bothers me"), ("unsure", "Not sure")],
    },
    {
        "id": "experience",
        "q": "Used contraception before?",
        "when": _female,
        "options": [
            ("first", "First time"),
            ("happy", "Yes, worked"),
            ("stopped", "Stopped (side fx)"),
        ],
    },
    {
        "id": "routine",
        "q": "Which fits you?",
        "when": _female,
        "options": [
            ("consistent", "Remember daily"),
            ("forget", "Sometimes forget"),
            ("set", "Set & forget"),
        ],
    },
    {
        "id": "comfortable",
        "q": "Comfortable with? Pick all, 0=any",
        "multi": True,
        "when": _female,
        "options": [
            ("pill", "Daily pill"),
            ("injection", "Injection 3m"),
            ("implant", "Arm implant"),
            ("iud", "IUD in womb"),
            ("condom", "Condoms"),
            ("any", "Open to any"),
        ],
    },
    {
        "id": "sti",
        "q": "STI/HIV protection important?",
        "options": [("yes", "Yes"), ("no", "No"), ("unsure", "Not sure")],
    },
    {
        "id": "access",
        "q": "Clinic access?",
        "when": _female,
        "options": [("easy", "Easy"), ("sometimes", "Sometimes"), ("hard", "Hard")],
    },
    {
        "id": "privacy",
        "q": "Need partner not to notice?",
        "when": _female,
        "options": [("yes", "Yes"), ("no", "No")],
    },
]

AGE_VALUE = {"u18": 16, "18_19": 19, "20_34": 27, "35_39": 37, "40_45": 42, "46": 48}
GOAL_INTENT = {
    "long": "over_2y",
    "space12": "within_2y",
    "space3": "over_2y",
    "no_more": "no_more",
    "unsure": "unsure",
}
ACCESS_VISITS = {"easy": "easy", "sometimes": "sometimes", "hard": "hard"}


def new_ussd_session(phone: str) -> dict:
    return {
        "phone_number": phone,
        "channel": "ussd",
        "stage": "mode",  # mode | language | triage | chat | facility
        "language": "english",
        "mode": None,  # triage | chat
        "answers": {},
        "step_id": None,
        "opt_page": 0,
        "awaiting_facility": False,
    }


def _visible_options(step: dict, answers: dict) -> list[Option]:
    ow = step.get("option_when") or {}
    out = []
    for val, label in step.get("options") or []:
        fn = ow.get(val)
        if fn and not fn(answers):
            continue
        out.append((val, label))
    return out


def _is_visible(step: dict, answers: dict) -> bool:
    when = step.get("when")
    return True if when is None else bool(when(answers))


def next_step(answers: dict, after_id: Optional[str] = None) -> Optional[dict]:
    start = 0
    if after_id:
        for i, s in enumerate(STEPS):
            if s["id"] == after_id:
                start = i + 1
                break
    for s in STEPS[start:]:
        if _is_visible(s, answers) and answers.get(s["id"]) is None:
            return s
    return None


def _clip(msg: str, limit: int = USSD_MAX) -> str:
    msg = (msg or "").strip()
    if len(msg) <= limit:
        return msg
    return msg[: limit - 3] + "..."


def format_step_prompt(step: dict, answers: dict, page: int = 0) -> str:
    if step.get("free_text"):
        return _clip(step["q"])

    opts = _visible_options(step, answers)
    # Fit as many options as possible under USSD_MAX; paginate the rest.
    header = step["q"]
    footer_multi = "\n0.None/done" if step.get("multi") else ""
    page_size = len(opts)
    while page_size > 3:
        chunk = opts[:page_size]
        body = "\n".join(f"{i}.{label}" for i, (_v, label) in enumerate(chunk, start=1))
        more = "\n9.More" if page_size < len(opts) else ""
        trial = f"{header}\n{body}{more}{footer_multi}"
        if len(trial) <= USSD_MAX:
            break
        page_size -= 1

    total_pages = max(1, (len(opts) + page_size - 1) // page_size)
    page = max(0, min(page, total_pages - 1))
    chunk = opts[page * page_size : (page + 1) * page_size]

    lines = [header]
    for i, (_val, label) in enumerate(chunk, start=1):
        lines.append(f"{i}.{label}")
    if page < total_pages - 1:
        lines.append("9.More")
    if step.get("multi"):
        lines.append("0.None/done")
    return _clip("\n".join(lines))


def _page_size_for(step: dict, answers: dict) -> int:
    opts = _visible_options(step, answers)
    header = step["q"]
    footer_multi = "\n0.None/done" if step.get("multi") else ""
    page_size = len(opts)
    while page_size > 3:
        chunk = opts[:page_size]
        body = "\n".join(f"{i}.{label}" for i, (_v, label) in enumerate(chunk, start=1))
        more = "\n9.More" if page_size < len(opts) else ""
        trial = f"{header}\n{body}{more}{footer_multi}"
        if len(trial) <= USSD_MAX:
            return page_size
        page_size -= 1
    return max(3, page_size)


def build_triage_payload(answers: dict) -> dict:
    is_male = _one(answers, "sex") == "male"
    health = answers.get("health") or []
    never_pregnant = _one(answers, "preg_history") == "never"

    conditions: list[str] = []
    for h in health:
        if h in ("none", "high_bp"):
            continue
        if h == "diabetes":
            conditions.append(
                "diabetes_complications" if _one(answers, "diabetes_level") == "yes" else "diabetes"
            )
        elif h == "breast_cancer":
            conditions.append(
                "breast_cancer_current"
                if _one(answers, "breast_cancer_when") == "current"
                else "breast_cancer_past"
            )
        else:
            conditions.append(h)
    if _one(answers, "periods") == "heavy":
        conditions.append("heavy_periods")

    pregnancy_status = None
    if _one(answers, "preg_history") == "now":
        pregnancy_status = "pregnant"
    elif answers.get("preg_check") is not None:
        pc = answers.get("preg_check") or []
        pregnancy_status = "not_pregnant" if any(v != "none" for v in pc) else "unsure"

    bleeding_ok = _one(answers, "bleeding_ok")
    comfortable = [c for c in (answers.get("comfortable") or []) if c != "any"]

    return {
        "age": AGE_VALUE.get(_one(answers, "age") or "20_34", 27),
        "gender": "male" if is_male else "female",
        "pregnancy_status": None if is_male else pregnancy_status,
        "unprotected_sex_5d": _one(answers, "unprotected") == "yes",
        "postpartum": None if is_male else ("none" if never_pregnant else _one(answers, "birth")),
        "breastfeeding_mode": None
        if is_male
        else ("none" if never_pregnant else _one(answers, "bf")),
        "periods_returned": (
            None
            if answers.get("periods_back") is None
            else _one(answers, "periods_back") == "yes"
        ),
        "blood_pressure": (
            None
            if is_male
            else (
                (_one(answers, "bp_level") or "unknown")
                if "high_bp" in health
                else "normal"
            )
        ),
        "smoking": _one(answers, "smoking"),
        "conditions": conditions,
        "medications": [m for m in (answers.get("meds") or []) if m not in ("none", "dolutegravir")],
        "fertility_intent": GOAL_INTENT.get(_one(answers, "goal") or "unsure"),
        "comfortable_with": comfortable,
        "bleeding_changes_ok": True if bleeding_ok == "ok" else False if bleeding_ok == "bother" else None,
        "needs_privacy": _one(answers, "privacy") == "yes",
        "sti_protection": _one(answers, "sti") == "yes",
        "clinic_visits": ACCESS_VISITS.get(_one(answers, "access") or ""),
    }


def answers_to_profile(session: dict) -> UserProfile:
    t = build_triage_payload(session.get("answers") or {})
    district = (session.get("answers") or {}).get("district")
    if isinstance(district, list):
        district = district[0] if district else None
    return UserProfile(
        **t,
        breastfeeding=t.get("breastfeeding_mode") in ("exclusive", "partial")
        and t.get("postpartum") not in (None, "none"),
        health_risk=False,
        preference="long_acting"
        if set(t.get("comfortable_with") or []) & {"implant", "iud", "injection"}
        else "daily",
        clinic_access=True,
        language=session.get("language", "english"),
        district=district,
        channel="ussd",
    )


def _triage_summary(answers: dict) -> str:
    bits = []
    for s in STEPS:
        if answers.get(s["id"]) is None:
            continue
        bits.append(f"{s['id']}={answers[s['id']]}")
    return " | ".join(bits)[:400]


def _run_recommend(session: dict) -> tuple[str, bool]:
    """Returns (message, offer_facility)."""
    answers = session.get("answers") or {}
    if _one(answers, "age") == "u18":
        return (
            "ContraBot is for ages 18+. Please visit a youth-friendly clinic for private advice.",
            False,
        )
    if _one(answers, "preg_history") == "now":
        return (
            "You don't need contraception while pregnant. Keep antenatal visits. Ask after birth.",
            False,
        )

    profile = answers_to_profile(session)
    result = run_recommendation(profile)
    session["last_recommendation"] = result.model_dump(mode="json")

    top = result.ranked_methods[:2]
    parts = []
    if result.safety.alerts:
        if "emergency_contraception" in result.safety.alerts:
            parts.append("EC may still help if sex <5d ago.")
        if "pregnancy_test" in result.safety.alerts:
            parts.append("Do a pregnancy test first.")
    if top:
        labels = ", ".join(m.label for m in top)
        parts.append(f"Top: {labels}.")
    else:
        parts.append("See a clinic — few safe options from answers.")
    parts.append("Confirm at clinic/CHW.")
    msg = " ".join(parts)
    offer = bool(profile.district)
    if offer:
        msg = _clip(msg + " Clinic? 1 Yes 2 No", 160)
    return _clip(msg), offer


def _parse_multi(text: str, opts: list[Option]) -> Optional[list[str]]:
    raw = text.replace(" ", "").replace("*", "").replace(";", ",")
    if raw in ("0", "none"):
        return ["none"] if any(v == "none" for v, _ in opts) else ["any"] if any(v == "any" for v, _ in opts) else []
    # digits like 134 or 1,3,4
    nums: list[int] = []
    if "," in raw:
        for p in raw.split(","):
            if p.isdigit():
                nums.append(int(p))
    elif raw.isdigit():
        nums = [int(c) for c in raw]
    else:
        return None
    chosen = []
    for n in nums:
        if 1 <= n <= len(opts):
            chosen.append(opts[n - 1][0])
    if not chosen:
        return None
    if "none" in chosen:
        return ["none"]
    if "any" in chosen:
        return ["any"]
    return chosen


def _handle_mode(session: dict, text: str) -> tuple[dict, str, bool]:
    if text in ("1",):
        session["mode"] = "triage"
        session["stage"] = "language"
        return session, "Language:\n1.English\n2.Kiswahili", False
    if text in ("2",):
        session["mode"] = "chat"
        session["stage"] = "language"
        return session, "Language:\n1.English\n2.Kiswahili", False
    return (
        session,
        "ContraBot\n1.Get recommendation\n2.Ask a question",
        False,
    )


def _handle_language(session: dict, text: str) -> tuple[dict, str, bool]:
    if text == "2":
        session["language"] = "kiswahili"
    else:
        session["language"] = "english"
        if text not in ("1", "2", ""):
            # tolerate and default english
            pass

    if session.get("mode") == "chat":
        session["stage"] = "chat"
        return session, "Type your contraception question:", False

    session["stage"] = "triage"
    session["answers"] = {}
    step = next_step({})
    session["step_id"] = step["id"] if step else None
    session["opt_page"] = 0
    if not step:
        return session, "No questions. Try again.", True
    return session, format_step_prompt(step, {}, 0), False


def _handle_triage(session: dict, text: str) -> tuple[dict, str, bool]:
    answers = session.setdefault("answers", {})
    step_id = session.get("step_id")
    step = next((s for s in STEPS if s["id"] == step_id), None)
    if not step:
        step = next_step(answers)
        if not step:
            msg, offer = _run_recommend(session)
            if offer:
                session["stage"] = "facility"
                session["awaiting_facility"] = True
                return session, msg, False
            return session, msg, True
        session["step_id"] = step["id"]
        session["opt_page"] = 0

    page = int(session.get("opt_page") or 0)

    if step.get("free_text"):
        if len(text.strip()) < 2:
            return session, format_step_prompt(step, answers, page), False
        answers[step["id"]] = text.strip()[:40]
    else:
        opts = _visible_options(step, answers)
        page_size = _page_size_for(step, answers)
        total_pages = max(1, (len(opts) + page_size - 1) // page_size)
        chunk = opts[page * page_size : (page + 1) * page_size]

        if text == "9" and page < total_pages - 1:
            session["opt_page"] = page + 1
            return session, format_step_prompt(step, answers, page + 1), False

        if step.get("multi"):
            if text == "0":
                answers[step["id"]] = ["none"] if any(v == "none" for v, _ in opts) else []
            else:
                local = _parse_multi(text, chunk)
                if local is None:
                    return session, "Invalid. " + format_step_prompt(step, answers, page), False
                if local == ["none"] or local == ["any"]:
                    answers[step["id"]] = local
                else:
                    prev = [x for x in (answers.get(step["id"]) or []) if x not in ("none", "any")]
                    answers[step["id"]] = list(dict.fromkeys(prev + local))
        else:
            if not text.isdigit() or not (1 <= int(text) <= len(chunk)):
                return session, "Invalid. " + format_step_prompt(step, answers, page), False
            answers[step["id"]] = [chunk[int(text) - 1][0]]

    # Under-18 / pregnant now stops
    if step["id"] == "age" and _one(answers, "age") == "u18":
        return (
            session,
            "ContraBot is for ages 18+. Please visit a youth-friendly clinic for private advice.",
            True,
        )
    if step["id"] == "preg_history" and _one(answers, "preg_history") == "now":
        return (
            session,
            "Thanks. You don't need contraception while pregnant. Keep antenatal care.",
            True,
        )

    if step["id"] == "unprotected" and _one(answers, "unprotected") == "yes":
        # Soft alert then continue
        nxt = next_step(answers, step["id"])
        if nxt:
            session["step_id"] = nxt["id"]
            session["opt_page"] = 0
            return (
                session,
                "EC may help if <5 days. " + format_step_prompt(nxt, answers, 0),
                False,
            )

    nxt = next_step(answers, step["id"])
    if nxt:
        session["step_id"] = nxt["id"]
        session["opt_page"] = 0
        return session, format_step_prompt(nxt, answers, 0), False

    msg, offer = _run_recommend(session)
    if offer:
        session["stage"] = "facility"
        session["awaiting_facility"] = True
        return session, msg, False
    return session, msg, True


def _handle_chat(session: dict, text: str) -> tuple[dict, str, bool]:
    if text in ("0", "end", "bye"):
        return session, "Asante. Dial again anytime.", True

    lang = session.get("language", "english")
    summary = _triage_summary(session.get("answers") or {})
    try:
        rag = query_all_collections(text, num_results=2) or []
        context = "\n".join(rag[:2])
        query = (
            f"Reply in {lang}. Keep under 140 characters.\n"
            f"Context:\n{context}\n"
            + (f"Profile: {summary}\n" if summary else "")
            + f"User: {text}"
        )
        reply = get_counseling_response(query, channel="ussd", language=lang)
    except Exception:
        reply = "Sorry, try again later. Visit a clinic for urgent advice."

    reply = _clip(reply, 140)
    return session, _clip(reply + "\n0=End or ask again"), False


def _handle_facility(session: dict, text: str) -> tuple[dict, str, bool]:
    if text in ("1", "yes", "y"):
        district = _one(session.get("answers") or {}, "district") or "Nairobi"
        if isinstance(district, list):
            district = district[0]
        facilities = find_nearest_facilities(str(district))
        msg = format_facilities_message(facilities, max_chars=USSD_MAX - 4)
        return session, msg, True
    return session, "Asante. Visit a clinic or CHW when ready.", True


def process_ussd(session: dict, user_input: str) -> tuple[dict, str, bool]:
    """
    Process one USSD input.
    Returns (session, message_without_prefix, end_session).
    """
    text = (user_input or "").strip()
    stage = session.get("stage") or "mode"

    if stage == "mode":
        return _handle_mode(session, text)
    if stage == "language":
        return _handle_language(session, text)
    if stage == "triage":
        return _handle_triage(session, text)
    if stage == "chat":
        return _handle_chat(session, text)
    if stage == "facility":
        return _handle_facility(session, text)
    session["stage"] = "mode"
    return _handle_mode(session, "")
