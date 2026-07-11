-- docs/specs/schema.sql
-- ORBIT foundational schema. PostgreSQL 15+.
-- UUID PKs everywhere except capability_readings (see note at that table).

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'member');

CREATE TYPE capability_access AS ENUM ('read', 'write', 'read_write');

CREATE TYPE capability_data_type AS ENUM ('float', 'int', 'bool', 'string', 'enum', 'json');

CREATE TYPE actor_type AS ENUM ('user', 'hermes', 'n8n');

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');

CREATE TYPE message_channel AS ENUM ('dashboard', 'telegram');

-- ---------------------------------------------------------------------------
-- Users & auth
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                 -- argon2id
    display_name    TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'member',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh-token sessions. Access tokens are stateless JWTs; only refresh
-- tokens are persisted (hashed), rotated on every use.
CREATE TABLE auth_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT NOT NULL UNIQUE,      -- sha256 of opaque token
    user_agent          TEXT,
    ip_address          INET,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ                -- NULL = active
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions (expires_at) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Rooms & devices
-- ---------------------------------------------------------------------------

CREATE TABLE rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,              -- 'living-room'
    icon        TEXT,                              -- icon key for the frontend
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id          UUID REFERENCES rooms(id) ON DELETE SET NULL,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,                -- 'esp32-sensor', 'ir-blaster', ...
    firmware_version TEXT,
    mqtt_username    TEXT NOT NULL UNIQUE,         -- 'dev-{id}', see mqtt-topics.md
    is_online        BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen        TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- manual registration only
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_room ON devices (room_id);
CREATE INDEX idx_devices_online ON devices (is_online);

-- One row per capability a device exposes. Single source of truth that the
-- REST layer, MQTT layer, and widget registry all derive from.
CREATE TABLE device_capabilities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    capability  TEXT NOT NULL,                     -- 'temperature', 'power', ...
    data_type   capability_data_type NOT NULL,
    unit        TEXT,                              -- '°C', '%', 'W'; NULL if unitless
    access      capability_access NOT NULL,
    label       TEXT NOT NULL,                     -- human-readable, widget title
    config      JSONB NOT NULL DEFAULT '{}'::jsonb, -- min/max, enum values, payload schema
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, capability)
);

CREATE INDEX idx_device_capabilities_device ON device_capabilities (device_id);
CREATE INDEX idx_device_capabilities_name ON device_capabilities (capability);

-- ---------------------------------------------------------------------------
-- Time-series readings
-- ---------------------------------------------------------------------------

-- NOTE: BIGINT identity PK, not UUID. This table is append-only and high
-- volume; a 16-byte random PK would bloat every index. Rows are addressed by
-- (device_capability_id, recorded_at) in practice, never by id.
-- If volume grows, convert to monthly partitions on recorded_at (DDL is
-- partition-ready: no FKs point INTO this table).
CREATE TABLE capability_readings (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_capability_id  UUID NOT NULL REFERENCES device_capabilities(id) ON DELETE CASCADE,
    value_numeric         DOUBLE PRECISION,        -- float/int/bool(0|1) readings
    value_text            TEXT,                    -- string/enum readings
    value_json            JSONB,                   -- composite readings (e.g. ac_control)
    recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_json IS NOT NULL)
);

-- The one index that matters: history queries by capability + time range.
CREATE INDEX idx_readings_cap_time
    ON capability_readings (device_capability_id, recorded_at DESC);

-- Retention/downsampling is an n8n-scheduled job calling a backend endpoint,
-- not a DB trigger (no automation logic in the database either).

-- ---------------------------------------------------------------------------
-- Scenes (static macros — a scene is a list of actions, never a rule.
-- Anything conditional that *invokes* a scene lives in n8n.)
-- ---------------------------------------------------------------------------

CREATE TABLE scenes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    icon        TEXT,
    description TEXT,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scene_actions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id              UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    device_capability_id  UUID NOT NULL REFERENCES device_capabilities(id) ON DELETE CASCADE,
    payload               JSONB NOT NULL,          -- value to write, e.g. {"value": true}
    sort_order            INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_scene_actions_scene ON scene_actions (scene_id, sort_order);

-- ---------------------------------------------------------------------------
-- Audit log — user, Hermes, and n8n are all first-class actors.
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type    actor_type NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- set when actor_type='user'
    actor_context JSONB NOT NULL DEFAULT '{}'::jsonb,
        -- hermes: {"conversation_id": ..., "message_id": ...}
        -- n8n:    {"workflow_id": ..., "execution_id": ...}
    action        TEXT NOT NULL,                   -- 'capability.write', 'scene.execute', 'device.create', ...
    target_type   TEXT NOT NULL,                   -- 'device', 'capability', 'scene', 'room', ...
    target_id     UUID,
    before_state  JSONB,
    after_state   JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (actor_type <> 'user' OR actor_user_id IS NOT NULL)
);

CREATE INDEX idx_audit_time ON audit_log (created_at DESC);
CREATE INDEX idx_audit_target ON audit_log (target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log (actor_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Hermes conversation memory (one conversation can span dashboard + Telegram,
-- so channel lives on the message, not the conversation).
-- ---------------------------------------------------------------------------

CREATE TABLE hermes_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT,                          -- generated summary title
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_hermes_conv_user ON hermes_conversations (user_id, last_message_at DESC);

CREATE TABLE hermes_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES hermes_conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    channel         message_channel NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    tool_calls      JSONB,                         -- REST calls Hermes made this turn
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hermes_msgs_conv ON hermes_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- AI usage / cost tracking (OpenRouter)
-- ---------------------------------------------------------------------------

CREATE TABLE ai_usage_log (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id    UUID REFERENCES hermes_conversations(id) ON DELETE SET NULL,
    message_id         UUID REFERENCES hermes_messages(id) ON DELETE SET NULL,
    model              TEXT NOT NULL,              -- OpenRouter model slug
    prompt_tokens      INT NOT NULL,
    completion_tokens  INT NOT NULL,
    total_tokens       INT GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    cost_usd           NUMERIC(10, 6) NOT NULL,
    latency_ms         INT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_time ON ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_conv ON ai_usage_log (conversation_id);
CREATE INDEX idx_ai_usage_model ON ai_usage_log (model, created_at DESC);
