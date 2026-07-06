"""RAG: retrieval returns relevant knowledge and /ask grounds on it."""
from app.knowledge import retrieve
from app.routers import ask as ask_mod


def test_retrieve_finds_relevant_chunk():
    hits = retrieve("why should we use native trees for cooling?", k=3)
    topics = [h["topic"] for h in hits]
    assert "native trees" in topics


def test_retrieve_flood_question():
    hits = retrieve("how is flood risk calculated?", k=3)
    assert any(h["topic"] == "flood model" for h in hits)


def test_retrieve_empty_on_no_overlap():
    assert retrieve("", k=3) == []


def test_ask_offline_includes_references(client):
    body = client.post("/ask", json={"question": "which cool roofs reduce heat?"}).json()
    assert body["source"] == "offline"
    assert "cool roofs" in body["references"]


def test_ask_gemini_grounds_on_retrieved_knowledge(client, monkeypatch):
    captured = {}

    def fake_generate(prompt, system=None):
        captured["prompt"] = prompt
        return "Native neem and pungai give strong low-pollen canopy cooling."

    monkeypatch.setattr(ask_mod, "gemini_available", lambda: True)
    monkeypatch.setattr(ask_mod, "generate", fake_generate)

    body = client.post("/ask", json={"question": "why native trees?"}).json()
    assert body["source"] == "gemini"
    assert "native trees" in body["references"]
    assert "Reference knowledge" in captured["prompt"]  # RAG context injected
