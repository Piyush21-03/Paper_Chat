"""In-process cache of user-adjustable retrieval settings (Phase 4
Settings page). Backed by the AppSettings DB row so it survives
restarts (loaded once at startup + refreshed on every PUT /api/settings)
-- kept separate from retrieval/config.py's env-derived defaults so the
core pipeline modules don't need direct DB access.
"""

from typing import Any, Dict

_overrides: Dict[str, Any] = {}


def set_overrides(values: Dict[str, Any]) -> None:
    _overrides.update({k: v for k, v in values.items() if v is not None})


def get(key: str, default):
    return _overrides.get(key, default)


def get_all_overrides() -> Dict[str, Any]:
    return dict(_overrides)
