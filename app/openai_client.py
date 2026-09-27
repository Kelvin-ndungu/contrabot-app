import logging
import os
import re
from pathlib import Path
from dotenv import load_dotenv
import httpx
import hashlib

# Load .env from project root
project_root = Path(__file__).parent.parent
env_file = project_root / ".env"
if env_file.exists():
    load_dotenv(env_file)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

# Lazy initialization: clients will be created on first use
_gemini_client = None
_openai_client = None
_groq_client = None
_qwen_client = None

# Qwen via ModelScope's OpenAI-compatible endpoint (preferred when QWEN_API_KEY is set).
QWEN_DEFAULT_BASE_URL = "https://api-inference.modelscope.ai/v1"
QWEN_MODELS = {
    # "chat" writes the answers; "router" only classifies the question, so a lighter model is enough.
    "chat": ("QWEN_CHAT_MODEL", "Qwen-Ambassador/Qwen3.7-Max"),
    "router": ("QWEN_ROUTER_MODEL", "Qwen-Ambassador/Qwen3.7-Plus"),
}
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)


def _get_qwen_client():
    """Lazy-load the Qwen (ModelScope) client."""
    global _qwen_client
    if _qwen_client is not None:
        return _qwen_client

    key = os.getenv("QWEN_API_KEY")
    if not key:
        return None
    try:
        from openai import OpenAI
        _qwen_client = OpenAI(
            api_key=key,
            base_url=os.getenv("QWEN_BASE_URL", QWEN_DEFAULT_BASE_URL),
            timeout=float(os.getenv("QWEN_TIMEOUT", "60")),
            # A failed call is retried once without enable_thinking; SDK retries on top would stack waits.
            max_retries=0,
        )
        return _qwen_client
    except Exception:
        return None


def _qwen_completion(messages, task="chat", temperature=0.7, max_tokens=500):
    client = _get_qwen_client()
    if not client:
        return None
    env_name, default_model = QWEN_MODELS.get(task, QWEN_MODELS["chat"])
    model = os.getenv(env_name, default_model)
    kwargs = dict(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens)
    try:
        # Qwen3 models reject non-streaming calls unless thinking is switched off.
        response = client.chat.completions.create(**kwargs, extra_body={"enable_thinking": False})
    except Exception:
        try:
            response = client.chat.completions.create(**kwargs)
        except Exception as exc:
            logger.warning("Qwen call failed (%s): %s", model, exc)
            return None
    text = response.choices[0].message.content or ""
    return _THINK_BLOCK.sub("", text).strip() or None


def _get_gemini_client():
    """Lazy-load Gemini client."""
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    
    try:
        import google.genai as genai
        _gemini_client = genai.Client(api_key=key)
        return _gemini_client
    except Exception:
        return None


def _get_openai_client():
    """Lazy-load OpenAI client."""
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    
    try:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=key)
        return _openai_client
    except Exception:
        return None


# Anthropic key (optional)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Groq key (preferred)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def _get_groq_client():
    """Lazy-load Groq client."""
    global _groq_client
    if _groq_client is not None:
        return _groq_client

    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    try:
        from groq import Groq
        _groq_client = Groq(api_key=key)
        return _groq_client
    except Exception:
        return None


def _anthropic_completion(messages, model=None, max_tokens=500):
    """Simple Anthropic completion via REST using Messages API."""
    if not ANTHROPIC_API_KEY:
        return None
    payload = {
        "model": model or os.getenv("ANTHROPIC_CHAT_MODEL", "claude-3-haiku-20240307"),
        "messages": messages,
        "max_tokens": max_tokens,
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "Anthropic-Version": "2024-06-01",
    }
    try:
        resp = httpx.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        j = resp.json()
        # Standard Messages API response
        if "content" in j and j["content"]:
            first_block = j["content"][0]
            return first_block.get("text", "")
        return ""
    except Exception as e:
        return None


def _anthropic_embeddings(texts, model=None):
    """Anthropic embeddings not available in free tier; return None to fall back."""
    # Anthropic API does not provide embeddings endpoint for free/standard tier
    return None


