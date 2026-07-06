"""Scenario persistence — the deck's Firestore tier.

Saved A/B scenarios persist server-side with a shareable id. A repository
abstraction lets the backend be Firestore (production) or in-memory (local /
fallback), chosen by settings and degrading safely so the app never breaks.
"""
from __future__ import annotations

import datetime as dt
import logging
import uuid

from ..config import settings

log = logging.getLogger("climatwin.data_access")


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class ScenarioStore:
    backend: str = "unknown"

    def save(self, scenario: dict) -> str:
        raise NotImplementedError

    def get(self, sid: str) -> dict | None:
        raise NotImplementedError


class InMemoryScenarioStore(ScenarioStore):
    backend = "in-memory"

    def __init__(self) -> None:
        self._data: dict[str, dict] = {}

    def save(self, scenario: dict) -> str:
        sid = _new_id()
        self._data[sid] = {**scenario, "id": sid, "created_at": _now_iso()}
        return sid

    def get(self, sid: str) -> dict | None:
        return self._data.get(sid)


class FirestoreScenarioStore(ScenarioStore):
    backend = "firestore"

    def __init__(self, project: str, collection: str):
        from google.cloud import firestore
        self._db = firestore.Client(project=project)
        self._collection = collection
        self.backend = f"firestore:{project}/{collection}"

    def save(self, scenario: dict) -> str:
        sid = _new_id()
        doc = {**scenario, "id": sid, "created_at": _now_iso()}
        self._db.collection(self._collection).document(sid).set(doc)
        return sid

    def get(self, sid: str) -> dict | None:
        snap = self._db.collection(self._collection).document(sid).get()
        return snap.to_dict() if snap.exists else None


def _resolve_project() -> str | None:
    if settings.gcp_project:
        return settings.gcp_project
    try:
        import google.auth
        _, project = google.auth.default()
        return project
    except Exception:
        return None


def build_scenario_store() -> ScenarioStore:
    mode = (settings.scenario_store or "auto").strip().lower()
    if mode != "in-memory":
        project = _resolve_project()
        if project:
            try:
                store = FirestoreScenarioStore(project, settings.firestore_collection)
                log.info("scenario store: %s", store.backend)
                return store
            except Exception as exc:
                emit = log.error if mode == "firestore" else log.info
                emit("Firestore unavailable (%s: %s) — using in-memory scenarios",
                     type(exc).__name__, exc)
        elif mode == "firestore":
            log.error("scenario_store=firestore but no GCP project resolved — using in-memory")
    return InMemoryScenarioStore()
