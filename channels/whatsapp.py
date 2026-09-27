import os
import json
import time
import asyncio
import hmac
import hashlib
from typing import Any, Optional

import httpx
from fastapi import Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from langdetect import detect, LangDetectException

from channels.intake import get_prompt_for_stage, new_session, process_intake_input
from services.session import session_store
from services.knowledge import query_all_collections
from services.referrals import create_referral, create_live_handoff
from services.chw_roster import digits_only
from engine.recommender import load_system_prompt
from app.openai_client import chat_completion
from channels.whatsapp_logger import logger

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN") or WHATSAPP_TOKEN
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET")
GRAPH_API = "https://graph.facebook.com/v19.0"
CHANNEL = "whatsapp"

# Connection pooling limits for Meta API
client_limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
async_client = httpx.AsyncClient(limits=client_limits, timeout=15.0)

# In-memory deduplication cache fallback
DEDUP_CACHE = {}  # dict of msg_id -> timestamp
DEDUP_TTL = 300   # 5 minutes

def verify_webhook_token(token: str) -> bool:
    return token == WHATSAPP_VERIFY_TOKEN

def verify_signature(body: bytes, signature: Optional[str]) -> bool:
    if not WHATSAPP_APP_SECRET or WHATSAPP_APP_SECRET == "your-whatsapp-app-secret":
        logger.warning("WHATSAPP_APP_SECRET not configured, skipping signature verification")
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(WHATSAPP_APP_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    actual = signature[7:]
    return hmac.compare_digest(expected, actual)

def is_duplicate_message(msg_id: str) -> bool:
    if not msg_id:
        return False
    
    if session_store._use_redis and session_store._redis:
        try:
            key = f"contrabot:whatsapp_dedup:{msg_id}"
            success = session_store._redis.set(key, "1", ex=DEDUP_TTL, nx=True)
            return not success
        except Exception as exc:
            logger.error(f"Redis deduplication check failed: {exc}")
            
    now = time.time()
    # clean expired
    expired = [k for k, t in DEDUP_CACHE.items() if now - t > DEDUP_TTL]
    for k in expired:
        del DEDUP_CACHE[k]
        
    if msg_id in DEDUP_CACHE:
        return True
    DEDUP_CACHE[msg_id] = now
    return False

async def _send_payload(phone_number: str, payload: dict) -> bool:
    phone_id = os.getenv("WHATSAPP_PHONE_ID")
    access_token = WHATSAPP_TOKEN
    if not phone_id or not access_token:
        logger.error("Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN in environment")
        return False
    url = f"{GRAPH_API}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    
    for attempt in range(3):
        try:
            response = await async_client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                logger.info(
                    "Successfully sent WhatsApp payload",
                    extra={"phone": phone_number}
                )
                return True
            else:
                logger.error(
                    f"Meta Graph API error (Attempt {attempt+1}): {response.status_code} - {response.text}",
                    extra={"phone": phone_number}
                )
        except Exception as exc:
            logger.error(
                f"Error sending WhatsApp payload (Attempt {attempt+1}): {exc}",
                extra={"phone": phone_number},
                exc_info=True
            )
        if attempt < 2:
            await asyncio.sleep(2 ** attempt)
    return False

async def send_text(phone_number: str, message: str) -> bool:
    return await _send_payload(
        phone_number,
        {"messaging_product": "whatsapp", "to": phone_number, "type": "text", "text": {"body": message[:4096]}},
    )

async def send_buttons(phone_number: str, body: str, buttons: list[tuple[str, str]]) -> bool:
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": body[:1024]},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": {"id": bid, "title": title[:20]}}
                    for bid, title in buttons[:3]
                ]
            },
        },
    }
    return await _send_payload(phone_number, payload)

async def send_list(
    phone_number: str,
    body: str,
    button_label: str,
    sections: list[dict],
    header: Optional[str] = None,
    footer: Optional[str] = None
) -> bool:
    interactive = {
        "type": "list",
        "body": {"text": body[:1024]},
        "action": {
            "button": button_label[:20],
            "sections": sections
        }
    }
    if header:
        interactive["header"] = {"type": "text", "text": header[:60]}
    if footer:
        interactive["footer"] = {"type": "text", "text": footer[:60]}
        
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "interactive",
        "interactive": interactive
    }
    return await _send_payload(phone_number, payload)

