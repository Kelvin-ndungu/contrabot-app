"""Routing of free-text questions. The model call is stubbed so these run offline."""

import pytest

import services.chat_router as chat_router
from services.chat_router import _parse_route, route_message


@pytest.fixture
def model_says(monkeypatch):
    def _set(reply):
        def fake(*args, **kwargs):
            if isinstance(reply, Exception):
                raise reply
            return reply

        monkeypatch.setattr(chat_router, "chat_completion", fake)

    return _set


@pytest.mark.parametrize(
    "message",
    [
        "I have chest pain since I started the pill",
        "I'm soaking a pad every hour after the injection",
        "fever and foul smelling discharge after my IUD was put in",
        "I was raped last night",
        "Nina damu nyingi sana",
    ],
)
def test_danger_signs_are_urgent_without_asking_the_model(model_says, message):
    model_says(AssertionError("the model should not be called"))
    assert route_message(message).route == "urgent"


def test_model_route_is_used(model_says):
    model_says('{"route": "triage"}')
    decision = route_message("Which one should I go for?")
    assert (decision.route, decision.source) == ("triage", "model")


def test_triage_becomes_answer_when_profile_is_known(model_says):
    model_says('{"route": "triage"}')
    assert route_message("Which method is best for me?", has_triage=True).route == "answer"


def test_keywords_used_when_model_unavailable(model_says):
    model_says(RuntimeError("no provider"))
    assert route_message("What method should I use?").route == "triage"
    assert route_message("How long does the implant last?").route == "answer"


@pytest.mark.parametrize(
    "raw,expected",
    [('{"route": "answer"}', "answer"), ('```json\n{"route":"urgent"}\n```', "urgent"), ("triage", "triage"), ("??", None)],
)
def test_parse_route(raw, expected):
    assert _parse_route(raw) == expected


def test_model_gives_language_and_search_query(model_says):
    model_says('{"route": "answer", "lang": "sheng", "query": "how long does the contraceptive implant last"}')
    decision = route_message("Msee, hii implant inakaa mpaka lini?")
    assert (decision.route, decision.lang, decision.query) == ("answer", "sheng", "how long does the contraceptive implant last")


def test_greeting_is_small_talk(model_says):
    model_says('{"route": "chat", "lang": "sw", "query": ""}')
    assert route_message("Habari yako").route == "chat"


@pytest.mark.parametrize("message", ["hi", "Hello!", "niaje", "Sasa msee", "thanks", "asante sana"])
def test_small_talk_keywords_used_when_model_unavailable(model_says, message):
    model_says(RuntimeError("no provider"))
    assert route_message(message).route == "chat"


def test_router_sees_the_conversation(monkeypatch):
    seen = {}

    def fake(messages, **kwargs):
        seen["prompt"] = messages[-1]["content"]
        return '{"route": "answer", "lang": "en", "query": "implant side effects"}'

    monkeypatch.setattr(chat_router, "chat_completion", fake)
    history = [{"role": "user", "content": "Tell me about the implant"}, {"role": "assistant", "content": "It lasts 3 to 5 years."}]
    route_message("and side effects?", history=history)
    assert "Tell me about the implant" in seen["prompt"] and "and side effects?" in seen["prompt"]
