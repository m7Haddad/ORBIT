"""Mint a long-lived service JWT for Hermes or n8n.

The token's actor_type claim is what the audit log attributes writes to; keep
the two tokens distinct and store them only in the respective service's config.

Run inside the backend container:
    docker compose run --rm backend python -m scripts.issue_service_token hermes
    docker compose run --rm backend python -m scripts.issue_service_token n8n --days 365
"""

import argparse

from app.auth.tokens import create_access_token
from app.config import get_settings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("actor", choices=["hermes", "n8n"])
    parser.add_argument(
        "--days", type=int, default=None,
        help="validity in days (default: SERVICE_TOKEN_TTL_DAYS from config)",
    )
    args = parser.parse_args()

    settings = get_settings()
    if not settings.jwt_secret:
        parser.error("JWT_SECRET is not configured")
    days = args.days if args.days is not None else settings.service_token_ttl_days
    token = create_access_token(
        settings,
        sub=f"service:{args.actor}",
        actor_type=args.actor,
        ttl_seconds=days * 86400,
    )
    print(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