async def mark_as_read(phone_number: str, msg_id: str) -> bool:
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": msg_id
    }
    return await _send_payload(phone_number, payload)

def _detect_language(text: str) -> str:
    try:
        code = detect(text)
        mapping = {"en": "english", "sw": "kiswahili", "fr": "french", "rw": "kinyarwanda"}
        return mapping.get(code, "english")
    except LangDetectException:
        return "english"

def _extract_message_body(message: dict) -> tuple[str, str]:
    msg_type = message.get("type", "text")
    if msg_type == "text":
        return message.get("text", {}).get("body", ""), "text"
    if msg_type == "interactive":
        interactive = message.get("interactive", {})
        if interactive.get("type") == "button_reply":
            return interactive["button_reply"].get("id", ""), "button"
        if interactive.get("type") == "list_reply":
            return interactive["list_reply"].get("id", ""), "list"
    if msg_type == "location":
        loc = message.get("location", {})
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        if lat is not None and lng is not None:
            return f"coords:{lat},{lng}", "location"
    return "", msg_type

def _normalize_button_input(text: str) -> str:
    mapping = {
        "yes": "1",
        "no": "2",
        "female": "1",
        "male": "2",
        "daily": "1",
        "long_acting": "2",
        "set-forget": "2",
        "breastfeeding_yes": "1",
        "breastfeeding_no": "2",
        "health_yes": "1",
        "health_no": "2",
        "access_yes": "1",
        "access_no": "2",
        "facility_yes": "1",
        "facility_no": "2",
        "talk_chw": "talk_chw",
        "ask_more": "ask_more",
        "chw_yes": "chw_yes",
        "chw_no": "chw_no",
        "pref_type": "pref_type",
    }
    return mapping.get(text.lower(), text)

async def _ask_chw_consent(phone_number: str, session: dict) -> None:
    lang = session.get("language", "english")
    if lang == "kiswahili":
        body = (
            "Unaweza kuzungumza na CHW (mhudumu wa afya jamii) kupitia WhatsApp.\n\n"
            "Je, unakubali CHW akuwasiliane nawe? "
            "Hatuhifadhi namba yako kwa muda mrefu."
        )
        buttons = [("chw_yes", "Ndiyo, unganisha"), ("chw_no", "Hapana")]
    else:
        body = (
            "A Community Health Worker (CHW) can message you on WhatsApp for professional advice.\n\n"
            "Do you agree to be contacted? "
            "We do not keep your number long-term (24 hours max)."
        )
        buttons = [("chw_yes", "Yes, connect"), ("chw_no", "No thanks")]
    await send_buttons(phone_number, body, buttons)


async def _complete_chw_handoff(phone_number: str, session: dict) -> dict:
    """Consent given: create live handoff, notify CHW, confirm to user."""
    profile = session.get("profile") or {}
    district = profile.get("district") or "Unknown"
    method = None
    last = session.get("last_recommendation") or {}
    if isinstance(last, dict):
        method = last.get("top_method")

    result = create_live_handoff(
        district=district,
        user_whatsapp=digits_only(phone_number),
        channel="whatsapp",
        method_interest=method,
    )
    if not result:
        await send_text(
            phone_number,
            "Sorry — I could not connect you to a CHW right now. Please try again or visit a clinic.",
        )
        return session

    session["referral_code"] = result["code"]
    session["handoff_pending"] = False

    # Notify CHW on WhatsApp (staff roster number)
    chw = result.get("chw") or {}
    chw_wa = digits_only(chw.get("whatsapp") or "")
    notify_text = result.get("chw_notify_text") or ""
    notified = False
    if chw_wa and notify_text:
        notified = await send_text(chw_wa, notify_text)

    lang = session.get("language", "english")
    code = result["code"]
    chw_name = chw.get("name") or "a CHW"
    if lang == "kiswahili":
        msg = (
            f"Asante. Nimewasiliana na {chw_name}.\n\n"
            f"Msimbo wako: *{code}*\n"
            "CHW atakuandikia hivi karibuni kwenye WhatsApp. "
            "Mpe msimbo huo ukiongea naye."
        )
        if not notified:
            msg += "\n\n(Kumbuka: ikiwa CHW hajapata arifa, bado unaweza kumtafutia kliniki kwa msimbo huo.)"
    else:
        msg = (
            f"Thanks. I notified {chw_name}.\n\n"
            f"Your code: *{code}*\n"
            "A CHW will message you on WhatsApp soon. "
            "Share this code when you chat."
        )
        if not notified:
            msg += "\n\n(Note: if the CHW alert failed, you can still show this code at a clinic.)"

    await send_text(phone_number, msg)
    await send_buttons(
        phone_number,
        "Meanwhile you can keep chatting with me:",
        [("ask_more", "Ask more"), ("restart", "Restart")],
    )
    return session


