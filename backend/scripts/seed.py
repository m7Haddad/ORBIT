"""Seed minimal data: one admin user and two rooms.

Idempotent — inserts are keyed on unique columns (users.email, rooms.slug) with
ON CONFLICT DO NOTHING, so re-running never duplicates or overwrites. Devices
are deliberately NOT seeded: registration is manual by design (CLAUDE.md) and
the real flow is exercised in Stage 3.

Run inside the backend container:
    docker compose run --rm backend python -m scripts.seed
"""

import sys

from argon2 import PasswordHasher
from sqlalchemy import create_engine, text

from app.config import get_settings

ROOMS = [
    {"name": "Living Room", "slug": "living-room", "icon": "sofa", "sort_order": 0},
    {"name": "Bedroom", "slug": "bedroom", "icon": "bed", "sort_order": 1},
]


def main() -> int:
    settings = get_settings()
    if not settings.orbit_admin_email or not settings.orbit_admin_password:
        print("ORBIT_ADMIN_EMAIL / ORBIT_ADMIN_PASSWORD must be set", file=sys.stderr)
        return 1

    # argon2id with library defaults — the schema (users.password_hash comment)
    # mandates argon2id; Stage 2's auth module verifies against these hashes.
    password_hash = PasswordHasher().hash(settings.orbit_admin_password)

    engine = create_engine(settings.database_url)
    with engine.begin() as conn:
        created_user = conn.execute(
            text(
                """
                INSERT INTO users (email, password_hash, display_name, role)
                VALUES (:email, :password_hash, :display_name, 'admin')
                ON CONFLICT (email) DO NOTHING
                RETURNING id
                """
            ),
            {
                "email": settings.orbit_admin_email,
                "password_hash": password_hash,
                "display_name": "Admin",
            },
        ).first()
        print(
            f"admin user {settings.orbit_admin_email}: "
            + ("created" if created_user else "already exists")
        )

        for room in ROOMS:
            created_room = conn.execute(
                text(
                    """
                    INSERT INTO rooms (name, slug, icon, sort_order)
                    VALUES (:name, :slug, :icon, :sort_order)
                    ON CONFLICT (slug) DO NOTHING
                    RETURNING id
                    """
                ),
                room,
            ).first()
            print(
                f"room {room['slug']}: "
                + ("created" if created_room else "already exists")
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
