# Backend CLI Commands Reference

This document provides a comprehensive list of all CLI commands used in the Trace-It backend development workflow, as extracted from package.json scripts, README.md, and other documentation files.

## Package.json Scripts

From `/home/aaditya/projects/Trace-It/backend/package.json`:

### Development Commands
- `npm run dev` - Starts development server using `ts-node-dev src/index.ts`
- `npm start` - Starts production server using `node dist/index.js`
- `npm run build` - Builds TypeScript to JavaScript using `tsc`
- `npm run typecheck` - Performs TypeScript type checking without emission using `tsc --noEmit`

### Testing Commands
- `npm test` - Runs Jest test suite with specific configuration:
  ```
  cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand --forceExit
  ```
  This runs tests in serial mode (`--runInBand`) and forces exit after completion.

### Database Commands
- `npm run seed` - Seeds the database using `prisma db seed`
- `npm run db:seed` - Alternative seeding command (same as above)

## Prisma CLI Commands

From README.md and Prisma documentation:

### Migration Commands
- `npx prisma generate` - Generates Prisma client from schema
- `npx prisma migrate deploy` - Applies migrations to the database (recommended for production)
- `npx prisma migrate dev` - Develops new migrations locally (requires shadow database access)
- `npx prisma db seed` - Runs the seed script (equivalent to npm run seed)

### Database Introspection
- `npx prisma db pull` - Pulls schema from database (not mentioned in docs but standard Prisma)
- `npx prisma db push` - Pushes schema changes directly (not recommended for production)
- `npx prisma studio` - Opens Prisma GUI for database browsing

## Testing-Specific Commands

From README.md and test files:

### Trigger Verification
- `npx tsx tests/test_triggers_exist.ts` - Tests if all PostgreSQL triggers exist
- `npx tsx tests/test_trigger_detailed.ts` - Tests trigger functionality in detail
- `npx tsx tests/test_seed.ts` - Tests the seed script execution

### Individual Test Files
The test command can be modified to run specific test files:
- `npm test -- backend/tests/authService.test.ts` - Run specific test file
- `npm test -- backend/tests/charity.test.ts` - Run charity tests
- `npm test -- backend/tests/donor.test.ts` - Run donor tests
- `npm test -- backend/tests/admin.test.ts` - Run admin tests
- `npm test -- backend/tests/disbursement.test.ts` - Run disbursement tests
- `npm test -- backend/tests/blockchainService.test.ts` - Run blockchain service tests
- `npm test -- backend/tests/blockchainIntegration.test.ts` - Run blockchain integration tests
- `npm test -- backend/tests/e2e.test.ts` - Run end-to-end tests

## Environment and Setup Commands

### Environment Setup
- Creating `.env` file with required variables:
  ```
  DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
  DIRECT_DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
  PORT=3000
  NODE_ENV=development
  ```

### Dependency Management
- `npm install` - Installs all dependencies from package.json
- `npm update` - Updates dependencies to latest versions (not explicitly mentioned but standard)
- `npm audit` - Audits dependencies for security vulnerabilities

## Development Workflow Commands

### Common Development Sequence
1. Initial setup:
   ```bash
   npm install
   # Create .env file with database URLs
   npx prisma generate
   npx prisma migrate deploy
   npm run seed
   ```

2. Development cycle:
   ```bash
   npm run dev  # Start development server
   ```

3. Testing during development:
   ```bash
   npm test                    # Full test suite
   npm test -- tests/donation.test.ts  # Specific test file
   npm run typecheck           # Type checking
   ```

4. Production preparation:
   ```bash
   npm run build               # Compile TypeScript
   npm start                   # Start production server
   ```

## Troubleshooting Commands

From README.md troubleshooting section:

### Prisma Issues
- `npx prisma generate` - Regenerate Prisma client after schema changes
- `npx prisma migrate deploy` - Use instead of migrate dev for shadow database issues

### Connection Issues
- Verify database connection strings in `.env` file
- Check Supabase project status (not paused)

### Trigger Issues
- `npx tsx tests/test_triggers_exist.ts` - Verify triggers exist
- `npx tsx tests/test_trigger_detailed.ts` - Detailed trigger testing

### General Debugging
- Check application logs (stdout/file)
- Verify environment variables are loaded correctly
- Check Docker container logs if using Docker

## Alternative Execution Methods

### Using npx Directly
- `npx ts-node-dev src/index.ts` - Direct development server start
- `npx tsc` - Direct TypeScript compilation
- `npx jest` - Direct Jest execution
- `npx tsx <file.ts>` - Direct TypeScript execution (used for test scripts)

### Using yarn or pnpm (if configured)
Though package.json shows npm, equivalent commands would be:
- `yarn dev` or `pnpm dev`
- `yarn test` or `pnpm test`
- etc.

## Scripts in package.json Detail

Let me provide more detailed explanation of each script:

1. `"dev": "ts-node-dev src/index.ts"` - 
   - Uses ts-node-dev for hot-reloading TypeScript development
   - Automatically restarts server on file changes
   - Uses ES module syntax (as specified by "type": "module")

2. `"start": "node dist/index.js"` - 
   - Runs the compiled JavaScript output
   - Assumes build step has been run first

3. `"build": "tsc"` - 
   - Compiles TypeScript to JavaScript using TypeScript compiler
   - Outputs to dist/ directory per tsconfig.json

4. `"test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand --forceExit"` - 
   - Sets Node.js experimental VM modules flag for Jest compatibility
   - Runs tests in serial mode to prevent database connection conflicts
   - Forces process exit after test completion

5. `"typecheck": "tsc --noEmit"` - 
   - Performs TypeScript type checking without generating output files
   - Fast way to catch type errors

6. `"seed": "prisma db seed"` and `"db:seed": "prisma db seed"` - 
   - Both run the Prisma seeding script
   - Populates database with initial test/development data

## Environment Variables Required

While not strictly CLI commands, these environment variables must be set for commands to work:

From README.md:
- `DATABASE_URL` - Pooled connection string (port 6543)
- `DIRECT_DATABASE_URL` - Direct connection string (port 5432)
- `PORT` - Server port (default 3000)
- `NODE_ENV` - Environment mode (development/production)

Additional variables likely needed for full functionality (based on dependencies):
- AWS S3 credentials (for document storage)
- Azure Blob Storage credentials (alternative storage)
- JWT secret (for authentication)
- Email service credentials (for emailService)
- Node Vault configuration (for secret management)
- Solana network endpoint and wallet (for blockchain integration)

## Command Usage Patterns

### Database Development Workflow
When making schema changes:
1. Edit `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name <migration-name>`
3. Generate client: `npx prisma generate`
4. Run seed: `npm run seed`
5. Test changes

### Production Deployment
1. Ensure code is committed
2. Set production environment variables
3. Build: `npm run build`
4. Deploy built artifact
5. Run migrations: `npx prisma migrate deploy`
6. Start server: `npm start`

### Testing Best Practices
1. Always seed test database before running tests
2. Use `--runInBand` to avoid database connection pooling issues in tests
3. Run type checking regularly: `npm run typecheck`
4. Keep dependencies updated: `npm update` followed by testing

This covers all identifiable CLI commands used in the Trace-It backend project based on the available documentation and configuration files.