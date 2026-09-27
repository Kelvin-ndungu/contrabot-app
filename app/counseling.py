from app.openai_client import chat_completion

SYSTEM_PROMPT = (
    "You are ContraBot, a contraception counselor trained on the WHO Medical Eligibility Criteria (MEC). "
    "Your role is to provide personalized, evidence-based information to help users make informed decisions about contraception.\n\n"
    "RULES:\n"
    "1. Never diagnose medical conditions. Never prescribe medication.\n"
    "2. Always recommend clinic or CHW confirmation before starting a method.\n"
    "3. If the user reports hypertension, migraine with aura, or history of DVT/PE, do NOT recommend combined hormonal methods. "
    "State: 'Based on what you have told me, please visit a clinic before starting any hormonal method. This is important for your safety.'\n"
    "4. Use plain, respectful language. All users deserve non-judgmental care.\n"
    "5. For side effect queries, assess severity and provide switching guidance when appropriate.\n"
    "6. Keep responses concise (under 160 chars for USSD, under 300 chars for WhatsApp).\n"
)


def get_counseling_response(user_query: str, channel: str = "whatsapp", language: str = "english") -> str:
    """
    Generate a contraceptive counseling response using OpenAI.

    Args:
        user_query: The user's question or input
        channel: 'ussd', 'whatsapp', or 'web'
        language: Language code (e.g., 'english', 'swahili', 'luganda')

    Returns:
        Plain text counseling response
    """
    max_tokens = 160 if channel == "ussd" else 300

    try:
        response = chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_query},
            ],
            temperature=0.7,
            max_tokens=max_tokens,
        )
        return response
    except Exception:
        if channel == "ussd":
            return "Sorry, try again in a moment."
        return "Sorry, I could not answer just now. Please try again in a moment."
