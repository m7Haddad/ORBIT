"""The authenticated actor. User, Hermes, and n8n are all first-class —
everything state-changing is attributed to exactly one Principal."""

from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ActorType(StrEnum):
    USER = "user"
    HERMES = "hermes"
    N8N = "n8n"


class Principal(BaseModel):
    actor_type: ActorType
    # Set iff actor_type == USER (mirrors the audit_log CHECK constraint).
    user_id: UUID | None = None
    email: str | None = None
    display_name: str | None = None
    role: str | None = None
    # Parsed X-Hermes-Context / X-N8N-Context header — lands in
    # audit_log.actor_context on every state-changing call.
    context: dict[str, Any] = {}

    @property
    def is_user(self) -> bool:
        return self.actor_type == ActorType.USER
