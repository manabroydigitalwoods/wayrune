# Wayrune

Multi-tenant travel-agency SaaS (Phases 1–3): foundation, CRM/inquiry, trip itinerary and quotation.

**Brand:** Wayrune (WAY-roon) · **Domains:** [wayrune.com](https://wayrune.com) · [wayrune.ai](https://wayrune.ai) · [wayrune.in](https://wayrune.in) · **Studio:** CodePoetry

## Stack

- **Web:** React + Vite (`apps/web`)
- **API:** NestJS (`apps/api`)
- **Worker:** BullMQ + outbox poller (`apps/worker`)
- **DB:** MySQL 8 + Prisma
- **Cache/jobs:** Redis
- **Package manager:** pnpm 9 (required — see `packageManager` in `package.json`)
- **Environments:** `local` | `dev` | `prod`
- **CLI:** `wr` (aliases: `wayrune`, `presence`) — theme & component packages

## Commands (pnpm)

Use **pnpm from the repo root** for day-to-day work.


| Command                          | What it does                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `pnpm install`                   | Install workspace deps                                                 |
| `pnpm infra:up`                  | Ensure local MySQL DB + Redis are reachable                            |
| `pnpm setup`                     | `infra:up` → generate Prisma client → check migrations → deploy → seed |
| `pnpm dev`                       | Run web + API + worker (`APP_ENV=local`)                               |
| `pnpm dev:dev`                   | Same stack with `APP_ENV=dev`                                          |
| `pnpm build` / `pnpm build:prod` | Production build                                                       |
| `pnpm test`                      | Unit tests                                                             |
| `pnpm test:integration`          | API integration tests                                                  |
| `pnpm lint` / `pnpm typecheck`   | Lint / TypeScript                                                      |
| `pnpm db:generate`               | Prisma client                                                          |
| `pnpm db:migrate`                | Apply pending migrations (repair checksums + `migrate deploy`)         |
| `pnpm db:migrate:deploy`         | Same as `db:migrate`                                                   |
| `pnpm db:migrate:create <name>`  | Author a new migration from live DB → schema (no shadow replay)        |
| `pnpm db:migrate:repair`         | Sync checksums after edited historical migrations                      |
| `pnpm db:migrate:dev`            | Prisma `migrate dev` (optional; may reset if history/schema drift)     |
| `pnpm db:check-migrations`       | Reject Postgres-dialect SQL (this repo is MySQL)                       |
| `pnpm db:seed`                   | Seed demo data                                                         |
| `pnpm db:seed:scenarios`         | Opt-in bulk scenario fixtures on demo-travel (date filters / ops / AR) |
| `pnpm db:studio`                 | Prisma Studio                                                          |


Apps load `envs/<local\|dev\|prod>.env` via `@wayrune/config`. Prisma CLI also reads root `.env` (copy from `envs/local.env` if missing).

## Quick start (local)

```bash
cp envs/local.env.example envs/local.env
cp .env.example .env          # Prisma CLI fallback (same DB URL)

pnpm install
pnpm setup                    # MySQL/Redis check + migrate + seed
pnpm dev                      # web :5173 · api :3001 · worker
```

Day-to-day:

```bash
pnpm dev
pnpm test
pnpm db:migrate               # apply pending migrations after pull
pnpm db:migrate:create foo    # after editing prisma/schema.prisma
pnpm db:seed                  # re-seed when needed
pnpm db:seed:scenarios        # massive relative-dated dogfood data (after db:seed)
```

### Scenario bulk seed (opt-in)

Fills **demo-travel** with wipeable `scenario-bulk-v1` rows (parties, leads, inquiries, trips, bookings, payments, tasks, inbox) using **relative dates** so Travel / Due / Movement / Profitability / Dashboard filters stay non-empty. Not run by CI or `pnpm setup`.

```bash
pnpm db:seed                  # required first (org + suppliers + pipeline)
pnpm db:seed:scenarios        # default: medium on demo-travel, wipe on
```

| Env | Default | Notes |
| --- | --- | --- |
| `SEED_SCENARIO_ORG` | `demo-travel` | Set `pilot-staging` only with `SEED_SCENARIO_ALLOW_PILOT=1` |
| `SEED_SCENARIO_SCALE` | `medium` | `small` \| `medium` \| `large` |
| `SEED_SCENARIO_WIPE` | `1` | Set `0` to append without deleting prior SCN rows |

Re-run is safe: wipe deletes prior `TRP-SCN-*` / `INQ-SCN-*` / `scenario-bulk-v1:*` keys then regenerates.


| Kind       | Email                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Platform   | `admin@travelos.platform`                                                |
| Agency     | `owner@demo.travel` (+ `sales@` / `consultant@` / `finance@demo.travel`) |
| Hotel      | `hotel.goa@demo.travel`                                                  |
| Homestay   | `homestay.manali@demo.travel`                                            |
| Farmstay   | `farmstay.coorg@demo.travel`                                             |
| Car rental | `cars.mumbai@demo.travel`                                                |
| Driver     | `driver.delhi@demo.travel`                                               |
| Restaurant | `restaurant.jaipur@demo.travel`                                          |
| DMC        | `dmc.rajasthan@demo.travel`                                              |
| Other      | `events.jaipur@demo.travel`                                              |


Guest QR (after seed): hotel `/o/gs-goa-room-101` (PIN `4821`), restaurant `/o/gs-jaipur-table-1`, homestay `/o/gs-manali-room-a1` (PIN `3391`), farmstay `/o/gs-coorg-cottage-a1` (PIN `7755`).

## Environments


| Name    | File                               | Purpose                               |
| ------- | ---------------------------------- | ------------------------------------- |
| `local` | `[envs/local.env](envs/local.env)` | Your machine (default for `pnpm dev`) |
| `dev`   | `envs/dev.env`                     | Shared/hosted development             |
| `prod`  | `envs/prod.env`                    | Production                            |


```bash
cp envs/local.env.example envs/local.env
cp envs/dev.env.example envs/dev.env
cp envs/prod.env.example envs/prod.env
```

Real `envs/*.env` files are gitignored. Only `*.env.example` is committed.

To run any pnpm script against another env file:

```bash
./scripts/with-env.sh dev pnpm db:migrate:deploy
./scripts/with-env.sh prod pnpm build:prod
```

## Logging

Pino-based structured logging via `@wayrune/observability` (API uses `nestjs-pino`).


| Env            | Default format | Default level |
| -------------- | -------------- | ------------- |
| `local`        | Pretty (color) | `debug`       |
| `dev` / `prod` | JSON lines     | `info`        |


Config in `envs/*.env`:

```bash
LOG_LEVEL=debug|info|warn|error
LOG_PRETTY=true|false
LOG_SERVICE_NAME=api   # or worker
```

Every request gets an `x-correlation-id` (accepted from client or generated). Logs include `service`, `appEnv`, `correlationId`, and redact secrets (`password`, tokens, passport fields, etc.).

```bash
pnpm dev
# Filter JSON logs in prod-like mode
pnpm dev:dev 2>&1 | jq -c 'select(.correlationId)'
```

## Monorepo layout

```text
apps/web | apps/api | apps/worker
packages/contracts | ui | config | auth | observability | testing
envs/ | prisma/ | infrastructure/ | docs/
```

## Deploy / rollback

```bash
./scripts/with-env.sh prod pnpm db:migrate:deploy
./scripts/with-env.sh prod pnpm build:prod
./scripts/with-env.sh prod pnpm start:api
./scripts/with-env.sh prod pnpm start:worker
```

## Troubleshooting

`**pnpm` resolves to the wrong package manager** (e.g. Corepack picks Yarn from `~/package.json`):

```bash
./scripts/pnpm.sh install
./scripts/pnpm.sh dev
```

That wrapper always runs this repo’s pnpm 9.15.