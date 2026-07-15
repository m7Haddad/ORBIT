# ORBIT

Self-hosted smart home platform: IoT monitoring, remote control, AI assistance
(Hermes) and workflow automation (n8n) in one dashboard.

- Architecture rules: [CLAUDE.md](CLAUDE.md) (authoritative)
- Contracts & specs: [docs/specs/](docs/specs/)

## Stack

| Service | Role | Where |
|---|---|---|
| `frontend` | Next.js dashboard | behind Caddy at `https://$ORBIT_DOMAIN` |
| `backend` | FastAPI modular monolith — owns all business logic, Postgres, MQTT, n8n triggers | behind Caddy at `https://$ORBIT_DOMAIN/api/*` (+ `/ws/*`) |
| `postgres` | Database (backend-only) | internal, `127.0.0.1:5432` for dev tools |
| `mosquitto` | MQTT broker (backend ↔ devices only) | LAN port `1883` |
| `n8n` | Owns 100% of automation logic | behind Caddy at `https://$N8N_DOMAIN` |
| `caddy` | Reverse proxy / TLS | ports 80/443 |
| Hermes | AI assistant — REST client of the backend | Raspberry Pi 5, Tailscale-only (Stage 6, not in compose) |

## Quickstart

```bash
cp .env.example .env            # then replace every change-me: openssl rand -hex 24
./infra/mosquitto/gen-dynsec.sh # bootstrap broker dynamic security from .env
docker compose up -d --build
docker compose ps               # wait until everything is healthy

# Database: apply migrations, then seed the admin user + starter rooms
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m scripts.seed

# Service principals (paste into Hermes / n8n config, never into git)
docker compose run --rm backend python -m scripts.issue_service_token hermes
docker compose run --rm backend python -m scripts.issue_service_token n8n
```

Schema changes are Alembic migrations under `backend/migrations/versions/`
(0001 is `docs/specs/schema.sql` verbatim) — never applied as raw SQL scripts.

Then:

- Dashboard: <https://orbit.localhost>
- Backend health: <https://orbit.localhost/api/v1/health>
- n8n UI: <https://n8n.orbit.localhost>

`*.localhost` names resolve to 127.0.0.1 automatically. Caddy serves them with
its internal CA — accept the local-cert warning or install Caddy's root CA.

## MQTT

Devices (ESP32s) connect to `<host>:1883` with **per-device credentials** issued
once at manual registration (`POST /api/v1/devices`) and revoked on deletion —
provisioned at runtime through the broker's dynamic-security plugin, no restarts.
Anonymous access is disabled; each device sees only its own topic subtree.
Topic convention + ACLs: [docs/specs/mqtt-topics.md](docs/specs/mqtt-topics.md).

To change the backend/dynsec-admin broker secrets: edit `.env`, re-run
`./infra/mosquitto/gen-dynsec.sh`, then `docker compose restart backend`.

## Remote access (Tailscale, on the host)

Tailscale runs on the host — not in compose — so it survives stack restarts and
also covers Hermes on the Pi.

```bash
# inside WSL Ubuntu (or install the Windows client instead)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Caddy listens on all interfaces, so once the host is on your tailnet the
dashboard/API/n8n are reachable from any tailnet device. For clean HTTPS names,
set `ORBIT_DOMAIN` / `N8N_DOMAIN` in `.env` to names that resolve to the host's
Tailscale IP (MagicDNS) and restart Caddy. Hermes's chat API (Pi, port 8100) is
Tailscale-internal by design and never proxied through Caddy.

## Repo layout

```
backend/     FastAPI app (modular monolith — scaffold grows in Stage 2)
frontend/    Next.js dashboard (App Router, TS, Tailwind)
hermes/      Notes only — Hermes lives on the Pi (Stage 6)
infra/       caddy/ (Caddyfile), mosquitto/ (broker config + ACL + passwd tooling)
docs/specs/  Source-of-truth contracts (API, MQTT, schema, widgets, …)
```