async def _send_chw_referral(phone_number: str, session: dict) -> dict:
    """Legacy anonymous code-only referral (no live notify)."""
    profile = session.get("profile") or {}
    district = profile.get("district") or "Unknown"
    method = None
    last = session.get("last_recommendation") or {}
    if isinstance(last, dict):
        method = last.get("top_method")
    row = create_referral(
        district=district,
        channel="whatsapp",
        method_interest=method,
        notes="Anonymous code referral (no live handoff)",
    )
    if not row:
        await send_text(
            phone_number,
            "Sorry — I could not create a CHW referral right now. Please try again or visit a nearby clinic.",
        )
        return session

    session["referral_code"] = row["code"]
    lang = session.get("language", "english")
    if lang == "kiswahili":
        msg = (
            f"Ombi lako la CHW limewasilishwa. Mpe CHW msimbo huu: {row['code']}. "
            f"Wilaya: {district}."
        )
    else:
        msg = (
            f"Your CHW referral is ready. Tell your CHW this code: {row['code']}. "
            f"District: {district}."
        )
    await send_text(phone_number, msg)
    return session

def _health_multi_prompt(language: str) -> str:
    if language == "kiswahili":
        return (
            "Chagua *yote* yanayokuhusu. Jibu kwa namba kama *1,3* "
            "au andika kwa maneno yako:\n\n"
            "1. Shinikizo la damu\n"
            "2. Maumivu ya kichwa (migraine) yenye aura\n"
            "3. Damu kuganda / DVT\n"
            "4. Kisukari\n"
            "5. Ugonjwa wa ini\n"
            "6. Historia ya kansa ya matiti\n"
            "0. Hakuna kati ya hizi"
        )
    return (
        "Select *all* that apply. Reply with numbers like *1,3* "
        "or type your own words:\n\n"
        "1. High blood pressure\n"
        "2. Migraine with aura\n"
        "3. Blood clots / DVT\n"
        "4. Diabetes\n"
        "5. Liver disease\n"
        "6. Breast cancer history\n"
        "0. None of these"
    )


def _preference_multi_prompt(language: str) -> tuple[str, list[tuple[str, str]]]:
    if language == "kiswahili":
        return (
            "Unapendelea nini? Chagua au *andika* unavyotaka:",
            [("daily", "Kila siku"), ("long_acting", "Muda mrefu"), ("pref_type", "Nitaandika")],
        )
    return (
        "What do you prefer? Tap a choice or *type* your own:",
        [("daily", "Daily pill"), ("long_acting", "Long-acting"), ("pref_type", "I'll type")],
    )


async def send_welcome_intro(phone_number: str) -> bool:
    """Friendly first greeting before the language picker."""
    return await send_text(
        phone_number,
        "Karibu ContraBot. 💚\n\n"
        "I can help you choose safe contraception — privately.\n\n"
        "Choose your language:",
    )


WHATSAPP_LANGUAGE_IDS = {"1", "2", "english", "kiswahili"}


async def send_language_list(phone_number: str, with_intro: bool = False) -> bool:
    """Offer English or Kiswahili as quick-reply buttons."""
    if with_intro:
        await send_welcome_intro(phone_number)

    return await send_buttons(
        phone_number,
        "Choose your language / Chagua lugha:",
        [("1", "English"), ("2", "Kiswahili")],
    )


def _whatsapp_name_prompt(language: str) -> str:
    prompts = {
        "english": "Great — English it is.\n\nWhat is your name?",
        "kiswahili": "Poa! Tutaongea kwa Kiswahili.\n\nUnaitwa nani?",
    }
    return prompts.get(language, prompts["english"])


