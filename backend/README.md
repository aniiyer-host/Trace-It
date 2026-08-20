# Trace-It Backend

This is the backend for the Trace-It donation tracking platform.

## Prerequisites

- Node.js (v18 or higher)
- A Supabase project (or any PostgreSQL database with a pooled + direct connection string)
- npm

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the `backend` directory with **two** connection strings — one pooled (for the running app) and one direct (for migrations):

   ```
   DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```

   Both are available in your Supabase dashboard under **Project Settings → Database → Connection string** (pick "Transaction" for the pooled one, "Session"/"Direct" for the other).
   - `DATABASE_URL` (port `6543`, pooled) is used by the app at runtime, via `@prisma/adapter-pg` in `src/db/prisma.ts`.
   - `DIRECT_DATABASE_URL` (port `5432`, direct) is used by the Prisma CLI for migrations, configured in `prisma.config.ts`.

3. **Generate Prisma client**:

   ```bash
   npx prisma generate
   ```

4. **Run database migrations**:

   ```bash
   npx prisma migrate deploy
   ```

   This applies all committed migrations, including table creation and the custom Postgres triggers (`set_updated_at`, `sync_campaign_raised`, `mark_tokens_redeemed`, `handle_legal_hold`).

   > **Note:** `npx prisma migrate dev` may fail on a fresh Supabase project because the default connection doesn't have shadow-database create permissions. Use `migrate deploy` to apply existing migrations — it doesn't need a shadow database. Only use `migrate dev` locally if you're authoring _new_ migrations and have shadow DB access set up.

5. **Seed the database (recommended for development)**:

   ```bash
   npx prisma db seed
   # or
   npm run seed
   ```

   This populates the database with initial data (admin, NGO, donors, campaigns, etc.).

6. **Verify triggers are active** (optional sanity check):
   ```bash
   npx tsx tests/test_triggers_exist.ts
   npx tsx tests/test_trigger_detailed.ts
   ```
   All entries should report as found/working. If not, see Troubleshooting below.

## Development

To start the development server:

```bash
npm run dev
```

This uses `tsx watch` to run TypeScript directly and auto-restart on file changes.

## Production

To build the application:

```bash
npm run build
```

To start the production server:

```bash
npm start
```

## Notes

- The backend uses TypeScript (ESM) with Prisma ORM 7 and a Supabase-hosted PostgreSQL database.
- Prisma's connection config lives in `prisma.config.ts` (not `schema.prisma` — Prisma 7 moved datasource URLs out of the schema file).
- The Prisma schema (models, enums) is in `prisma/schema.prisma`; column names are camelCase and match the TypeScript field names exactly (no `snake_case` mapping).
- Custom Postgres triggers/functions are defined as raw SQL inside `prisma/migrations/<timestamp>_add_triggers_and_functions/migration.sql`, since Prisma's schema language doesn't support triggers natively.
- Mock services are currently used for some functionality (wallet, payments, etc.) and are marked with TODO comments for real integration.
- Environment variables are not yet configured for production; see the security documentation for planned secrets management.

## Troubleshooting

- **Prisma client errors after schema changes**: run `npx prisma generate` again.
- **Database connection fails**: verify both `DATABASE_URL` and `DIRECT_DATABASE_URL` in `.env`, and confirm your Supabase project is active (not paused).
- **`migrate dev` hangs or errors on shadow database**: use `npx prisma migrate deploy` instead — it applies existing migrations without needing a shadow database. Only set up a dedicated shadow database if you're creating new migrations locally.
- **A trigger doesn't seem to fire**: run `npx tsx tests/test_triggers_exist.ts` to confirm it actually exists in the database. If it's missing, check that all migrations under `prisma/migrations/` were applied with `npx prisma migrate deploy`.
- **`column does not exist` errors in raw SQL**: remember all Prisma-generated columns are camelCase and must be double-quoted in raw SQL (e.g. `"updatedAt"`, not `updated_at`).
