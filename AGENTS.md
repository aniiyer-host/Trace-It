# Repository Guidelines

## Project Structure & Module Organization

Trace-It is split into three primary applications:

- `backend/`: Express and TypeScript API. Application code lives in `src/`, Prisma schema and migrations in `prisma/`, and Jest suites in `tests/`.
- `frontend/`: React, TypeScript, and Vite client. Put pages, components, hooks, services, and shared utilities under `src/`; static files belong in `public/`.
- `blockchain/`: Solana Anchor workspace. Rust programs are under `programs/`, TypeScript integration tests under `tests/`, and validator helpers under `scripts/`.

Plans and audits are kept at the repository root and in `audits/`. Do not treat generated `dist/`, `target/`, or dependency directories as source.

## Build, Test, and Development Commands

Run commands from the relevant package directory after `npm install`.

- `cd backend && npm run dev`: start the API with file watching.
- `cd backend && npm run build`: compile TypeScript; use `npm run typecheck` for a no-output check.
- `cd backend && npm test`: run Jest unit tests serially.
- `cd frontend && npm run dev`: start Vite locally.
- `cd frontend && npm run build`: type-check and create a production build.
- `cd frontend && npm run lint`: run ESLint, including React hooks and security rules.
- `cd blockchain && anchor build`: compile the Anchor program.
- `cd blockchain && npm test`: build, start a local validator, and run Anchor integration tests. Never point tests at mainnet.
- `docker compose up`: start containerized services when required.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and existing import conventions. Name React components and types in `PascalCase`, functions and variables in `camelCase`, and tests `*.test.ts`. Rust follows `rustfmt`, `snake_case` functions/modules, and `PascalCase` types. Keep route handlers thin; place reusable logic in `backend/src/services/`.

## Testing Guidelines

Backend tests use Jest and Supertest. Add focused tests for service and route behavior, especially authorization, payment, retry, and blockchain failure paths. Anchor tests use Mocha/Chai and require a local Solana toolchain. Run focused tests first, then full package checks before opening a PR.

## Commit & Pull Request Guidelines

History generally uses short imperative subjects, often Conventional Commit prefixes such as `feat:` and `fix:`. Keep each commit scoped. PRs should explain behavior changes, list verification commands, link issues or plan phases, and include screenshots for UI changes. Call out schema migrations, environment changes, and security implications explicitly; never commit wallet keypairs, secrets, or populated `.env` files.
