"""Decide how a free-text message is handled.

Routes:
- "urgent":  danger signs or sexual assault. The reply leads with "get care now".
- "triage":  the person wants a method picked for them; send them to the triage questions.
- "answer":  a question that needs facts from the guidelines.
- "chat":    greetings, thanks and small talk; answered conversationally, no retrieval.

The model also reports the language style the person writes in (English, Kiswahili or Sheng)
and rewrites the message as a standalone English search query, using the conversation so far.
Danger signs are matched by keywords first so they never depend on the model.
"""

import json
import re
from dataclasses import dataclass

from app.openai_client import chat_completion

ROUTES = ("answer", "triage", "urgent", "chat")
LANGS = ("en", "sw", "sheng")

# Danger signs from the Kenya FP Guidelines (ACHES for COCs, post-IUD infection, ectopic
# pregnancy, heavy bleeding) plus sexual assault, where EC and PEP are time-critical.
URGENT_PATTERNS = [
    r"chest pain", r"short(ness)? of breath", r"can'?t breathe", r"difficulty breathing",
    r"severe (abdominal|stomach|belly|lower abdominal|headache|calf|leg) pain",
    r"severe headache", r"(lost|losing|loss of|blurr?ed) (my )?(vision|sight)",
    r"soak(ing|ed)? (a |through )?(pad|pads)", r"(very )?heavy bleeding", r"bleeding (a lot|heavily|won'?t stop)",
    r"faint(ed|ing)?", r"passed out", r"fever.*(iud|coil|insert)", r"(iud|coil).*(fever|pus|foul)",
    r"foul[- ]smelling discharge", r"ectopic",
    r"\braped?\b", r"sexual(ly)? assault", r"forced (me )?to have sex",
    # Kiswahili and Sheng
    r"maumivu makali", r"damu (nyingi|mingi)", r"kuzimia", r"nimezimia", r"nimebakwa", r"kubakwa",
    r"maumivu ya kifua", r"kushindwa kupumua", r"siwezi kupumua",
]

TRIAGE_PATTERNS = [
    r"which (method|contraceptive|family planning|fp)\b.*\b(me|my|i)\b",
    r"(best|right|good|safest) (method|contraceptive|option|one) for me",
    r"what (method|contraceptive) should i (use|take|get|choose)",
    r"(recommend|suggest) (a |me )?(method|contraceptive)",
    r"help me (choose|pick|decide)",
    r"njia (gani|ipi) .*(nifae|inifae|inanifaa|nitumie)", r"nishauri",
]

# Messages that are only a greeting, thanks or goodbye (used when the model is unavailable).
SMALL_TALK = (
    r"^\W*(hi+|hello|hey|hola|niaje|sasa|mambo|vipi|poa|habari( yako| zako)?|hujambo|salaam?|"
    r"good (morning|afternoon|evening)|how are you|uko(aje| poa)?|thanks?( you)?|thank u|asante( sana)?|"
    r"ok(ay)?|sawa|bye|kwaheri|who are you|wewe ni nani)\W*(\w+\W*)?$"
)

_URGENT = re.compile("|".join(URGENT_PATTERNS), re.IGNORECASE)
_ASSAULT = re.compile(r"\braped?\b|sexual(ly)? assault|forced (me )?to have sex|nimebakwa|kubakwa", re.IGNORECASE)
_TRIAGE = re.compile("|".join(TRIAGE_PATTERNS), re.IGNORECASE)
_SMALL_TALK = re.compile(SMALL_TALK, re.IGNORECASE)
_SWAHILI_HINT = re.compile(r"\b(na|ni|kwa|ya|je|gani|sana|nini|mimi|wewe|nataka|naweza|habari|asante)\b", re.IGNORECASE)
_SHENG_HINT = re.compile(r"\b(niaje|sasa|mambo|poa|msee|manze|buda|dem|maze|fiti|sare|kuna|venye|ati|kwani)\b", re.IGNORECASE)

