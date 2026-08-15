# Trace-It Backend

This is the backend for the Trace-It donation tracking platform.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy the example environment file (if provided) or create a `.env` file in the backend directory.
   - The `.env` file should contain:
     ```
     DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<database_name>?schema=public"
     ```
   - Example:
     ```
     DATABASE_URL="postgresql://postgres:12345@localhost:5432/TraceIt?schema=public"
     ```

3. **Generate Prisma client**:
   ```bash
   npx prisma generate
   ```

4. **Run database migrations**:
   ```bash
   npx prisma migrate dev --name init
   ```
   This will create the database schema and apply migrations.

5. **Seed the database (optional but recommended for development)**:
   ```bash
   npx tsx seed.ts
   ```
   This will populate the database with initial data (admin, NGO, donors, campaigns, etc.).

## Development

To start the development server:
```bash
npm run dev
```
This uses `ts-node-dev` to automatically restart the server on file changes.

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

- The backend uses TypeScript with Prisma ORM and a PostgreSQL database.
- The Prisma schema is located in `prisma/schema.prisma`.
- Mock services are currently used for some functionality (wallet, payments, etc.) and are marked with TODO comments for real integration.
- Environment variables are not yet configured for production; see the security documentation for planned secrets management.

## Troubleshooting

- If you encounter issues with Prisma client generation, ensure you have run `npx prisma generate` after any changes to the schema.
- If the database connection fails, verify your `.env` file and that the PostgreSQL server is running and accessible.