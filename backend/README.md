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

### Milestone email delivery

The API process starts the PostgreSQL-backed email outbox dispatcher only when `TRACEIT_EMAIL_WORKER_ENABLED=true` and a per-run cap (`TRACEIT_EMAIL_MAX_JOBS_PER_RUN`, from 1 to 10) is configured; it is disabled by default. The configured provider is Gmail SMTP using `GMAIL_USER`, a Gmail app password in `GMAIL_APP_PASSWORD`, and `EMAIL_FROM`. It connects to `smtp.gmail.com:587` and requires STARTTLS. `FRONTEND_URL` is optional and controls donation links. In development, the dispatcher stays stopped if Gmail SMTP is not configured, and queued messages remain in PostgreSQL. Production startup rejects a missing or malformed Gmail sender configuration.

Before deploying this code, apply the `add_email_outbox` migration using the normal release migration step (`npx prisma migrate deploy`), then start or restart the backend with `npm start`. No separate worker process is required. Failed sends retry with exponential backoff up to eight attempts, after which the row is retained with status `FAILED` and its last error for operator review. Placeholder or malformed recipients are rejected before enqueueing and again before delivery. Inspect `email_outbox` for `PENDING`, `PROCESSING`, and `FAILED` rows when monitoring delivery. A network failure during SMTP `DATA` without a final server response is marked failed and not retried automatically because acceptance by the provider is uncertain.

SMTP delivery cannot provide exactly-once guarantees: if Gmail accepts a message but the worker loses its connection before receiving the final response, delivery is uncertain and the job is retained as `FAILED` for operator review rather than retried automatically.

### NGO-reported beneficiary transfers

After the associated allocation has been approved, an authenticated NGO can submit a transfer and evidence with `POST /api/charity/bank-transfers` (multipart field `file`; form fields `allocationId`, `amountInr`, `currencyCode`, `transferDate`, optional `bankReference`, and optional `resubmissionOfId` when replacing a rejected submission; and a stable `Idempotency-Key` header). A resubmission is a new record linked to its rejected predecessor, preserving the previous review in history. Amounts are limited to the remaining allocation and must use INR. Evidence is encrypted using the existing `AES_DOCUMENT_KEY` document convention and stored in the private `proof-docs` bucket; only the owning NGO and an authenticated admin can download it through the protected `/api/charity/bank-transfers/:id/evidence/:documentId` and `/api/admin/bank-transfers/:id/evidence/:documentId` endpoints. The API decrypts the file server-side and checks its SHA-512 digest before returning it.

Admins review submissions through `GET /api/admin/bank-transfers/pending`, then `POST /api/admin/bank-transfers/:id/approve` or `/reject` (a rejection requires a reason). Approval, audit/provenance records, and the stable-key `BENEFICIARY_TRANSFER_REVIEWED` email outbox event are committed atomically. The email says the NGO reported a transfer and an administrator approved review of its evidence; it does not claim independent bank settlement or beneficiary receipt. The third milestone is not tied to the existing `DELIVERY` attestation.

Before deploying this workflow, apply the `add_bank_transfer_review` migration with the regular release migration step after verifying the target database. This change does not apply the migration automatically.
Configure `AES_DOCUMENT_KEY` as a separate 32-byte random hex key (for example, generate one with `openssl rand -hex 32`) and configure the existing S3-compatible storage settings for a private `proof-docs` bucket. Keep the key in the deployment secret manager and back it up securely; losing or rotating it without re-encrypting evidence makes stored files unreadable.

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
