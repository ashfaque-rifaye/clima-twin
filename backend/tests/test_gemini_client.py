"""Unit tests for the hardened Gemini client — cache, JSON parsing, graceful
failure. Runs fully offline: the underlying ``_call`` is monkeypatched so no
SDK, key, or network is required.
"""
import app.gemini as g
from app.config import settings


def _counter(return_value):
    state = {"n": 0}

    def fake_call(prompt, system=None, response_schema=None):
        state["n"] += 1
        return return_value

    return fake_call, state


def test_gemini_available_reflects_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert g.gemini_available() is False
    monkeypatch.setattr(settings, "gemini_api_key", "x")
    assert g.gemini_available() is True


def test_generate_caches_identical_prompts(monkeypatch):
    g.cache_clear()
    fake, state = _counter("cooling plan")
    monkeypatch.setattr(g, "_call", fake)
    assert g.generate("same question") == "cooling plan"
    assert g.generate("same question") == "cooling plan"
    assert state["n"] == 1  # second call served from cache


def test_generate_none_is_not_cached(monkeypatch):
    g.cache_clear()
    fake, state = _counter(None)
    monkeypatch.setattr(g, "_call", fake)
    assert g.generate("q") is None
    assert g.generate("q") is None
    assert state["n"] == 2  # failures must not poison the cache


def test_cache_is_bounded_lru(monkeypatch):
    g.cache_clear()
    monkeypatch.setattr(settings, "gemini_cache_size", 3)
    for i in range(10):
        g._cache_put(f"k{i}", f"v{i}")
    assert len(g._cache) == 3
    assert "k9" in g._cache and "k0" not in g._cache  # oldest evicted


def test_generate_json_parses_and_caches(monkeypatch):
    g.cache_clear()
    fake, state = _counter('{"score": 4.2, "ok": true}')
    monkeypatch.setattr(g, "_call", fake)
    out = g.generate_json("give me json", response_schema=object)
    assert out == {"score": 4.2, "ok": True}
    g.generate_json("give me json", response_schema=object)
    assert state["n"] == 1  # cached


def test_generate_json_invalid_returns_none(monkeypatch):
    g.cache_clear()
    fake, _ = _counter("this is not json")
    monkeypatch.setattr(g, "_call", fake)
    assert g.generate_json("q", response_schema=object) is None


def test_generate_json_none_when_no_text(monkeypatch):
    g.cache_clear()
    fake, _ = _counter(None)
    monkeypatch.setattr(g, "_call", fake)
    assert g.generate_json("q", response_schema=object) is None
