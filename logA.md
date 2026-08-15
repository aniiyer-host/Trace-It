# Log.md - DEV A Implementation Trace-It

## Project Status
- Current DEV A phase: 0 (Onboarding/Analysis)
- Current DEV A step: Initial project analysis completed
- Overall status: Analyzing codebase, architecture, security, and implementation plan
- Last completed action: Read CLAUDE.md, traceit_implementation_plan.md, traceit_backend_sql.sql, backend/prisma/schema.prisma, frontend code, and security docs overview
- Next action: Present DEV A roadmap and Phase 1 requirements

## Phase Status
- Phase 1: NOT STARTED
- Phase 2: NOT STARTED
- Phase 3: NOT STARTED
- Phase 4: NOT STARTED
- Phase 5: NOT STARTED

## Implementation History
- 2026-08-15: Completed initial project onboarding:
  * Reviewed CLAUDE.md for development commands and architecture.
  * Reviewed traceit_implementation_plan.md for phase breakdown.
  * Examined traceit_backend_sql.sql for database schema.
  * Examined backend/prisma/schema.prisma for ORM models.
  * Reviewed frontend structure (React+Vite+Zustand).
  * Scanned security_docs/ for threats, remediations, compliance.
  * Identified that backend is not scaffolded (only prisma.config.ts exists).
  * Frontend appears to have a working React app with mock auth.

## Decisions and Discrepancies
- Discrepancy between SQL enums and Prisma enums (e.g., UserRole, NgoStatus, CampaignStatus, DonationStatus). Need to align during Phase 1 scaffold.
- Security documentation outlines requirements for authentication, authorization, input validation, etc. that must be incorporated.

## Validation
- No validation performed yet (no code to test).

---
## Project Status
- Current DEV A phase: 1 (Scaffold & Auth)
- Current DEV A step: Starting implementation
- Overall status: Setting up backend scaffold and auth
- Last completed action: Read log.md, re-read Phase 1 requirements, checked existing files
- Next action: Initialize Node.js + Express project with TypeScript, install dependencies, set up Prisma

## Project Status
- Current DEV A phase: 1 (Scaffold & Auth)
- Current DEV A step: Discrepancy identified between SQL and Prisma schema
- Overall status: Need to align schema before proceeding
- Last completed action: Installed dependencies, attempted prisma db pull (failed due to DB not running)
- Next action: Address schema discrepancy; need to decide whether to use SQL as source of truth or existing Prisma schema.

## Discrepancy Details
- SQL enums vs Prisma enums:
  * UserRole: SQL has DONOR, CHARITY, ADMIN, AUDITOR; Prisma has DONOR, BENEFICIARY, CHARITY, ADMISSOR (missing AUDITOR, extra BENEFICIARY)
  * NgoStatus: SQL has PENDING, ACTIVE, REJECTED, SUSPENDED; Prisma has PENDING_REVIEW, APPROVED, ACTIVE, REJECTED
  * CampaignStatus: SQL has DRAFT, PENDING_APPROVAL, ACTIVE, PAUSED, COMPLETED, REJECTED; Prisma has ACTIVE, COMPLETED, PAUSED
  * DonationStatus: SQL has INITIATED, SUCCESS, FAILED, REFUNDED, ALLOCATED, DISBURSED, DELIVERED; Prisma has PENDING, SUCCESS, FAILED, ALLOCATED, DISBURSED, DELIVERED (missing INITIATED, REFUNDED; PENDING vs INITIATED)
  * DocumentType: SQL has 8 types; Prisma has 3
  * GovRequestStatus: SQL does not have this enum (status is text); Prisma has RECEIVED, UNDER_REVIEW, FULFILLED, CLOSED
- Other mismatches:
  * SQL profiles has sol_wallet_address; Prisma User has tipLinkWallet
  * SQL profiles has refresh_token_hash; Prisma User does not have it (but actually Prisma User does not have refreshTokenHash? Wait, Prisma User does not show refreshTokenHash; we see only tipLinkWallet. However, the SQL includes refresh_token_hash. Prisma User model does not have it.)
  * SQL has audit_logs table with actor_type enum; Prisma AuditLog model does not have actor_type (it has userId, ip, userAgent, requestPath, httpMethod, responseStatus, metadata).
  * SQL has government_requests table with status text; Prisma GovernmentRequest has status enum.

This affects Phase 1 because the User model is used for auth.

## Project Status
- Current DEV A phase: 1 (Scaffold & Auth)
- Current DEV A step: Prisma schema generated, but database connection failed
- Overall status: Cannot connect to the database at localhost:51213 (or 51214). The .env file shows prisma+postgres://localhost:51213, but the error indicated 51214. We need to resolve this to proceed.
- Last completed action: Prisma schema updated and generated successfully.
- Next action: Write the auth routes and services, and middleware, assuming the database will be available.

## Project Status
- Current DEV A phase: 1 (Scaffold & Auth)
- Current DEV A step: Discrepancy identified: SQL profiles table missing password_hash column
- Overall status: Cannot implement authentication as per plan without password storage. Need to resolve discrepancy.
- Last completed action: Fixed Prisma client import and TypeScript config, but schema lacks passwordHash field.
- Next action: Record discrepancy in log.md and await instruction on how to proceed.

## Blockers
- SQL profiles table lacks password_hash column required for bcrypt authentication (per implementation plan).
- Cannot proceed with auth implementation without resolving this discrepancy.
- Blocked on Phase 1 until decision on how to store passwords (add column to SQL, use alternative auth mechanism, etc.).
