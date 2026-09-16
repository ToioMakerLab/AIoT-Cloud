# AIoT-Cloud

Cloud backend + web dashboard for the **AIoT Cloud** — an IoT platform for provisioning devices (via `esp32dev-core` / `provision-pi-gateway`), ingesting their telemetry through an MQTT/Kafka gateway, and giving users a live dashboard to monitor and control them.

Built with **NestJS 11 + TypeScript + PostgreSQL (TypeORM) + Redis**, paired with a **React 19 + Vite + shadcn/ui** admin dashboard in [`web/`](./web). Both are built into a single Docker image: the API is served under `/api` and the built SPA is served for everything else, so the app ships as one deployable unit.

## Features

- **JWT auth** (access/refresh tokens, role-based guards: `USER` / `ADMIN` / `ROOT` / `GUEST`).
- **Device management** — registration/claiming, per-device config, device templates (telemetry schema + action channels), telemetry history.
- **MQTT & Kafka, bidirectional** — telemetry/status published by devices/gateways is ingested, persisted, and fanned out as `device.telemetry` / `device.status` domain events (`@nestjs/event-emitter`); actuator commands (`POST /devices/:id/actions`) publish back down to the device over the same channel it uplinks on — see [`mqtt-bidirectional-commands.md`](./docs/mqtt-bidirectional-commands.md) / [`gateway-kafka-integration.md`](./docs/gateway-kafka-integration.md).
- **Live dashboard** — configurable widget grid (`VALUE` / `CHART` / `ACTION` panels) with two realtime transports, picked per widget type:
  - **SSE** (`GET /api/devices/stream`) for `CHART` panels — resilient, auto-reconnecting stream of rolling telemetry history.
  - **WebSocket** (Socket.IO, `AppGateway`) for `ACTION` / `VALUE` panels — lower-latency push for single live values and interactive device controls.
- **Notifications** — configurable alert rules delivered via a Zalo bot integration.
- **Health checks** (`@nestjs/terminus`), Swagger API docs, i18n, rate limiting, structured logging (`pino`).

## Tech stack

| | |
|---|---|
| **Backend** | NestJS 11, TypeScript, TypeORM + PostgreSQL, Redis (cache/throttling), Socket.IO, MQTT, KafkaJS, Passport/JWT, Swagger, Pino |
| **Frontend** (`web/`) | React 19, Vite, TanStack Router/Query, shadcn/ui + Tailwind, react-grid-layout, Recharts |
| **Infra** | Docker (multi-stage build, single runtime image), PostgreSQL, Redis, pgAdmin (local dev) |

## Getting started

### 1. Prerequisites

- Node.js 22+, [pnpm](https://pnpm.io/)
- Docker (for Postgres/Redis, or the full stack via `docker-compose.yml`)

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in at least `DB_*`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, and `REDIS_PASSWORD`. `MQTT_ENABLED`, `KAFKA_ENABLED`, `MAIL_ENABLED`, and `ZALO_ENABLED` default to `false` and can be left off for local API-only development. See `.env.example` for the full list.

### 3. Backend

```bash
pnpm install
# start Postgres + Redis + pgAdmin locally
docker compose up -d postgres redis pgadmin

pnpm start:dev   # http://localhost:3000, API under /api (vite-node dev server, hot reload)
```

API docs (Swagger) are available at `http://localhost:3000/documentation` when `ENABLE_DOCUMENTATION=true`.

### 4. Frontend

```bash
cd web
pnpm install
pnpm dev              # http://localhost:5173, proxies API calls per VITE_API_URL
```

### 5. Build & run everything (production-style)

```bash
pnpm build:prod        # nest build -> dist/
pnpm build:web         # web/pnpm build -> dist-client/
pnpm start:prod         # serves API + built SPA from a single process
```

Or via Docker (mirrors the CI/deploy build exactly):

```bash
docker compose up -d --build
```

## Scripts

| Command | Description |
|---|---|
| `pnpm start:dev` | Backend dev server (vite-node, hot reload) |
| `pnpm nest:start:dev` | Backend dev server via Nest CLI (`nest start --watch`) instead |
| `pnpm build:prod` | Compile backend to `dist/` |
| `pnpm build:web` | Build the frontend to `dist-client/` |
| `pnpm start:prod` | Run the compiled backend (serves the built SPA too) |
| `pnpm lint` / `pnpm lint:fix` | Biome lint (backend) |
| `pnpm test` / `pnpm test:e2e` | Jest unit / e2e tests |
| `pnpm migration:generate <name>` / `pnpm migration:revert` | TypeORM migrations |

Frontend equivalents live in `web/package.json` (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm knip`, ...).

## Project layout

```
src/
  modules/
    auth/             # JWT auth, guards
    user/             # user accounts
    device/           # device CRUD, telemetry, SSE stream, action triggers
    device-template/  # telemetry schema + action channel definitions per device type
    dashboard/        # saved dashboard layouts (widget grid persistence)
    websocket/        # Socket.IO gateway for live telemetry/status/actions
    mqtt/             # MQTT ingestion
    kafka/            # Kafka ingestion
    notification/     # alert rules + Zalo bot delivery
    health-checker/   # /health endpoint
  common/, decorators/, filters/, guards/, interceptors/, shared/  # cross-cutting NestJS building blocks
web/
  src/features/dashboard/  # live dashboard grid, SSE + WebSocket hooks, widgets
  src/features/devices/    # device management UI
  ...
docs/                      # architecture, deployment guide, device template examples
```

See `docs/` for a deeper dive: [`architecture.md`](./docs/architecture.md), [`deployment-guide.md`](./docs/deployment-guide.md), [`gateway-kafka-integration.md`](./docs/gateway-kafka-integration.md), [`mqtt-bidirectional-commands.md`](./docs/mqtt-bidirectional-commands.md).

## License

MIT — see [`LICENSE`](./LICENSE).
