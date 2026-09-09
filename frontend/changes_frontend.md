# Frontend Changes Log

This document logs all modifications made to the frontend to complete the Phase 3 blockchain API connections and the UI revamp based on `architecture_working.md` and `lexical-twirling-origami.md`.

## Changes

### 1. Updated `ngoStore.ts`
- **Replaced mock functions with `apiClient`:** Removed `fetchCampaigns`, `approveMilestone`, `uploadMilestoneProof`, `createAttestation`, etc., from `mockApi` and replaced them with `apiService`.
- **`fetchPendingAttestations`:** Changed to use `apiService.ngos.getPendingAttestations()` instead of simulating a timeout and returning mock data.
- **`signAttestation`:** Switched to use `apiService.ngos.signAttestation(donationId, type)` to trigger the real blockchain signing process via the backend.
- **`uploadMilestoneProof`:** Now calls `apiService.milestones.uploadProof()` with correct parameters to record cohort hashing proofs on-chain.
- **`approveMilestone`:** Pointed to `apiService.milestones.approve()`.

### 2. Updated `adminStore.ts`
- **Replaced mock functions with `apiClient`:** Switched from `mockApi` to `apiService` for admin workflows.
- **`fetchPendingAttestations`:** Now fetches pending attestations using `apiService.admin.getPendingAttestations()`.
- **`approveAttestation` & `rejectAttestation`:** Integrated `apiService.admin.approveAttestation()` and `rejectAttestation()`.
- **`fetchPendingMilestoneApprovals`:** Pointed to `apiService.admin.getPendingMilestones()` to get actual pending milestones.
- **`approveMilestone` & `rejectMilestone`:** Updated to use the real API calls `apiService.admin.approveMilestone()` and `rejectMilestone()`.

### 3. Updated `donationStore.ts`
- **Replaced mock functions with `apiClient`:** Removed mock interactions and swapped them with real endpoints from `apiService.donations` and `apiService.campaigns`.
- **`loadCampaigns`:** Now calls `apiService.campaigns.getAll()`.
- **`fetchDonations`:** Fetches real donation history using `apiService.donations.getByUser(userId)`.
- **`createDonation`:** Integrated `apiService.donations.create()` to hit the backend donation creation route.
- **`requestAttestation` & `getAttestationStatus`:** Updated to use `apiService.donations.requestAttestation()` and `getAttestation()`.
- **`approveMilestone` & `uploadMilestoneProof`:** Wired up real backend calls for milestone/cohort verification.


### Errors encountered and fixes applied

### `src/pages/NGODashboard.tsx` & `src/pages/AdminPanel.tsx`
- **Changes:** Split `useEffect` dependencies to prevent infinite loop.
- **Reason:** `ngoCampaigns` and `adminCampaigns` were being recreated on every render and included in the `useEffect` dependency array along with `loadCampaigns()`. This caused an infinite render/fetch loop that crashed the NGO and Admin dashboards and spammed the backend with `GET /api/campaigns` requests (429 Too Many Requests).

### `src/utils/apiClient.ts`
- **Changes:** Updated `campaigns.getAll` endpoint to `/public/campaigns` and added data mapping. Fixed a critical syntax error in `admin.getPendingAttestations` and `admin.getPendingMilestones` (`() =>[]>` changed to `() => get<any[]>`).
- **Reason:** The backend API exposes campaigns at `/api/public/campaigns`, and it returns a wrapped `{ data: [...] }` object rather than a raw array. The syntax error in the admin endpoints was causing Vite to crash the application, resulting in blank screens on the Admin and NGO dashboards.

### `src/pages/Signup.tsx` & `src/pages/Login.tsx` & `src/pages/DonorDashboard.tsx`
- **Changes:** Refactored authentication and data loading to use `apiClient.ts` instead of `mockApi.ts` or `authService.ts`.
- **Reason:** Finalizing Phase 1 & 2 integration to ensure all authentication and donor data fetches hit the real backend endpoints. Removes technical debt of mock timeouts.

### `src/components/NavBar.tsx` & `src/components/AuthDialog.tsx`
- **Changes:** Switched `logoutUser` and `loginWithEmail` to use `apiService.auth.logout` and `apiService.auth.login`.
- **Reason:** Ensure all global navigation and auth dialogs are hitting the real backend rather than simulated mocks.

### `src/pages/NGODashboard.tsx` & `src/pages/AdminPanel.tsx`
- **Changes:** Replaced `mockApi` imports with `apiClient` for milestone approvals. Removed the `handleDemoCycle` and hidden UI button that previously mocked milestone status cycling.
- **Reason:** Completes the migration away from `mockApi`. The application no longer relies on mock states to progress milestone statuses.

### `src/components/DonateDialog.tsx`
- **Changes:** Removed SOL tab and wallet connection checks. Forced payment method to `upi` and passed an empty string for `walletAddress` to the store.
- **Reason:** Implement Phase 2 of the UI revamp plan, pivoting to a fiat-only model without crypto jargon.

### `src/store/uiStore.ts`
- **Changes:** Removed the `wallet` slice (WalletState, connectWallet, simulateBalanceChange, etc.) entirely.
- **Reason:** The fiat-only pivot makes wallet connection state irrelevant. Users simply login/register.

### `src/services/mockWallet.ts` & `src/components/WalletButton.tsx`
- **Changes:** Deleted these files.
- **Reason:** No longer used or needed since we removed SOL payment capabilities.

### `src/services/mockPayments.ts`
- **Changes:** Removed `initiateSolPayment` and all Solana mock transaction logic.
- **Reason:** Continuing cleanup of crypto dependencies to enforce fiat-only UX.

### `src/pages/Profile.tsx`
- **Changes:** Removed the wallet card, wallet disconnect button, and `mockAuth` dependency.
- **Reason:** Users no longer have wallets associated with their profile in the fiat-only flow. Profile now purely reflects standard user settings.

### `src/components/*Dialog.tsx`
- **Changes:** Replaced `mockApi` imports with `apiClient` in `AttestationVerificationDialog`, `AttestationSignDialog`, `ProofUploadDialog`, `MilestoneApprovalDialog`, and `AttestationRequestDialog`.
- **Reason:** Ensuring that all interactive modal dialogs are wired to real API endpoints rather than simulated endpoints.
