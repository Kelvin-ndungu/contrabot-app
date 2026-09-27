"""Unit tests for shared intake multi-select + free-text parsing."""

from channels.intake import new_session, parse_health_selection, process_intake_input


def test_parse_health_multi_numbers():
    status, flags, free = parse_health_selection("1,3")
    assert status == "yes"
    assert flags == ["high_blood_pressure", "blood_clots"]
    assert free is None


def test_parse_health_none():
    status, flags, free = parse_health_selection("0")
    assert status == "no"
    assert flags == []
    assert free is None


def test_parse_health_free_text():
    status, flags, free = parse_health_selection("I have asthma and worry about hormones")
    assert status == "yes"
    assert flags == []
    assert "asthma" in (free or "").lower()


def test_parse_health_phrase():
    status, flags, free = parse_health_selection("diabetes and liver issues")
    assert status == "yes"
    assert "diabetes" in flags
    assert "liver_disease" in flags
    assert free is None


def test_preference_free_text_and_pref_type():
    session = new_session("254700000000", "whatsapp")
    session["stage"] = "preference"
    session["language"] = "english"

    session, reply, end = process_intake_input(session, "pref_type")
    assert not end
    assert session["stage"] == "preference"
    assert session.get("awaiting_pref_text") is True
    assert "own words" in reply.lower()

    session, reply, end = process_intake_input(session, "Something discreet for travel")
    assert not end
    assert session["stage"] == "access"
    assert session["profile"]["preference_notes"] == "Something discreet for travel"


def test_health_stage_stores_flag_list():
    session = new_session("254700000000", "whatsapp")
    session["stage"] = "health_flags"
    session, reply, end = process_intake_input(session, "2 6")
    assert not end
    assert session["stage"] == "preference"
    assert session["profile"]["health_flags"] == "yes"
    assert session["profile"]["health_flag_list"] == ["migraines_aura", "breast_cancer"]
