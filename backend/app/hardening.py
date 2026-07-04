"""Production middleware: rate limiting, security headers, request logging.

Dependency-free (in-memory) by design — Cloud Run runs a single container for
this app, so a process-local fixed-window limiter is sufficient and keeps the
$0 budget intact. If the service ever scales out, swap for a shared store.
"""
import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("climatwin")

# path prefixes that are static content — never rate-limited
_STATIC_PREFIXES = ("/assets/", "/favicon", "/icons/", "/manifest")

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), payment=()",
}


class RateLimiter:
    """Fixed-window per-client limiter (requests / minute)."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, tuple[int, int]] = {}  # ip -> (window, count)

    def allow(self, ip: str) -> bool:
        window = int(time.time() // 60)
        w, count = self._hits.get(ip, (window, 0))
        if w != window:
            count = 0
        count += 1
        self._hits[ip] = (window, count)
        # opportunistic cleanup so the map can't grow unbounded
        if len(self._hits) > 10_000:
            self._hits = {k: v for k, v in self._hits.items() if v[0] == window}
        return count <= self.per_minute


def client_ip(request: Request) -> str:
    # Cloud Run puts the real client at the front of X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def install(app: FastAPI, rate_per_minute: int) -> None:
    limiter = RateLimiter(rate_per_minute)

    @app.middleware("http")
    async def _observe(request: Request, call_next):
        path = request.url.path
        static = path.startswith(_STATIC_PREFIXES) or "." in path.rsplit("/", 1)[-1]

        if not static and not limiter.allow(client_ip(request)):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded — try again in a minute."},
                headers={"Retry-After": "60", **_SECURITY_HEADERS},
            )

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("unhandled error on %s %s", request.method, path)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error."},
                headers=_SECURITY_HEADERS,
            )
        if not static:
            log.info(
                "%s %s -> %s (%.0f ms)",
                request.method, path, response.status_code,
                (time.perf_counter() - start) * 1000,
            )
        for k, v in _SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response
