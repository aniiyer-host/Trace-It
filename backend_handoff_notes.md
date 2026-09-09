# Backend Handoff Notes: Missing API Routes for Frontend Integration

This document outlines the API endpoints that the frontend currently expects but are either missing or misaligned in the backend implementation. 

During the Phase 3 frontend integration, we wired the React app (via `src/utils/apiClient.ts`) to hit real backend endpoints instead of the mock API. However, because the backend is still under development, several routes are returning `404 Not Found`. 

**Backend Developers:** Please implement the following routes or adjust the base paths (e.g., placing them under `/api/charity` or `/api/donor`). If you change the base paths, please update the frontend's `apiClient.ts` to match your new route structures.

## 1. NGO (Charity) Routes
The frontend currently calls `/api/ngos/...` for NGO-specific actions. The backend currently uses `/api/charity` for NGO routes. 
- **`GET /api/ngos/attestations/pending`** (or `/api/charity/attestations/pending`)
  - **Purpose:** Fetches a list of attestations that are awaiting the NGO's signature.
- **`POST /api/ngos/attestations`** (or `/api/charity/attestations`)
  - **Purpose:** Submits an NGO's signature/confirmation for an attestation (receipt or delivery).
  - **Payload:** `{ donationId: string, type: 'receipt' | 'delivery' }`

## 2. Milestone Routes
The frontend expects to interact with milestones for proof uploads and approvals. 
- **`POST /api/milestones/:milestoneId/proof`** (or `/api/charity/milestones/:milestoneId/proof`)
  - **Purpose:** Allows an NGO to upload proof (e.g., CID/hash) for a completed milestone.
- **`POST /api/milestones/:milestoneId/approve`**
  - **Purpose:** Approves a milestone (could be merged with the Admin approve route).
- **`POST /api/milestones/:milestoneId/reject`**
  - **Purpose:** Rejects a milestone proof.

## 3. Admin Routes
The frontend expects several Admin queue and approval routes under `/api/admin/...` which are currently missing from `backend/src/routes/admin.ts`.
- **`GET /api/admin/attestations/pending`**
  - **Purpose:** Fetches attestations that require admin review.
- **`POST /api/admin/attestations/:attestationId/approve`**
  - **Purpose:** Admin approves an attestation.
- **`POST /api/admin/attestations/:attestationId/reject`**
  - **Purpose:** Admin rejects an attestation.
  - **Payload:** `{ reason: string }`
- **`GET /api/admin/milestones/pending`**
  - **Purpose:** Fetches milestones whose proofs have been uploaded by NGOs but are waiting for admin approval.
- **`POST /api/admin/milestones/:milestoneId/approve`**
  - **Purpose:** Admin approves a milestone.
- **`POST /api/admin/milestones/:milestoneId/reject`**
  - **Purpose:** Admin rejects a milestone.

## 4. Donor / Donation Routes
The frontend calls `/api/donations/...` but these should likely be scoped under `/api/donor/donations/...` based on the backend structure.
- **`GET /api/donations/user/:userId`** (or `/api/donor/donations`)
  - **Purpose:** Fetches the donation history for the currently logged-in donor.
- **`POST /api/donations`** (or `/api/donor/donations`)
  - **Purpose:** Creates a new donation record after a successful Razorpay transaction.
- **`GET /api/donations/:donationId/attestation`**
  - **Purpose:** Fetches the attestation status/details for a specific donation.
- **`POST /api/donations/:donationId/attestation`**
  - **Purpose:** Allows a donor to request an attestation (receipt or delivery).
  - **Payload:** `{ type: 'receipt' | 'delivery' }`

## Note on Empty Dashboards
Currently, the Admin and NGO dashboards render completely blank (no tabs). This is because `GET /api/public/campaigns` successfully returns `[]` (an empty array) when the database has no active campaigns. Once campaigns are seeded into the database and their status is set to `ACTIVE`, the dashboards will automatically render the campaign tabs.
