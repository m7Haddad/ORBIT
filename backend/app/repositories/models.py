"""SQLAlchemy models mirroring migration 0001 (docs/specs/schema.sql).

The enums already exist in the database (created by the migration), so every
postgresql.ENUM here uses create_type=False. Any schema change starts as a new
Alembic migration; these models follow it, never lead.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

user_role = ENUM("admin", "member", name="user_role", create_type=False)
capability_access = ENUM(
    "read", "write", "read_write", name="capability_access", create_type=False
)
capability_data_type = ENUM(
    "float", "int", "bool", "string", "enum", "json",
    name="capability_data_type", create_type=False,
)
actor_type_enum = ENUM("user", "hermes", "n8n", name="actor_type", create_type=False)
message_role = ENUM(
    "user", "assistant", "system", "tool", name="message_role", create_type=False
)
message_channel = ENUM(
    "dashboard", "telegram", name="message_channel", create_type=False
)

UUID_PK = {
    "primary_key": True,
    "server_default": text("gen_random_uuid()"),
}
NOW = {"server_default": text("now()")}


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(user_role, server_default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    refresh_token_hash: Mapped[str] = mapped_column(Text, unique=True)
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    icon: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    room_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    firmware_version: Mapped[str | None] = mapped_column(Text)
    mqtt_username: Mapped[str] = mapped_column(Text, unique=True)
    is_online: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)

    room: Mapped[Room | None] = relationship(lazy="joined")
    capabilities: Mapped[list["DeviceCapability"]] = relationship(
        back_populates="device", cascade="all, delete-orphan", lazy="selectin"
    )


class DeviceCapability(Base):
    __tablename__ = "device_capabilities"
    __table_args__ = (UniqueConstraint("device_id", "capability"),)

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    device_id: Mapped[UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE")
    )
    capability: Mapped[str] = mapped_column(Text)
    data_type: Mapped[str] = mapped_column(capability_data_type)
    unit: Mapped[str | None] = mapped_column(Text)
    access: Mapped[str] = mapped_column(capability_access)
    label: Mapped[str] = mapped_column(Text)
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)

    # Eager: async sessions cannot lazy-load, and scene execution reaches
    # capability → device for online checks.
    device: Mapped[Device] = relationship(back_populates="capabilities", lazy="joined")


class CapabilityReading(Base):
    __tablename__ = "capability_readings"
    __table_args__ = (
        CheckConstraint(
            "value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_json IS NOT NULL"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    device_capability_id: Mapped[UUID] = mapped_column(
        ForeignKey("device_capabilities.id", ondelete="CASCADE")
    )
    value_numeric: Mapped[float | None] = mapped_column(Double)
    value_text: Mapped[str | None] = mapped_column(Text)
    value_json: Mapped[Any | None] = mapped_column(JSONB)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    icon: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)

    actions: Mapped[list["SceneAction"]] = relationship(
        back_populates="scene",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SceneAction.sort_order",
    )


class SceneAction(Base):
    __tablename__ = "scene_actions"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    scene_id: Mapped[UUID] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"))
    device_capability_id: Mapped[UUID] = mapped_column(
        ForeignKey("device_capabilities.id", ondelete="CASCADE")
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    scene: Mapped[Scene] = relationship(back_populates="actions")
    device_capability: Mapped[DeviceCapability] = relationship(lazy="joined")


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint("actor_type <> 'user' OR actor_user_id IS NOT NULL"),
    )

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    actor_type: Mapped[str] = mapped_column(actor_type_enum)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_context: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    action: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(Text)
    target_id: Mapped[UUID | None] = mapped_column()
    before_state: Mapped[Any | None] = mapped_column(JSONB)
    after_state: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)


class HermesConversation(Base):
    __tablename__ = "hermes_conversations"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )


class HermesMessage(Base):
    __tablename__ = "hermes_messages"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("hermes_conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(message_role)
    channel: Mapped[str] = mapped_column(message_channel)
    content: Mapped[str] = mapped_column(Text, server_default=text("''"))
    tool_calls: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)


class AiUsageLog(Base):
    __tablename__ = "ai_usage_log"

    id: Mapped[UUID] = mapped_column(**UUID_PK)
    conversation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("hermes_conversations.id", ondelete="SET NULL")
    )
    message_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("hermes_messages.id", ondelete="SET NULL")
    )
    model: Mapped[str] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer)
    completion_tokens: Mapped[int] = mapped_column(Integer)
    total_tokens: Mapped[int] = mapped_column(
        Integer, Computed("prompt_tokens + completion_tokens", persisted=True)
    )
    cost_usd: Mapped[float] = mapped_column(Numeric(10, 6))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **NOW)