def chat_completion(messages, model=None, temperature=0.7, max_tokens=500, task="chat"):
    """Return a text completion using Qwen (preferred), then Groq, Anthropic, Gemini, OpenAI.

    `task` picks the Qwen model ("chat" or "router"); the other providers ignore it.
    """
    if not model:
        qwen_resp = _qwen_completion(messages, task=task, temperature=temperature, max_tokens=max_tokens)
        if qwen_resp:
            return qwen_resp

    # Groq next (fastest inference)
    groq_client = _get_groq_client()
    if groq_client:
        try:
            groq_model = model or os.getenv("GROQ_CHAT_MODEL", "llama-3.1-70b-versatile")
            response = groq_client.chat.completions.create(
                model=groq_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = (response.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception:
            pass

    # Anthropic next
    anthropic_resp = _anthropic_completion(
        messages,
        model=model or os.getenv("ANTHROPIC_CHAT_MODEL"),
        max_tokens=max_tokens,
    )
    if anthropic_resp:
        return anthropic_resp

    # Gemini next
    gc = _get_gemini_client()
    if gc:
        try:
            prompt = "\n".join([m.get("content", "") for m in messages])
            gemini_model = model or os.getenv("GEMINI_CHAT_MODEL", "gemini-1.5-mini")
            resp = gc.models.generate_content(model=gemini_model, contents=prompt)
            text = (getattr(resp, "text", str(resp)) or "").strip()
            if text:
                return text
        except Exception:
            pass

    # OpenAI fallback
    oc = _get_openai_client()
    if oc:
        try:
            openai_model = model or os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
            response = oc.chat.completions.create(
                model=openai_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = (response.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception:
            pass

    raise RuntimeError("No LLM client configured or all configured providers returned an empty response.")


def _fallback_embeddings(texts, dim=384):
    """Generate deterministic embeddings from text hash without API calls."""
    embeddings = []
    for text in texts:
        # Create a hash of the text
        h = hashlib.sha256(text.encode()).digest()
        # Convert bytes to float vector of fixed dimension
        vec = []
        for i in range(dim):
            byte_idx = i % len(h)
            # Normalize to [-1, 1]
            val = (h[byte_idx] - 128) / 128.0
            vec.append(val)
        embeddings.append(vec)
    return embeddings


def get_embeddings(texts, model=None):
    """Return embeddings for a list of texts using Gemini (preferred) or OpenAI.

    Returns: list[list[float]]
    """
    def _parse_resp_embeddings(r):
        # Try several known shapes and return list of vectors
        if getattr(r, "embeddings", None):
            out = []
            for emb in r.embeddings:
                vals = getattr(emb, "values", None)
                if vals is None:
                    vals = emb.get("values") if isinstance(emb, dict) else None
                out.append(vals or [])
            return out
        if hasattr(r, "data") and isinstance(r.data, (list, tuple)):
            out = []
            for item in r.data:
                if isinstance(item, dict):
                    out.append(item.get("embedding") or item.get("values") or [])
                else:
                    # try attribute access
                    out.append(getattr(item, "embedding", getattr(item, "values", [])) or [])
            return out
        # Last resort: if the response itself looks like a single embedding
        if isinstance(r, (list, tuple)):
            return list(r)
        return []

    # Anthropic does not provide embeddings; skip to Gemini
    # Gemini path
    gc = _get_gemini_client()
    if gc:
        model = model or os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-2-preview")
        # Gemini embed_content accepts list of contents
        resp = gc.models.embed_content(model=model, contents=texts)
        embeddings = _parse_resp_embeddings(resp)

        # If Gemini returned a single embedding for the whole batch, fall back
        # to embedding each text individually in small batches to ensure
        # we get one vector per input text.
        if len(embeddings) != len(texts):
            per_text = []
            batch_size = 64
            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                r = gc.models.embed_content(model=model, contents=batch)
                parsed = _parse_resp_embeddings(r)
                if not parsed:
                    # If parsing still fails, raise for visibility
                    raise RuntimeError("Failed to parse Gemini embeddings response")
                per_text.extend(parsed)
            if len(per_text) == len(texts):
                return per_text
            # fallback to whatever we have
            return per_text or embeddings

        return embeddings

    # OpenAI fallback
    oc = _get_openai_client()
    if oc:
        model = model or "text-embedding-3-small"
        response = oc.embeddings.create(model=model, input=texts)
        return [item.embedding for item in response.data]

    # Final fallback: deterministic hash-based embeddings (no API required)
    return _fallback_embeddings(texts)
