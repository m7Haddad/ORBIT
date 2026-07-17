# ADR 0001 — Firmware MQTT library: 256dpi/arduino-mqtt, not PubSubClient

**Date:** 2026-07-17 · **Status:** accepted · **Scope:** all ESP32 device firmware

## Context

`docs/specs/mqtt-topics.md` requires **QoS 1 on every device publish** (state and
availability). The Stage 3 proof-of-concept sketch was initially written against
PubSubClient, which is receive-capable at QoS 1 but can only **publish QoS 0** — a
well-known library limitation. The gap was caught after the first bench test.

Options considered:

- **(a) Migrate to a QoS 1-capable client library** (256dpi/arduino-mqtt).
- **(b) Accept QoS 0 for the proof-of-concept** and document the deviation
  (retained + 30s periodic republish makes lost sensor telemetry self-healing,
  so the practical risk for a DHT11 was low).

## Decision

**(a) — migrate to `MQTT` by Joel Gaehwiler (256dpi/arduino-mqtt).**

The deciding factor: a reflash was already mandatory (the PoC sketch had
placeholder credentials, an unregistered device id, and an unroutable broker
address), so option (b)'s only benefit — avoiding a reflash — didn't exist.
Given that, keeping the spec intact beats documenting an exception:

1. The spec stays exactly as written; no deviation note to maintain or forget.
2. This sketch is the seed for every future device template (CLAUDE.md:
   optimize for growth). Future actuator firmware genuinely needs reliable
   QoS 1 command handling; starting on the right library avoids a later
   migration across a fleet.
3. arduino-mqtt's API is as simple as PubSubClient's (`setWill`, `connect`,
   `publish(topic, payload, retained, qos)`), so nothing is lost.

## Consequences

- Arduino library dependency is **"MQTT" by Joel Gaehwiler** (Library Manager),
  not PubSubClient. The sketch header says so.
- Firmware config (WiFi + broker credentials) moved to `orbit_config.h`,
  gitignored, with a committed `orbit_config.example.h` — device passwords and
  home WiFi credentials never enter git history.
- QoS 1 publish means the broker ACKs each state publish; with retained
  messages this gives at-least-once delivery into the backend's subscription,
  matching the ingest path's idempotence assumptions (duplicate readings are
  acceptable, silent loss is not).
