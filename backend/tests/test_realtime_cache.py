"""The per-coordinate live cache must be a bounded LRU (memory-safe under a
flood of distinct coordinates) and must honor its TTL."""
import app.realtime as rt


def test_cache_is_bounded_lru(monkeypatch):
    rt._cache.clear()
    monkeypatch.setattr(rt, "_CACHE_MAX", 5)
    for i in range(20):
        rt._remember((i, i), {"v": i})
    assert len(rt._cache) == 5
    assert (19, 19) in rt._cache        # newest kept
    assert (0, 0) not in rt._cache      # oldest evicted


def test_recall_returns_fresh_entry():
    rt._cache.clear()
    rt._remember((1, 1), {"v": 1})
    assert rt._recall((1, 1)) == {"v": 1}
    assert rt._recall((9, 9)) is None   # never stored


def test_recall_expires_by_ttl(monkeypatch):
    rt._cache.clear()
    rt._remember((1, 1), {"v": 1})
    monkeypatch.setattr(rt, "_TTL", -1)  # force every entry stale
    assert rt._recall((1, 1)) is None
