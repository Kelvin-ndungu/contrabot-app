# ContraBot ↔ CHW Live Handoff

## Problem

Users often finish ContraBot counseling and still want to speak with a **professional Community Health Worker (CHW)**. Today the bot can create an anonymous referral code, but that does not actively connect the CHW to the user.

We need a flow where:

1. The user **asks** for professional help.
2. The bot **gets clear consent**.
3. The bot **notifies a CHW**.
4. The CHW and user can **talk directly** (WhatsApp), without ContraBot sitting in the middle of every message.

## Solution (chosen)

**Consent → notify CHW → direct WhatsApp intro**

ContraBot does **not** relay chat forever. It only introduces them.

```text
User                ContraBot                 CHW (WhatsApp)
 |                      |                           |
 |-- Talk to CHW ------>|                           |
 |<-- Consent ask ------|                           |
 |-- Yes, connect ----->|                           |
 |                      |-- create referral -------->|
 |                      |-- store user WA in Redis ->| (TTL 24h, not SQL)
 |                      |-- WhatsApp notify -------->|
 |<-- "CHW will contact |                           |
 |     you. Code CB-XX" |                           |
 |                      |                           |-- opens wa.me/user
 |<--------------------- WhatsApp chat ------------>|
```

### Privacy rules

| Data | Where | How long |
|------|--------|----------|
| District, method interest, code | Postgres `referrals` | Kept (anonymous) |
| User WhatsApp number | **Redis only** (`contrabot:handoff:{code}`) | **24 hours**, then gone |
| CHW WhatsApp numbers | Roster file / env (staff) | Configured, not from clients |
| Full chat transcript between user↔CHW | Not stored by ContraBot | N/A |

No long-term storage of client phone numbers in SQL.

### User experience (WhatsApp)

1. User taps **Talk to CHW** (or types `chw`).
2. Bot asks: *A CHW can message you on WhatsApp. Continue?*
   - **Yes, connect** / **No thanks**
3. If yes:
   - Creates referral code
   - Picks a CHW for the user’s district (roster)
   - Messages that CHW with code + district + `wa.me` deep link to the user
   - Tells the user: wait for CHW + show code
4. If no: stays in bot chat / asks more questions

### CHW experience

1. Receives WhatsApp alert from ContraBot.
2. Sees open handoff in CHW dashboard (same referral queue).
3. Claims referral → optional **Contact client** button (uses Redis contact while TTL valid).
4. Chats with the user on WhatsApp; marks completed when done.

### Web experience

After a recommendation, **Request CHW follow-up** can request a live handoff if the user enters a WhatsApp number **and** ticks consent. Number goes to Redis only.

## Configuration

```env
# Comma-separated CHW WhatsApp numbers used as fallback notify list
CHW_NOTIFY_NUMBERS=254712345001,254712345002

# Optional JSON roster (preferred): id, name, district, whatsapp
# CHW_ROSTER_PATH=data/chw_roster.json
```

Example `data/chw_roster.json`:

```json
[
  {
    "chw_id": "CHW-NRB-01",
    "name": "Mary",
    "district": "Nairobi",
    "whatsapp": "254712345001",
    "active": true
  }
]
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/handoffs` | Create handoff (consent required). Body may include `user_whatsapp` for web. |
| `GET` | `/api/referrals/{id}/contact` | Returns short-lived `wa_link` for CHW while Redis TTL is valid |
| Existing | `/api/referrals` | List / claim / complete |

## Out of scope

- Bot forwarding every message both ways
- Permanent storage of client phone numbers
- Full OTP / JWT auth for CHWs (still MVP profile-based)

## Related docs

- [CHW.md](CHW.md) — dashboard roles & referrals
- [CHW_HANDOFF.md](CHW_HANDOFF.md) — live connect user ↔ CHW
- [WHATSAPP.md](WHATSAPP.md) — Meta Cloud API setup
- [DATA_USE.md](DATA_USE.md) — privacy principles
