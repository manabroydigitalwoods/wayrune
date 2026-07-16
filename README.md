# CodePoetry Travel Agency ERP

Multi-tenant travel-agency SaaS (Phases 1–3): foundation, CRM/inquiry, trip itinerary and quotation.

## Stack

- **Web:** React + Vite (`apps/web`)
- **API:** NestJS (`apps/api`)
- **Worker:** BullMQ + outbox poller (`apps/worker`)
- **DB:** MySQL + Prisma (native local)
- **Cache/jobs:** Redis (native local)
- **Package manager:** pnpm (required)
- **Environments:** `local` | `dev` | `prod`

## Environments

| Name | File | Purpose |
|------|------|---------|
| `local` | [`envs/local.env`](envs/local.env) | Your machine (default for `./dev`) |
| `dev` | `envs/dev.env` | Shared/hosted development |
| `prod` | `envs/prod.env` | Production |

Copy examples first:

```bash
cp envs/local.env.example envs/local.env
cp envs/dev.env.example envs/dev.env
cp envs/prod.env.example envs/prod.env
```

Real `envs/*.env` files are gitignored. Only `*.env.example` is committed.

## Quick start (local)

```bash
./infrastructure/native-up.sh
./scripts/pnpm.sh install
cp envs/local.env.example envs/local.env   # already created if you followed setup

./scripts/with-env.sh local ./scripts/pnpm.sh db:generate
./scripts/with-env.sh local ./scripts/pnpm.sh db:migrate:deploy
./scripts/with-env.sh local ./scripts/pnpm.sh db:seed

./dev                  # APP_ENV=local
./dev --env dev        # APP_ENV=dev (needs envs/dev.env)
```

Day-to-day:

```bash
./dev
./scripts/with-env.sh local ./scripts/pnpm.sh test
./scripts/with-env.sh local ./scripts/pnpm.sh db:seed
```

> **Why not bare `pnpm`?** Corepack may see `packageManager: yarn` in `~/package.json`. Use `./scripts/pnpm.sh` so this repo always runs pnpm 9.15.

Demo password for all seeded users: `Password123!`

| Kind | Email |
|------|--------|
| Platform | `admin@travelos.platform` |
| Agency | `owner@demo.travel` (+ `sales@` / `consultant@` / `finance@demo.travel`) |
| Hotel | `hotel.goa@demo.travel` |
| Homestay | `homestay.manali@demo.travel` |
| Farmstay | `farmstay.coorg@demo.travel` |
| Car rental | `cars.mumbai@demo.travel` |
| Driver | `driver.delhi@demo.travel` |
| Restaurant | `restaurant.jaipur@demo.travel` |
| DMC | `dmc.rajasthan@demo.travel` |
| Other | `events.jaipur@demo.travel` |

Guest QR (after seed): hotel `/o/gs-goa-room-101` (PIN `4821`), restaurant `/o/gs-jaipur-table-1`, homestay `/o/gs-manali-room-a1` (PIN `3391`), farmstay `/o/gs-coorg-cottage-a1` (PIN `7755`).

## Logging

Pino-based structured logging via `@travel/observability` (API uses `nestjs-pino`).

| Env | Default format | Default level |
|-----|----------------|---------------|
| `local` | Pretty (color) | `debug` |
| `dev` / `prod` | JSON lines | `info` |

Config in `envs/*.env`:

```bash
LOG_LEVEL=debug|info|warn|error
LOG_PRETTY=true|false
LOG_SERVICE_NAME=api   # or worker
```

Every request gets an `x-correlation-id` (accepted from client or generated). Logs include `service`, `appEnv`, `correlationId`, and redact secrets (`password`, tokens, passport fields, etc.).

```bash
# Tail API while developing
./dev
# Filter JSON logs in prod-like mode
./dev --env dev 2>&1 | jq -c 'select(.correlationId)'
```

## Monorepo layout

```text
apps/web | apps/api | apps/worker
packages/contracts | ui | config | auth | observability | testing
envs/ | prisma/ | infrastructure/ | docs/
```

## Deploy / rollback

```bash
./scripts/with-env.sh prod ./scripts/pnpm.sh db:migrate:deploy
./scripts/with-env.sh prod ./scripts/pnpm.sh build:prod
./scripts/with-env.sh prod ./scripts/pnpm.sh --filter @travel/api start
./scripts/with-env.sh prod ./scripts/pnpm.sh --filter @travel/worker start
```

## Tests

```bash
./scripts/with-env.sh local ./scripts/pnpm.sh test
./scripts/with-env.sh local ./scripts/pnpm.sh --filter @travel/api test:integration
```