ROUTER_PROMPT = """You read the latest message sent to a family planning chatbot in Kenya, together with the conversation so far, and decide how to handle it.

Reply with JSON only:
{"route": "<route>", "lang": "<lang>", "query": "<search query>"}

route:
- "urgent": the person describes danger signs happening now (severe abdominal, chest, calf or head pain, trouble breathing, vision loss, very heavy bleeding, fainting, fever or foul discharge after an IUD insertion, possible ectopic pregnancy) or sexual assault.
- "triage": the person asks which contraceptive method is right for THEM personally and has not given enough about their health to answer (e.g. "what method should I use?", "which is best for me?").
- "answer": a question that needs medical facts: how methods work, effectiveness, side effects, missed pills, emergency contraception, eligibility for a condition, fertility after stopping, where to get a method. Also short follow-ups to an earlier question ("and for the implant?", "why?", "yes tell me more").
- "chat": greetings, thanks, goodbyes, "how are you", "who are you", "where do you get your information?", compliments, or chatter that needs no medical facts.
If the person is replying to a question the bot asked about their health or situation (e.g. "yes" to "Are you breastfeeding?"), choose "answer": the bot needs medical facts to continue.
If unsure between "triage" and "answer", choose "answer". If unsure between "chat" and "answer", choose "answer".

Local names: P2, Postinor or "e-pill" = emergency contraceptive pill (morning-after pill). Kijiti or "rod" = implant. Sindano or "jab" = injectable (Depo, DMPA, Sayana). Coil or "copper T" = IUD. Vidonge = pills. Mpira = condom.

lang: the language style of the latest message. "en" English, "sw" standard Kiswahili, "sheng" Sheng or a mix of Kiswahili and English slang.

query: for "answer" and "urgent", the question rewritten in English as a standalone search query, using the conversation to resolve follow-ups (e.g. "how long does the contraceptive implant last"). For other routes, "".
"""


@dataclass
class RouteDecision:
    route: str
    source: str  # "keywords", "model" or "fallback"
    lang: str | None = None  # "en", "sw" or "sheng" when detected
    query: str = ""  # standalone English search query, when the model gave one


def mentions_assault(message: str) -> bool:
    return bool(_ASSAULT.search(message))


def guess_lang(message: str) -> str | None:
    if _SHENG_HINT.search(message):
        return "sheng"
    if _SWAHILI_HINT.search(message):
        return "sw"
    return None


def _parse_decision(text: str) -> dict:
    """Return {"route", "lang", "query"} from the model's reply; missing or invalid values are None/""."""
    out = {"route": None, "lang": None, "query": ""}
    match = re.search(r"\{.*\}", text or "", re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            out["route"] = data.get("route") if data.get("route") in ROUTES else None
            out["lang"] = data.get("lang") if data.get("lang") in LANGS else None
            out["query"] = str(data.get("query") or "").strip()
        except (json.JSONDecodeError, AttributeError):
            pass
    if out["route"] is None:
        lowered = (text or "").lower()
        out["route"] = next((r for r in ROUTES if r in lowered), None)
    return out


def _parse_route(text: str) -> str | None:
    return _parse_decision(text)["route"]


def _conversation(history: list[dict] | None, message: str) -> str:
    lines = [f"{'Person' if t['role'] == 'user' else 'Bot'}: {t['content'][:300]}" for t in (history or [])[-4:]]
    return ("Conversation so far:\n" + "\n".join(lines) + "\n\n" if lines else "") + f"Latest message: {message}"


def route_message(message: str, has_triage: bool = False, history: list[dict] | None = None) -> RouteDecision:
    """Classify a message. `has_triage` means the person already answered the triage questions,
    so a "which method for me" question can be answered with their profile instead.
    `history` is the recent conversation as [{"role", "content"}], oldest first."""
    if _URGENT.search(message):
        return RouteDecision("urgent", "keywords", guess_lang(message))

    decision = None
    try:
        raw = chat_completion(
            messages=[{"role": "system", "content": ROUTER_PROMPT}, {"role": "user", "content": _conversation(history, message)}],
            temperature=0,
            max_tokens=120,
            task="router",
        )
        parsed = _parse_decision(raw)
        if parsed["route"]:
            decision = RouteDecision(parsed["route"], "model", parsed["lang"] or guess_lang(message), parsed["query"])
    except Exception:
        pass
    if decision is None:
        if _SMALL_TALK.search(message):
            route = "chat"
        elif _TRIAGE.search(message):
            route = "triage"
        else:
            route = "answer"
        decision = RouteDecision(route, "fallback", guess_lang(message))

    if decision.route == "triage" and has_triage:
        decision.route = "answer"
    return decision
