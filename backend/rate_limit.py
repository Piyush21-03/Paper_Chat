"""Sliding-window-ish rate limiter. Uses Redis (INCR + EXPIRE, correct
across multiple API instances) when REDIS_URL is configured and
reachable; otherwise falls back to an in-process counter (single
instance only -- fine for local dev, documented limitation in
production without Redis).
"""

import time
from typing import Optional

from config import settings
from logging_config import get_logger

logger = get_logger("rate_limit")

_redis_client = None
_redis_init_attempted = False
_memory_counters = {}


def _get_redis():
    global _redis_client, _redis_init_attempted

    if _redis_init_attempted:
        return _redis_client

    _redis_init_attempted = True

    if not settings.REDIS_URL:
        return None

    try:
        import redis
        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        logger.info("rate limiter backend=redis")
    except Exception as error:
        logger.warning("Redis unavailable for rate limiting, falling back to in-memory: %s", error)
        _redis_client = None

    return _redis_client


def check_rate_limit(key: str, limit_per_minute: int) -> bool:
    """Returns True if the request is allowed, False if the limit for
    this key has been exceeded in the current 60s window."""

    window = int(time.time() // 60)
    redis_key = f"ratelimit:{key}:{window}"

    client = _get_redis()

    if client is not None:
        try:
            count = client.incr(redis_key)
            if count == 1:
                client.expire(redis_key, 60)
            return count <= limit_per_minute
        except Exception as error:
            logger.warning("redis rate limit check failed, allowing request: %s", error)
            return True

    # In-memory fallback (per-process only).
    bucket = _memory_counters.setdefault(redis_key, 0)
    _memory_counters[redis_key] = bucket + 1

    # Cheap cleanup so _memory_counters doesn't grow unbounded.
    if len(_memory_counters) > 10000:
        stale = [k for k in _memory_counters if not k.endswith(f":{window}")]
        for k in stale:
            _memory_counters.pop(k, None)

    return _memory_counters[redis_key] <= limit_per_minute