async def start_whatsapp_session(phone_number: str) -> dict:
    """Create a fresh session and send the interactive language welcome."""
    session = new_session(phone_number, CHANNEL)
    session_store.set(phone_number, session, CHANNEL, ttl=1800)
    await send_language_list(phone_number, with_intro=True)
    return session


async def handle_whatsapp_webhook(request: Request) -> JSONResponse:
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    
    if not verify_signature(body_bytes, signature):
        logger.error("Signature verification failed", extra={"signature": signature})
        return JSONResponse({"error": "Signature verification failed"}, status_code=403)
        
    try:
        data = json.loads(body_bytes)
    except Exception as exc:
        logger.error(f"Malformed JSON payload: {exc}")
        return JSONResponse({"error": "Malformed JSON"}, status_code=400)
        
    try:
        value = data["entry"][0]["changes"][0]["value"]
    except (KeyError, IndexError):
        return JSONResponse({"status": "received"}, status_code=200)

    # Process status callbacks
    if "statuses" in value:
        for status in value["statuses"]:
            status_id = status.get("id")
            recipient_id = status.get("recipient_id")
            status_type = status.get("status")
            if status_type == "failed":
                errors = status.get("errors", [])
                err_msg = errors[0].get("message") if errors else "Unknown error"
                logger.error(
                    f"Message delivery failed to {recipient_id}: {err_msg}",
                    extra={"phone": recipient_id, "msg_id": status_id}
                )
            else:
                logger.info(
                    f"Message status update: {status_type} for {recipient_id}",
                    extra={"phone": recipient_id, "msg_id": status_id}
                )
        return JSONResponse({"status": "received"}, status_code=200)

    if "messages" not in value:
        return JSONResponse({"status": "received"}, status_code=200)

    for message in value["messages"]:
        msg_id = message.get("id")
        phone_number = message["from"]
        
        if is_duplicate_message(msg_id):
            logger.info("Skipping duplicate message", extra={"phone": phone_number, "msg_id": msg_id})
            continue

        # Mark message as read
        await mark_as_read(phone_number, msg_id)

        body, msg_kind = _extract_message_body(message)
        session_id = phone_number
        session = session_store.get(session_id, CHANNEL)
        
        logger.info(
            f"Received WhatsApp message of type '{msg_kind}'",
            extra={"phone": phone_number, "session_id": session_id, "stage": session.get("stage") if session else None}
        )

        # Handle unsupported media messages (graceful fallback)
        if not body and msg_kind in ("image", "document", "audio", "video", "sticker", "voice"):
            if not session:
                await start_whatsapp_session(phone_number)
            else:
                await send_text(
                    phone_number,
                    "Thanks — I work best with text or the buttons/lists I send. Please reply with text.",
                )
            continue

        # Command detection to restart session at any point
        if body.lower() in ("restart", "menu", "start over", "new"):
            session_store.delete(session_id, CHANNEL)
            await start_whatsapp_session(phone_number)
            continue

        # First contact: greet + ask language immediately
        if not session:
            await start_whatsapp_session(phone_number)
            continue

        # Greetings while still on language step re-show the picker
        if body.lower() in ("hi", "hello", "habari", "heita", "start", "karibu") and session.get("stage") == "language":
            await send_language_list(phone_number, with_intro=True)
            continue

        # Help while still choosing language
        if body.lower() == "help":
            await send_text(
                phone_number,
                "I'm ContraBot. I help you choose safe contraception in private.\n\n"
                "Pick a language, answer a few questions, then ask anything.\n"
                "Type *restart* to start over.",
            )
            if session.get("stage") == "language":
                await send_language_list(phone_number, with_intro=False)
            continue

        # Live CHW handoff — ask consent first, then connect
        if body.lower() in ("talk_chw", "talk to a chw", "talk to chw", "chw", "community health worker", "professional"):
            session["handoff_pending"] = True
            session_store.set(session_id, session, CHANNEL, ttl=1800)
            await _ask_chw_consent(phone_number, session)
            continue

        if body.lower() in ("chw_yes", "yes, connect", "ndiyo, unganisha"):
            session = await _complete_chw_handoff(phone_number, session)
            session_store.set(session_id, session, CHANNEL, ttl=1800)
            continue

        if body.lower() in ("chw_no", "no thanks", "hapana"):
            session["handoff_pending"] = False
            session_store.set(session_id, session, CHANNEL, ttl=1800)
            lang = session.get("language", "english")
            msg = (
                "Sawa. Unaweza kuendelea kuuliza maswali hapa, au andika *chw* baadaye."
                if lang == "kiswahili"
                else "Okay. You can keep asking me questions here, or type *chw* later."
            )
            await send_text(phone_number, msg)
            continue

        if body.lower() == "ask_more":
            session["stage"] = "chat"
            session_store.set(session_id, session, CHANNEL, ttl=1800)
            await send_text(
                phone_number,
                "Ask me anything about side effects, methods, or clinics. Type *restart* to begin again.",
            )
            continue

        # Button id "restart" from handoff follow-up
        if body.lower() == "restart":
            session_store.delete(session_id, CHANNEL)
            await start_whatsapp_session(phone_number)
            continue

        # Handle coordinate lookup in awaiting_facility stage
        if session.get("awaiting_facility") and msg_kind == "location" and body.startswith("coords:"):
            try:
                coords_part = body.replace("coords:", "")
                lat_str, lng_str = coords_part.split(",")
                lat, lng = float(lat_str), float(lng_str)
                from services.facilities import find_facilities_by_coords, format_facilities_message
                facilities = find_facilities_by_coords(lat, lng)
                reply = format_facilities_message(facilities, max_chars=300)

                session["stage"] = "chat"
                session["awaiting_facility"] = False
                session_store.set(session_id, session, CHANNEL, ttl=1800)

                await send_text(phone_number, reply)
                await send_buttons(
                    phone_number,
                    "What next?",
                    [("talk_chw", "Talk to CHW"), ("ask_more", "Ask a question")],
                )
                continue
            except Exception as exc:
                logger.error(f"Error handling location coordinates: {exc}", extra={"phone": phone_number})
                await send_text(phone_number, "Sorry, I had trouble parsing your location. Please type your district name.")
                continue

        # Free-form AI Chat stage
        if session.get("stage") == "chat":
            if msg_kind in ("image", "document", "audio", "video", "sticker", "voice"):
                await send_text(phone_number, "I can only process text questions in chat mode. Please type your message.")
                continue

            if body.lower() in ("talk_chw", "talk to a chw", "talk to chw", "chw"):
                session["handoff_pending"] = True
                session_store.set(session_id, session, CHANNEL, ttl=1800)
                await _ask_chw_consent(phone_number, session)
                continue

            if body.lower() in ("chw_yes", "yes, connect"):
                session = await _complete_chw_handoff(phone_number, session)
                session_store.set(session_id, session, CHANNEL, ttl=1800)
                continue

            if body.lower() in ("chw_no", "no thanks"):
                session["handoff_pending"] = False
                session_store.set(session_id, session, CHANNEL, ttl=1800)
                await send_text(phone_number, "Okay. Ask me anything else, or type *chw* later.")
                continue
                
            lang = session.get("language", "english")
            try:
                rag = query_all_collections(body, num_results=2)
                context = "\n".join(rag[:2]) if rag else ""
                system = load_system_prompt()

                reply = chat_completion(
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": f"Context:\n{context}\n\nUser ({lang}): {body}"},
                    ],
                    max_tokens=300,
                    temperature=0.6,
                )
                await send_text(phone_number, reply.strip()[:300])
                await send_buttons(
                    phone_number,
                    "Need a person instead?",
                    [("talk_chw", "Talk to CHW"), ("ask_more", "Ask more")],
                )
            except Exception as exc:
                logger.error(f"Chat completion failed: {exc}", extra={"phone": phone_number})
                await send_text(
                    phone_number,
                    "I'm sorry, I'm having trouble processing that query right now. Feel free to try again or type *restart* to start over.",
                )
            continue

        # At language stage: only English / Kiswahili
        if session.get("stage") == "language" and msg_kind in ("text", "button", "list"):
            lowered = body.lower().strip()
            if lowered not in WHATSAPP_LANGUAGE_IDS:
                await send_text(phone_number, "Please choose English or Kiswahili / Chagua English au Kiswahili:")
                await send_language_list(phone_number, with_intro=False)
                continue

        # Standard intake flow processing
        normalized = _normalize_button_input(body)
        prev_stage = session.get("stage")
        try:
            session, reply, end = process_intake_input(session, normalized)
        except Exception as exc:
            logger.error(f"Error in process_intake_input: {exc}", extra={"phone": phone_number}, exc_info=True)
            await send_text(
                phone_number,
                "An unexpected error occurred. Let's restart — type *hi* to begin again.",
            )
            session_store.delete(session_id, CHANNEL)
            continue

        # Warm WhatsApp name prompt right after language pick
        if prev_stage == "language" and session.get("stage") == "name" and not end:
            reply = _whatsapp_name_prompt(session.get("language", "english"))

        if end:
            await send_text(phone_number, reply)

            session["stage"] = "chat"
            session["awaiting_facility"] = False
            session_store.set(session_id, session, CHANNEL, ttl=1800)

            await send_text(
                phone_number,
                "You are now in free-form chat mode. You can ask questions about side effects or methods, or connect with a CHW.",
            )
            await send_buttons(
                phone_number,
                "What next?",
                [("talk_chw", "Talk to CHW"), ("ask_more", "Ask a question")],
            )
            continue

        # Save updated session
        session_store.set(session_id, session, CHANNEL, ttl=1800)

        stage = session.get("stage")
        lang = session.get("language", "english")

        # Multi-select health: WhatsApp buttons are single-tap only, so use numbered text.
        if stage == "health_flags":
            await send_text(phone_number, _health_multi_prompt(lang))
            continue

        if stage == "preference":
            if session.get("awaiting_pref_text"):
                await send_text(phone_number, reply)
                continue
            pref_body, pref_buttons = _preference_multi_prompt(lang)
            await send_buttons(phone_number, pref_body, pref_buttons)
            continue

        if stage in ("gender", "breastfeeding", "access"):
            if lang == "sheng":
                prompts = {
                    "gender": ("Jinsia yako ni gani msee?", [("female", "Dem"), ("male", "Chali")]),
                    "breastfeeding": ("Uko na mtoi ananyonya chini ya miezi sita?", [("breastfeeding_yes", "Ndio"), ("breastfeeding_no", "Zii")]),
                    "access": ("Unaweza fika kliniki kupata huduma?", [("access_yes", "Ndio"), ("access_no", "Zii")]),
                }
            elif lang == "kiswahili":
                prompts = {
                    "gender": ("Je, jinsia yako ni gani?", [("female", "Kike"), ("male", "Kiume")]),
                    "breastfeeding": ("Je, unanyonyesha mtoto aliye chini ya miezi 6?", [("breastfeeding_yes", "Ndio"), ("breastfeeding_no", "La")]),
                    "access": ("Je, unaweza kutembelea kliniki kwa huduma?", [("access_yes", "Ndio"), ("access_no", "La")]),
                }
            else:
                prompts = {
                    "gender": ("What is your gender?", [("female", "Female"), ("male", "Male")]),
                    "breastfeeding": ("Breastfeeding baby under 6 months?", [("breastfeeding_yes", "Yes"), ("breastfeeding_no", "No")]),
                    "access": ("Can you visit a clinic for FP services?", [("access_yes", "Yes"), ("access_no", "No")]),
                }
            if stage in prompts:
                text, buttons = prompts[stage]
                await send_buttons(phone_number, text, buttons)
                continue

        if session.get("awaiting_facility"):
            lang = session.get("language", "english")
            if lang == "sheng":
                facility_buttons = [("facility_yes", "Nionyeshe kliniki"), ("facility_no", "Zii, niko sawa"), ("talk_chw", "Ongea na CHW")]
            elif lang == "kiswahili":
                facility_buttons = [("facility_yes", "Tafuta kliniki"), ("facility_no", "La, nimekamilisha"), ("talk_chw", "Ongea na CHW")]
            else:
                facility_buttons = [("facility_yes", "Find clinic"), ("facility_no", "Done"), ("talk_chw", "Talk to CHW")]
            await send_buttons(phone_number, reply, facility_buttons)
        else:
            await send_text(phone_number, reply)

    return JSONResponse({"status": "received"}, status_code=200)

async def verify_whatsapp_webhook(request: Request) -> Response:
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and verify_webhook_token(token):
        return PlainTextResponse(content=challenge, status_code=200)

    return JSONResponse({"error": "Verification failed"}, status_code=403)
