"""Async Kafka producer and consumer clients."""
import json
from typing import Any
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
import structlog

from app.core.config import settings

log = structlog.get_logger()


class KafkaProducerClient:
    def __init__(self):
        self._producer: AIOKafkaProducer | None = None

    async def start(self):
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",  # Wait for all replicas
            enable_idempotence=True,
            compression_type="gzip",
        )
        await self._producer.start()
        log.info("Kafka producer started")

    async def stop(self):
        if self._producer:
            await self._producer.stop()

    async def send(self, topic: str, value: Any, key: str | None = None):
        if not self._producer:
            log.debug("Kafka not available — skipping event publish", topic=topic)
            return
        try:
            await self._producer.send_and_wait(topic, value=value, key=key)
        except Exception as e:
            log.warning("Kafka send failed", topic=topic, error=str(e))


kafka_producer = KafkaProducerClient()
