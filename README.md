# Trace-It

Trace-It is a donation and provenance tracking application with a React web client, an Express/Prisma API, and a Solana Anchor program.

## Repository layout

- `frontend/` — React, TypeScript, and Vite application.
- `backend/` — Express API, Prisma schema and migrations, background workers, and backend tests.
- `blockchain/` — Anchor program, local validator tests, Devnet preflight and deployment tools.
- `docker-compose.yml` — local supporting services (PostgreSQL, Redis, Elasticsearch, and Kibana).

## Local development

Use Node.js and npm versions compatible with the package lockfiles. Install dependencies separately in each application directory:

```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../blockchain && npm ci
```

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in local development settings. Do not commit `.env` files or wallet keypairs. The backend requires PostgreSQL; set its pooled and direct database URLs to a **disposable development database** before using Prisma commands. Review the target before applying migrations or seeds.

Start the API and web client in separate terminals:

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

The frontend development server defaults to Vite's local port. Set `VITE_API_URL` in `frontend/.env` to the local backend URL if needed.

## Local validation

```bash
cd backend && npm run typecheck && npm run build
cd frontend && npm run lint && npm run build
cd blockchain && npm test
```

Backend integration tests may require an isolated test database. Do not point tests at a shared or production database.

Before running backend tests, inspect the effective database target used by
`backend/.env.test`; the full Jest suite performs database writes. The Anchor
test script starts a local validator with `--reset` against
`/tmp/traceit-test-ledger` and uses ports 8899 and 9900. Run it only when that
ledger is disposable and those ports are available; test cleanup stops the
validator but leaves the ledger directory behind.

## Solana Devnet

Devnet deployment is a separate, fee-bearing operation. First review `blockchain/docs/phase5-operations-runbook.md` and run `npm run phase5:preflight` from `blockchain/` with the intended program, fee-payer, and upgrade-authority public keys configured. Preflight is read-only; it does not deploy the program or initialize its on-chain configuration. Do not run `scripts/deploy-devnet.sh` or the Devnet smoke script until the deployment details and each transaction have been explicitly approved. Config initialization uses `TRACEIT_SMOKE_ACTION=initialize-config`; anchor creation is a later, separately approved invocation with `TRACEIT_SMOKE_ACTION=write-anchor`. Never put private keys in this repository or an environment file committed to source control.

The backend durable anchor worker uses the separate `TRACEIT_ANCHOR_*` settings documented in `backend/.env.example`. Keep them unset until the intended Devnet program is deployed, its on-chain configuration is initialized, and the required database migration is approved and applied.

## Operational notes

- Prisma schema: `backend/prisma/schema.prisma`; migration files: `backend/prisma/migrations/`.
- Backend setup and service details: `backend/README.md`.
- Anchor worker and Devnet runbooks: `blockchain/docs/`.
- Keep database backups and deployment evidence outside the repository, with access restricted to the operators who need them.
