from __future__ import annotations

from sqlalchemy import text

from ..db import get_engine


def main() -> None:
    engine = get_engine()
    print("Connecting to database...")
    with engine.begin() as conn:
        # Simple connectivity check; replace with real seed logic later.
        result = conn.execute(text("SELECT version()"))
        version = result.scalar_one()
        print(f"Connected. Postgres: {version}")
        print("Seed placeholder complete.")


if __name__ == "__main__":
    main()
