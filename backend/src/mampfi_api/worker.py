import asyncio
import logging


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[worker] %(message)s")
    logging.info("Worker started (placeholder). Sleeping...")
    # Placeholder loop; replace with outbox processing and schedulers.
    while True:
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
