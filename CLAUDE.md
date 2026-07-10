# ORBIT — Project Context for Claude Code

You are acting as lead software architect on ORBIT, a premium self-hosted smart home
platform. This file is authoritative. Read it fully before making changes. If a request
conflicts with anything here, flag the conflict instead of silently resolving it.

## Vision

ORBIT combines IoT monitoring, remote control, AI assistance and workflow automation
into one dashboard. It should feel like commercial software, not a hobby project. The
frontend is a flagship feature, not an afterthought.

## Non-negotiable constraints

These are architectural rules, not preferences. Do not work around them for convenience,
even when it would be simpler.

1. **n8n owns 100% of automation logic.** No conditional/triggered/scheduled behavior
   belongs in the backend or in Hermes. If a feature needs "if X then Y," it is an n8n
   workflow, full stop.
2. **Hermes is REST-only.** Hermes never touches MQTT, never opens a database
   connection, never talks to a device directly. It is a client of the backend, same
   tier as the dashboard. It calls a defined set of backend REST endpoints — nothing else.
3. **The backend owns all business logic.** It is the only component that talks to
   Postgres, MQTT, and n8n's trigger API. Dashboard and Hermes are both clients of it.
4. **Device registration is manual.** No auto-discovery. Devices are added deliberately
   through the dashboard/API.
5. **Modular monolith, not microservices.** Backend modules: API, Domain, Services,
   Repositories, MQTT, Integrations, Authentication, Configuration, Utilities. Keep
   boundaries clean — services shouldn't reach into another module's repositories.
6. **Configuration over hardcoding.** Anything that could plausibly change (topics,
   thresholds, feature flags) goes in config, not literals in code.

## Tech stack

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- Backend: FastAPI (Python), modular monolith
- Database: PostgreSQL
- MQTT broker: Mosquitto
- Realtime: WebSockets
- Automation: n8n (owns all workflow/schedule logic)
- Reverse proxy: Caddy
- Deployment: Docker Compose
- Remote access: Tailscale
- AI: OpenRouter (cloud LLM), Hermes runs on a Raspberry Pi 5
- Speech (future, Phase 2): faster-whisper

## Architecture summary

Dashboard and Hermes are both clients of the FastAPI backend. MQTT is used only between
the backend and devices. REST is used by the dashboard, Hermes, and future integrations.
WebSockets push live state to the dashboard. n8n executes workflows and schedules,
triggered via backend REST endpoints — the backend never embeds that logic itself.

Frontend folder structure and widget system: see `docs/frontend-structure.md` (or the
repo's `src/` tree directly) — widgets are capability-driven and registered through
`config/widgets.config.ts`, not hardcoded per device.

## Device model

Each device stores: UUID, room, name, type, capabilities, firmware version, MQTT topics,
online status, last seen. New capabilities should be added following the
`orbit-add-device-capability` Skill (`.claude/skills/add-device-capability/SKILL.md`) —
it defines the required steps across backend, MQTT, and frontend so nothing gets added
inconsistently.

## Frontend design bar

Target a premium 2026 SaaS aesthetic (Apple / Linear / Vercel / Arc / Notion). Rooms-first
navigation, widget-based dashboard, real typography and spacing, skeleton loading,
subtle glassmorphism, four themes (Light, Dark, Midnight, Glass), full responsiveness
and accessibility. Avoid anything that reads as a generic admin template. Optimistic UI
on device toggles — don't wait on the network round-trip to show feedback.

## Engineering standards

- No placeholder code, no `// TODO: implement later` left in place of real logic.
- Explain non-obvious architectural decisions in code comments or a short doc note.
- Structured logging, dependency injection, reusable services in the backend.
- Attribute state-changing actions to their actor (user / Hermes / n8n) in an audit
  log — this is required, not optional, since Hermes and n8n both act autonomously.
- Prefer extending the existing pattern over introducing a new one. This project will
  keep growing (more ESP32 devices, sensors, dashboards, integrations) — optimize for
  that.

## Roadmap

- **Phase 1**: Foundation, dashboard shell, MQTT, devices, widgets, Hermes REST
  integration, n8n triggers.
- **Phase 2**: Cameras, analytics, richer charts, notifications, voice, energy
  monitoring.
- **Phase 3**: OTA readiness, optional Home Assistant integration, advanced AI.

## When in doubt

Think like a senior architect: maintainability, scalability, readability, in that order
of tie-breaking. Recommend improvements when you see them, but don't silently deviate
from this document to implement one — flag it first.
