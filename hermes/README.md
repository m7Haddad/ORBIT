# Hermes

Hermes is ORBIT's AI assistant. It is **not part of this Docker Compose stack** —
it runs on a Raspberry Pi 5 and is implemented in Stage 6.

Architecture constraints (see `/CLAUDE.md` and `docs/specs/`):

- Hermes is a REST client of the backend, same tier as the dashboard — it never
  touches MQTT or Postgres, and persists nothing locally.
- Its outbound surface is exactly `docs/specs/hermes-tool-manifest.json` (a hard
  allowlist enforced by its tool-dispatch layer).
- Its inbound chat API (`docs/specs/hermes-chat-api.yaml`) is served on the Pi and
  reachable over Tailscale only — it is deliberately not routed through Caddy.
