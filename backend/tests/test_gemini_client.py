"""Multi-provider AI orchestrator (Gemini → Groq → Cerebras): fallback chain,
cache, JSON parsing, and the OpenAI-compatible provider — all offline (providers
and httpx are mocked; no network, no keys required)."""
import app.llm as llm
from app.llm.openai_compat import OpenAICompatProvider


class _Fake:
    def __init__(self, name, out, avail=True):
        self.name, self._out, self._avail, self.calls = name, out, avail, 0

    def available(self):
        return self._avail

    def complete(self, prompt, system=None, *, json_schema=None):
        self.calls += 1
        return self._out


def test_generate_uses_first_provider_and_caches(monkeypatch):
    llm.cache_clear()
    a = _Fake("a", "hello")
    monkeypatch.setattr(llm, "PROVIDERS", [a])
    assert llm.generate("q") == "hello"
    assert llm.generate("q") == "hello"  # cached
    assert a.calls == 1


def test_generate_falls_through_to_next_provider(monkeypatch):
    llm.cache_clear()
    a, b = _Fake("a", None), _Fake("b", "world")
    monkeypatch.setattr(llm, "PROVIDERS", [a, b])
    assert llm.generate("q") == "world"
    assert a.calls == 1 and b.calls == 1


def test_generate_json_parses_and_falls_through_on_bad_json(monkeypatch):
    llm.cache_clear()
    a, b = _Fake("a", "not json"), _Fake("b", '{"x": 1}')
    monkeypatch.setattr(llm, "PROVIDERS", [a, b])
    assert llm.generate_json("q", response_schema=object) == {"x": 1}


def test_available_reflects_providers(monkeypatch):
    monkeypatch.setattr(llm, "PROVIDERS", [_Fake("a", None, avail=False)])
    assert llm.available() is False
    monkeypatch.setattr(llm, "PROVIDERS", [_Fake("a", "x", avail=True)])
    assert llm.available() is True


def test_facade_reexports_are_the_orchestrator():
    from app import gemini
    assert gemini.generate is llm.generate
    assert gemini.generate_json is llm.generate_json
    assert gemini.gemini_available is llm.available


class _Resp:
    def __init__(self, status, content=None):
        self.status_code = status
        self._content = content

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


def test_openai_compat_parses_content(monkeypatch):
    p = OpenAICompatProvider("groq", "https://api.groq.com/openai/v1", ["k1"], "llama-3.3-70b-versatile")
    monkeypatch.setattr("app.llm.openai_compat.httpx.post", lambda *a, **k: _Resp(200, "answer text"))
    assert p.complete("hi") == "answer text"


def test_openai_compat_rotates_key_on_429(monkeypatch):
    p = OpenAICompatProvider("groq", "https://api.groq.com/openai/v1", ["k1", "k2"], "m")
    calls = {"n": 0}

    def fake_post(*a, **k):
        calls["n"] += 1
        return _Resp(429) if calls["n"] == 1 else _Resp(200, "second key ok")

    monkeypatch.setattr("app.llm.openai_compat.httpx.post", fake_post)
    assert p.complete("hi") == "second key ok"
    assert calls["n"] == 2  # rotated to the second key


def test_openai_compat_unavailable_without_keys():
    assert OpenAICompatProvider("groq", "u", [], "m").available() is False
