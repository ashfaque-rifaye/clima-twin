"""Region registry — the scalability seam of the tile engine.

The tile router never hardcodes a city: it asks the registry which analysis
regions intersect a tile and pulls each region's calibrated lattice. Scaling
Chennai → Coimbatore → all Tamil Nadu → India is registering more regions
(one entry + a lattice provider each); the renderer and tile API are
untouched. Coarse bands (country/state) are region-independent.
"""
from dataclasses import dataclass
from typing import Awaitable, Callable

# provider(hazard) -> (lattice points, source label)
Provider = Callable[[str], Awaitable[tuple[list[dict], str]]]


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    extent: tuple[float, float, float, float]  # west, south, east, north
    provider: Provider


_REGISTRY: list[Region] = []


def register(region: Region) -> None:
    _REGISTRY.append(region)


def regions_intersecting(w: float, s: float, e: float, n: float) -> list[Region]:
    return [
        r for r in _REGISTRY
        if e >= r.extent[0] and w <= r.extent[2] and n >= r.extent[1] and s <= r.extent[3]
    ]


def all_regions() -> list[Region]:
    return list(_REGISTRY)


def _register_builtin() -> None:
    """Phase 1: Chennai Metropolitan Area. Phase 2/3 add entries here."""
    from .routers.grid import calibrated_grid

    async def chennai_provider(hazard: str):
        return await calibrated_grid(hazard)

    register(Region(
        id="in-tn-chennai",
        name="Chennai Metropolitan Area",
        extent=(80.15, 12.84, 80.34, 13.24),
        provider=chennai_provider,
    ))


_register_builtin()
