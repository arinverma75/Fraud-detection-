"""Redis client wrapper with async support and graceful degradation."""
import json
import time
from typing import Any, Optional
import redis.asyncio as aioredis
import structlog

from app.core.config import settings

log = structlog.get_logger()


class RedisClient:
    def __init__(self):
        self._client: Optional[aioredis.Redis] = None
        self._connected: bool = False

    async def initialize(self):
        self._client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
        )
        await self._client.ping()
        self._connected = True
        log.info("Redis connection established")

    async def close(self):
        if self._client:
            await self._client.close()
        self._connected = False

    def _ok(self) -> bool:
        """Return True if Redis is available."""
        return self._connected and self._client is not None

    async def get(self, key: str) -> Optional[Any]:
        if not self._ok():
            return None
        val = await self._client.get(key)
        if val:
            try:
                return json.loads(val)
            except json.JSONDecodeError:
                return val
        return None

    async def set(self, key: str, value: Any, ttl: int = 3600):
        if not self._ok():
            return
        await self._client.setex(key, ttl, json.dumps(value))

    async def incr(self, key: str, ttl: int = 3600) -> int:
        if not self._ok():
            return 0
        val = await self._client.incr(key)
        if val == 1:
            await self._client.expire(key, ttl)
        return val

    async def zadd(self, key: str, mapping: dict, ttl: int = 86400):
        if not self._ok():
            return
        await self._client.zadd(key, mapping)
        await self._client.expire(key, ttl)

    async def zrangebyscore(self, key: str, min_score: float, max_score: float):
        if not self._ok():
            return []
        return await self._client.zrangebyscore(key, min_score, max_score)

    async def zcard(self, key: str) -> int:
        if not self._ok():
            return 0
        return await self._client.zcard(key)

    async def get_velocity(self, user_id: str, window_seconds: int) -> int:
        """Get transaction count in a time window."""
        if not self._ok():
            return 0
        key = f"velocity:{user_id}"
        now = time.time()
        cutoff = now - window_seconds
        await self._client.zremrangebyscore(key, 0, cutoff)
        return await self._client.zcard(key)

    async def record_transaction(self, user_id: str, txn_id: str):
        """Record a transaction timestamp for velocity tracking."""
        if not self._ok():
            return
        key = f"velocity:{user_id}"
        now = time.time()
        await self.zadd(key, {txn_id: now}, ttl=86400)

    async def get_amount_sum(self, user_id: str, window_seconds: int) -> float:
        """Get sum of transaction amounts in a time window."""
        if not self._ok():
            return 0.0
        key = f"amounts:{user_id}"
        now = time.time()
        cutoff = now - window_seconds
        entries = await self._client.zrangebyscore(key, cutoff, "+inf", withscores=True)
        return sum(score for _, score in entries)


redis_client = RedisClient()
