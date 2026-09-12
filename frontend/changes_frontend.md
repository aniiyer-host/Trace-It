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

---
## Stage 1: Home.tsx Redesign (Living Trust)

### `tailwind.config.js` & `src/index.css`
- **Changes:** Added new "Living Trust" color tokens (`trust-bg`, `trust-navy`, `trust-green`, etc.) without removing the global `.glass` class or old gradients yet.
- **Reason:** Deferring global cleanup of old classes until all stages are complete, as requested, to avoid breaking other dashboards.

### `src/hooks/useCountUp.ts`
- **Changes:** Created a new custom hook for count-up animations.
- **Reason:** Required for the impact stats section to implement the requested motion without relying on external motion libraries like framer-motion.

### `src/components/DonationCard.tsx`
- **Changes:** Added an optional `glass` boolean prop (default `true`) to allow disabling the `.glass` class and using flat solid tokens instead.
- **Reason:** To allow `Home.tsx` to use the cards without glassmorphism, while preserving backwards compatibility for dashboards.

### `src/pages/Home.tsx`
- **Changes:** Completely rewrote the page layout to follow the "Living Trust" direction. Replaced generic glass cards with stark typography and full-width structural blocks (`w-screen relative left-1/2 -ml-[50vw]` strategy used to break out of the App.tsx container). Added a linear "Chain of Trust" journey section to replace generic feature pills.
- **Reason:** To execute Stage 1 of the visual UI overhaul, shifting from a Web3 SaaS feel to an editorial, philanthropic institution aesthetic.

### `src/pages/Home.tsx` (Post-Stage-1 Upgrades)
- **Changes:** 
  1. **Mock Data Audit:** Derived `totalRaised` and `milestonesCompleted` directly from the `campaigns` array state. Replaced the fake `totalDonors` metric with an honest `—` fallback, as there is currently no backend API for this.
  2. **Quote Card Layout:** Tightened the hero quote card, fixed the stray line, and added a warm accent border-top for a cohesive editorial look.
  3. **Light Mode Structure:** Forced `bg-trust-navy text-trust-bg` specifically on the Hero and CTA blocks so they remain deep blue structural pillars even in light mode. Wrapped the middle content in `bg-trust-bg` (warm off-white).
  4. **Chain of Trust:** Replaced the generic vertical timeline with a responsive horizontal stepper (zig-zag on desktop, connected vertical line on mobile).
  5. **Warm Accent:** Integrated `trust-accent` into buttons, filter hover states, and a semantic underline.
  6. **Motion Upgrade:** Implemented `framer-motion` for spring reveals, staggered list population, subtle scaling, and parallax depth.
- **Reason:** To address the 7 QA feedback points provided by the user before moving to Stage 2.

### `src/components/DonationCard.tsx` (Post-Stage-1 Fix)
- **Changes:** Appended `hover:text-primary-foreground` and `hover:text-accent-foreground` alongside the background hover modifiers for the internal card buttons.
- **Reason:** Ensuring that the text color flips synchronously with the background color for full accessible contrast on interactive elements.

### Full UI Revamp (Impeccable & Advanced Design Skills)
- **Changes:**
  1. **Audit & Shape (impeccable):** Replaced the centered layout bias with a bold, asymmetric split-screen Hero. Designed a "Bento" right-hand composition of floating UI mockups.
  2. **Elevate Aesthetics (design-taste-frontend & redesign-existing-projects):** Shifted from pure black/white to premium Slate/Off-white (`slate-900`, `#fafafa`). Applied `text-balance` and `tracking-tighter` to massive headlines. Removed 4-card grids in favor of multi-column asymmetric layouts.
  3. **Component Restructure (baseline-ui):** Rebuilt `DonationCard` with `.tabular-nums` for currencies, `min-h-[100dvh]` for full-screen sections, and massive `2.5rem` border radii with diffusion shadows (`shadow-[0_20px_40px_-15px...]`).
  4. **Polish & Animate (fixing-motion-performance):** Replaced generic CSS transitions with Framer Motion spring physics. Ensured layout thrashing is avoided by animating strictly compositor props (`transform`, `opacity`).
- **Reason:** To execute the requested synthesis of 4 advanced design skills (baseline-ui, design-taste, fixing-motion, redesign-existing) to elevate the frontend from functional to visually exceptional.

### GSAP Scroll-Jacking & Scrollytelling Implementation
- **Changes:**
  1. **Layout Tweaks:** Removed the global footer from `App.tsx` and removed the interactive mockups from `Home.tsx` per user request.
  2. **Global Scrollbar:** Forced `overflow-y: scroll` and hid the webkit scrollbar in `index.css` to fix the layout vibration glitch during theme switches.
  3. **GSAP ScrollTrigger:** Rewrote the entire Hero and "Chain of Trust" sections in `Home.tsx` to use a pinned horizontal scroll-jack. Scrolling down translates the screen horizontally, then pauses to vertically scrub through the Chain of Trust items using Z-axis depth scaling and opacity fades.
- **Reason:** Requested by user to achieve a cinematic, Apple-style scroll experience.

### Stage 2: Navigation & Campaigns Page
- **Changes:**
  1. **`App.tsx`:** Surgically added `<Route path="/campaigns" element={<Campaigns />} />`.
  2. **`NavBar.tsx`:** Renamed 'Campaigns' label to 'Home', added 'Explore' link pointing to `/campaigns` without auth guards.
  3. **`Campaigns.tsx`:** Created new discovery page. Implemented local UI state for filtering, pure typography empty states, and Framer Motion staggered grid (`staggerChildren: 0.07`, capped at 12 items logic). Used strict compositor-only animations (`y: 20` to `0`, `opacity: 0` to `1`). Included horizontal scroll for mobile filters.
- **Reason:** To complete the first part of the Stage 2 brief, migrating the campaign marketplace to a dedicated route with premium, auth-free discovery UX.

### Stage 2: Auth Pages (`Login.tsx` & `Signup.tsx`)
- **Changes:**
  1. **Layout Overhaul:** Replaced card-based layouts with a bold, asymmetric split-screen design. Left panel uses edge-to-edge Navy background with massive "Trust Anchor" typography. Right panel uses a Brutalist, unboxed form on Warm Off-White.
  2. **Motion:** Framer Motion staggered entrances for form inputs and a highly polished sub-1.5s success state.
  3. **Routing/Logic:** Removed the "Welcome" middle-man screens. Users immediately see forms. 
  4. **Signup KYC Flow:** Preserved exact API validation sequence. The PAN field now visually fades in *after* the user submits basic details, without navigating to a separate wizard screen, and relies entirely on the exact original `apiService.auth.register` shape.
  5. **RBAC Redirect Pending:** `useAuthStore` does not yet return `user.role` from the backend. Left a clearly flagged `TODO` in both files for the post-login redirect, currently defaulting to `/donor`. 
- **Reason:** To align the authentication gates with the "Living Trust" aesthetic and prepare for RBAC backend integration.

### Stage 2: Bug Fixes (Blank Screen & Compile Errors)
- **Changes:**
  1. **Missing Route:** Added `<Route path="/signup" element={<Signup />} />` to `App.tsx`.
     - *Reason/Fix:* When we removed the middle-man dialogs, the direct `/signup` route wasn't in `App.tsx`, causing `react-router-dom` to render a completely blank page.
  2. **TypeScript Imports (TS1484):** Fixed `Variants` imports in `Login.tsx` and `Signup.tsx` to use `import type { Variants }` instead of mixing it with standard imports.
     - *Reason/Fix:* Vite's strict `verbatimModuleSyntax` was failing the build and crashing HMR.
  3. **Vite Native Environment Crash:** Replaced `process.env.NODE_ENV === 'development'` with `import.meta.env.DEV` inside `apiClient.ts` error interceptors.
     - *Reason/Fix:* `process` is not available natively in the Vite browser environment. If an API request failed, the error interceptor threw a fatal `ReferenceError: process is not defined`, completely crashing the JS execution thread.
  4. **Data Shape Crash (`campaigns.slice` undefined):** Updated `apiClient.campaigns.getAll()` to safely return `Array.isArray(res) ? res : (res?.data || [])`. Also wrapped campaigns mapping in `Home.tsx` with `(campaigns || []).slice(0, 3)`.
     - *Reason/Fix:* `apiClient` was hardcoded to expect `{ data: [...] }`. When the local backend returned `[...]` directly, it resulted in extracting `.data` from an array, setting `undefined` to `campaigns` in the Zustand store. `Home.tsx` then blindly called `campaigns.slice(0, 3)`, which threw `TypeError: Cannot read properties of undefined` and fatally unmounted the entire React tree (leaving only the NavBar visible).

### Stage 2: NGO Dashboard (`NgoDashboard.tsx`)
- **Constraints Preserved:**
  1. `useEffect` (load): Calls `loadCampaigns()` and `fetchPendingAttestations()` on mount.
  2. `useEffect` (initial selection): Selects first `ngoCampaigns` if nothing is selected (Note: adapted this slightly to default to 'inbox' instead).
  3. `NGO_CAMPAIGN_IDS`: Array is preserved exactly as is, with RBAC-pending TODO attached.
  4. `handleApprove`, `handleProofSuccess`, `handleAttestationSelect`: Signatures and API calls (`apiService.milestones.approve`, `updateMilestoneStatus`) completely untouched.

### Stage 2: Donor Dashboard (`DonorDashboard.tsx`)
- **Constraints Preserved:**
  1. `useEffect` (param/campaign sync): Updates `selectedCampaign` based on URL `?campaign=` and `campaigns` state.
  2. `useEffect` (loadCampaigns): Calls `loadCampaigns()` on mount.
  3. `loadDonations` (useCallback): `apiService.donations.getByUser(user.id)`, updates `donationsLocal` and calls `setDonations(data)`.
  4. `useEffect` (user ID watcher): Calls `loadDonations()` when `user?.id` becomes available.

## 2026-09-11: NGO Dashboard Visual Overhaul and Color Fixes

- **Global Dark Mode Background**: Updated `.dark { --background: 222 47% 11%; }` in `index.css` to use deep navy (#0f1729) instead of pure black/dark gray. Removed the `radial-gradient` background image for dark mode to preserve the rich solid navy color.
- **StatusBadge Two-Color Rule**: Refactored `StatusBadge.tsx` to strictly use only two non-neutral colors: `emerald` for verified/delivered/attested, and `primary` (blue) for processing/allocated/active. All other states (failed, cancelled, pending, disbursed) fallback to muted foreground neutrals (`bg-foreground/5`).
- **NgoDashboard Sidebar Truncation**: Removed harsh uppercase styling from campaign titles in the sidebar. Switched to Title Case with proper `truncate text-ellipsis` for long titles. Added dynamic numerical notification counters indicating pending task counts per campaign and for the global Action Inbox.
- **NgoDashboard Action Inbox Cards**: Replaced the generic table-row layout with stylized Task Tickets. Tasks now live on subtle surfaces (`bg-foreground/[0.04]` in light mode, `[0.06]` in dark mode) with a 1px border. Added strict 2-color thick left-borders (`border-l-4`) to denote action priority: Primary Blue for 'Upload Proof', Emerald Green for 'Request Attestation', and neutral for standard states.
- **NgoDashboard Button Hierarchy**: Unified primary interaction buttons (Upload Proof, Request Attestation) to `bg-primary text-primary-foreground`. Changed the heavy financial trigger (Admin Approve & Release) to high-contrast `bg-foreground text-background` so it stands out powerfully in both light and dark modes.
- **Dark Mode Background Adjustment**: Adjusted `--background` and `--trust-bg` in `index.css` to `220 10% 6%` (near-black charcoal) based on user feedback to remove the heavy blue tint while avoiding pure black.
- **Homepage CTA Navigation**: Updated the "Start Donating" button on the homepage to route to `/donor` instead of attempting to open a local dialog.
- **NGO Dashboard Stat Animations**: Implemented `AnimatedStat` using `useCountUp` for the fundraiser stat grid, bound strictly to the `campaignId` so the stats dynamically count up every time a user switches between fundraisers.
- **NGO Dashboard Authentication**: Removed `DEV_BYPASS` and `MOCK_NGO_CAMPAIGNS`. Enforced `if (!user)` check to show an 'Access Denied' screen mimicking the Donor dashboard, requiring users to log in before viewing the NGO operational console.

### Admin Dashboard (`src/pages/AdminPanel.tsx`)
- Replaced the tabbed Card interface with a high-density `baseline-ui` data table layout.
- **Security**: Added `useAuthStore` with an `if (!user)` access denied state (identical to Donor/Ngo dashboards) and an RBAC TODO flag.
- **Zone 1 (Action Queue)**: Unified pending milestones and attestations into a single table. Enforced right-aligned `tabular-nums` and minimalist text status indicators.
- **Zone 2 (Campaigns)**: Created a flattened global campaign table for read-only tracking.
- **Zone 3 (Stats Bar)**: Added top-level raw stats for global pending actions, raised amounts, and targets.
- **Reject Flow**: Implemented an inline, auto-focusing `<Input>` that replaces the action buttons when "Reject" is clicked in a row context, keeping the user strictly inside the table layout.
- **State Safety**: Ensured `loadingId` properly disables *all* row actions across the queue while any single approval/rejection is in flight.

### Profile Settings (`src/pages/Profile.tsx`)
- Completely removed `glass` classes, gradient text, and nested cards.
- Restructured as a strict single-column settings page with heavy typography and minimalist `bg-foreground/[0.02]` bounding boxes for editable regions.
- Maintained all existing data connections (`useUIStore` for `user`, `setUser`, and `apiService.auth.logout()`).
- Form inputs now fully match the high-contrast aesthetic established on the authentication pages.


## GROUP 1
- `apiService.milestones.uploadProof`: Changed endpoint from `/api/milestones/:id/proof` to `/api/charity/disburse/:id/proof`. Request is now sent as `multipart/form-data` with `file` field.
- `apiService.ngos.getPendingAttestations`: Changed endpoint from `/api/ngos/attestations/pending` to `/api/charity/attestations/pending`.
- `apiService.ngos.signAttestation`: Changed endpoint from `/api/ngos/attestations` to `/api/charity/attestations`. `type` property in payload is explicitly uppercased.

## GROUP 2
- `apiClient.interceptors.response.use`: Added specific 409 handling for attestation endpoints (URLs containing 'attestation'), setting error message to "This attestation has already been requested."
- `apiService.donations.requestAttestation`: Changed endpoint from `POST /donations/:id/attestation` to `POST /donor/donations/:id/attestation`. Payload remains `{ type }` (lowercase).
- `apiService.donations.getAttestation`: Changed endpoint from `GET /donations/:id/attestation` to `GET /donor/donations/:id/attestation`.
- `apiService.attestations.approve`: Changed endpoint from `POST /attestations/:id/approve` to `POST /admin/attestations/:id/approve`.
- `apiService.attestations.reject`: Changed endpoint from `POST /attestations/:id/reject` to `POST /admin/attestations/:id/reject`.
- `apiService.admin` endpoints for attestations were reviewed and found to already match the required `/admin/attestations/` paths.

## GROUP 3
- `apiService.milestones.approve`: Changed endpoint from `POST /milestones/:id/approve` to `POST /admin/milestones/:id/approve`.
- `apiService.milestones.reject`: Changed endpoint from `POST /milestones/:id/reject` to `POST /admin/milestones/:id/reject`.
- `apiService.admin` endpoints for milestones were reviewed and found to already match the required `/admin/milestones/` paths. (Function names and parameters remained as "milestone" to respect frontend naming).

## GROUP 4
- `apiService.donations.getByUser`: Changed endpoint from `GET /donations/user/:userId` to `GET /donor/dashboard`. Added logic to extract and return `.donations` from the response to match the frontend's expected array format.
- `apiService.donations.create`: Changed endpoint from `POST /donations` to `POST /donor/donate`.

## SECTION A — Architecture Notes
- **Single Signup Flow**: Every new user signs up through a single flow and defaults to the `DONOR` role.
- **NGO Onboarding**: NGO registration is a separate post-signup step. A `POST /api/charity/onboard` request is used to apply.
- **Admin Approval**: An admin must manually approve the NGO application via the admin panel. This flips the `ngoStatus` from `PENDING` to `ACTIVE`.
- **Known Backend Bug**: The onboard endpoint fails to set `role: CHARITY`. Without this, role-based routing will break for NGOs. 
- **Frontend Status**: The frontend `ProtectedRoute` and role-based redirect logic is already implemented. It will automatically start working once the backend bug is fixed and `user.role` is returned upon login.

## Backend Team — Action Required

### 1. LOGIN RESPONSE SHAPE (highest priority)
- **Current response:** `{ message, accessToken }`
- **Required response:** `{ token: string, user: { id, email, name, role: 'DONOR' | 'CHARITY' | 'ADMIN' } }`
- **Why:** The frontend `ProtectedRoute` and role-based redirect are fully implemented and waiting on this. The moment this change lands, RBAC will be fully active end-to-end with no further frontend changes needed.

### 2. ONBOARD ENDPOINT BUG
- **The Bug:** The `POST /api/charity/onboard` endpoint correctly sets `organisationName`, `registrationNo`, and `ngoStatus: PENDING` — but it does not set `role: CHARITY` on the user record.
- **Fix needed:** Add `role: UserRole.CHARITY` to the same Prisma update call inside the onboard handler.
- **Impact:** Without this, admin approval (which filters on `role === CHARITY`) does not work, and NGO users cannot be routed to the NGO dashboard after login.

### 3. SIGNUP RESPONSE INCONSISTENCY
- **Login returns:** `{ message, accessToken }` (no user object, and token is named `accessToken`)
- **Signup returns:** `{ message, user: { ... } }` (has user, but no token field)
- **Required:** Both endpoints should return the same shape: `{ token: string, user: { id, email, name, role } }`
- **Why:** The frontend auth store and interceptor are wired to expect one consistent shape from both endpoints.


## NGO ONBOARDING UI IMPLEMENTATION
- `frontend/src/utils/apiClient.ts`: Added `apiService.charity.onboard` mapped to `POST /charity/onboard`.
- `frontend/src/pages/Profile.tsx`: Added Zod schema (`NgoOnboardSchema`) and an "Institution Registration" section below the personal information section. Includes a brutalist form for `organisationName`, `registrationNo`, `description`, `fcraNumber`, `taxExemptionNo80g`. The form safely handles undefined roles and conditionally renders only for DONOR or undefined roles, displaying a success message if the role is CHARITY.
- `frontend/src/pages/DonorDashboard.tsx`: Added a subtle banner beneath the portfolio statistics prompting users ("Are you an NGO? Apply for institution status") to navigate to `/profile`. Conditionally visible only for DONOR or undefined roles.


## FIX REACT 19 TYPESCRIPT ERROR
- **File path**: `frontend/src/pages/Home.tsx`
- **What changed**: Modified the `ref` assignment inside the `CHAIN_STEPS.map` loop from `ref={el => journeyItemsRef.current[i] = el}` to `ref={el => { journeyItemsRef.current[i] = el }}`.
- **Why it changed**: React 19 typings strictly require `ref` callbacks to return either `void` or a cleanup function. Implicitly returning the element (`HTMLDivElement | null`) via a concise arrow function causes a TypeScript compilation error, failing the build and rendering a blank screen.

## FIX TYPESCRIPT ERRORS IN DONORDASHBOARD.TSX
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**:
  1. Removed `campaignsLoading` from `useDonationStore` destructuring (line 49).
  2. Added `isAttestation: false` to all non-attestation steps in the `buildJourney` array (lines 358-362).
- **Why it changed**:
  1. `campaignsLoading` was declared but its value was never read, causing a `TS6133` error due to strict `noUnusedLocals` in `tsconfig.app.json`.
  2. Because the array was cast with `as const`, TypeScript created a literal tuple where only the 4th element had the `isAttestation` property. Accessing `step.isAttestation` on the union type of elements threw a `TS2339` error since the property didn't exist on the other steps. Adding it explicitly to all objects normalizes the type shape.

## FIX ZODERROR TYPES IN PROFILE.TSX
- **File path**: `frontend/src/pages/Profile.tsx`
- **What changed**: Changed `result.error.errors[0].message` to `result.error.issues[0].message` in both `handleNgoOnboard` and `handleUpdateProfile`.
- **Why it changed**: The TypeScript definitions for `ZodError` in the installed version of `zod` do not include an `.errors` property (though it might exist at runtime as an alias). Accessing `.issues` is the strictly-typed approach to read validation errors.

## FIX TYPESCRIPT ERRORS IN STORES
- **File path**: `frontend/src/store/adminStore.ts`, `donationStore.ts`, `ngoStore.ts`, `uiStore.ts`
- **What changed**:
  1. `adminStore.ts`: Cast `'delivered'` to `const` so it matches `DonationStatus`.
  2. `donationStore.ts`: Cast API responses to `any` or `Donation` instead of implicit `unknown`. Throw "Not implemented" in `cycleMilestoneStatus` (which referenced a deleted mock function).
  3. `ngoStore.ts`: Removed unused `Milestone` import. Fixed state reference to `get().pendingAttestations` inside `signAttestation`. Renamed `ngoName` to `_ngoName` since it was unused. Replaced `cycleMilestoneStatus` with an explicit throw.
  4. `uiStore.ts`: Removed unused `shortenHash` import. Removed invalid `avatarUrl` property from the `User` mock object literal.
- **Why it changed**: These were all causing hard TypeScript compilation failures during a full `tsc` pass because of strict unused locals, implicit `unknown` responses from Axios wrapper functions, and strict literal typing enforcement.

## FIX RUNTIME CRASH IN HOME.TSX
- **File path**: `frontend/src/pages/Home.tsx`
- **What changed**: Added `(c.milestones || [])` fallback before calling `.filter()` and `(c.raisedAmount || 0)` when calculating `impactMetrics`.
- **Why it changed**: The backend was returning some campaigns without a `milestones` array (likely unpopulated in the DB), causing a `TypeError: Cannot read properties of undefined (reading 'filter')` that crashed the entire Home component. Adding the fallback array allows it to render safely.

## FIX BUG 3 (REDO): ADD WITHCREDENTIALS TO AXIOS
- **File path**: `frontend/src/utils/apiClient.ts`
- **What changed**: Added `withCredentials: true` to the `axios.create` configuration object.
- **Why it changed**: This ensures cookies (like refresh tokens) are included in cross-origin requests to the backend. The backend CORS configuration has now been updated to support `credentials: true` and a specific origin.

## FIX BUG 1 + 2: RESOLVE DUAL STORE MISMATCH
- **File path**: `frontend/src/components/NavBar.tsx`, `frontend/src/components/AuthDialog.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/DonateDialog.tsx`
- **What changed**: Replaced `useUIStore` with `useAuthStore` across all components that manage authentication state or require the current `user` object.
- **Why it changed**: There was an architectural flaw where `Login.tsx` and the Dashboard pages used `useAuthStore` to set/read the user, but the `NavBar` and modal `AuthDialog` read/set from `useUIStore`. This caused a split state where logging in via `/login` left the navbar showing "Sign In", and logging in via the modal gave the dashboard "Access Denied". Unifying them all on `useAuthStore` fixes the desync.

## FIX BUG A: TOKEN NOT SENT IN AXIOS INTERCEPTOR
- **File path**: `frontend/src/utils/apiClient.ts`
- **What changed**: Updated the request interceptor to pull the `token` from the root of `useAuthStore.getState()` instead of `user.token`.
- **Why it changed**: The token lives at the root level of `useAuthStore`, not nested inside the `user` object. The previous code was always finding `user.token` as undefined, thus omitting the `Authorization` header and causing 401 errors.

## FIX BUG B: CAMPAIGN ROW CRASH IN ADMIN PANEL
- **File path**: `frontend/src/pages/AdminPanel.tsx`
- **What changed**: 
  1. Line 95: Changed `{campaign.milestones.length}` to `{(campaign.milestones || []).length}`
  2. Line 124: Changed `c.milestones.some(...)` to `(c.milestones || []).some(...)`
- **Why it changed**: If the backend API returns campaigns without a populated `milestones` array, `campaign.milestones` is evaluated as `undefined`. Any array operation (`.length`, `.some`) on it will crash the component with a `TypeError`. These fallbacks defensively guard against missing data.

## FIX CRITICAL AUTH BUG: PERSIST SESSION ON REFRESH
- **File path**: `frontend/src/store/authStore.ts`
- **What changed**: Wrapped the `useAuthStore` with Zustand's `persist` middleware (from `zustand/middleware`).
- **Why it changed**: The application had no backend `/me` endpoint to restore the `user` object from a valid session cookie, meaning page refreshes completely cleared the strictly in-memory Zustand store. By persisting `user`, `token`, and `isAuthenticated` to `localStorage` (via the `partialize` configuration), the frontend can survive page refreshes instantly.

## FIX CRITICAL AUTH BUG: USE LOGIN ACTION IN COMPONENTS
- **File path**: `frontend/src/pages/Login.tsx` and `frontend/src/components/AuthDialog.tsx`
- **What changed**: 
  1. Updated the destructured import from `const { setUser } = useAuthStore()` to `const { login } = useAuthStore()`.
  2. Replaced the `setUser({ ...user, token })` call with `login(user, token)`.
- **Why it changed**: Calling `setUser` was mistakenly injecting the access token deeply into the `user` object rather than setting it at the root of the Zustand state. Because the token wasn't in the root state, the new `persist` middleware saved `{ token: null }` to localStorage, and `apiClient`'s interceptor read `null`. Calling the proper `login` action sets both `user` and `token` correctly at the root level so they are saved to localStorage and persist across refreshes.

## FIX NAVBAR: HIDE LOGIN LINK WHEN AUTHENTICATED
- **File path**: `frontend/src/components/NavBar.tsx`
- **What changed**: Added `.filter(...)` right before `.map(...)` on `NAV_LINKS` inside the `<nav>` render block.
- **Why it changed**: Previously, the static `NAV_LINKS` array was blindly mapped, showing "Login", "Donor", "NGO", and "Profile" links to all users regardless of their authentication state. The new filter hides `/login` when `user` is not null, and hides the protected routes (`/donor`, `/ngo`, `/profile`) when `user` is null.

## BACKEND CHANGES
- **File path**: `backend/src/routes/public.ts`, `backend/tests/e2e.test.ts`
- **Reason**: Added public NGO directory endpoint and e2e test for donor-facing NGO listing.

## BUILD NGO DIRECTORY PAGE
- **Files touched**:
  1. `frontend/src/utils/apiClient.ts` (added `apiService.public.getNgos`)
  2. `frontend/src/pages/NgoDirectory.tsx` (created new page with strict "Living Trust" aesthetics: flat cards, tabular numbers, green verified dots, clean empty/loading states)
  3. `frontend/src/App.tsx` (added `<Route path="/ngos" element={<NgoDirectory />} />`)
  4. `frontend/src/components/NavBar.tsx` (updated `NAV_LINKS` mapping to route `CHARITY` / `ADMIN` users to `/ngo`, and `DONOR` / unauthenticated users to `/ngos`)
- **Nav Routing logic**: Verified that the "NGO" label navigates dynamically to either the operational dashboard or the public directory depending on `user.role`.
- **API Call Auth**: Confirmed that `get('/public/ngos')` runs without any explicit authorization headers, as it's part of the public unauthenticated namespace in Axios.

## RESTORE DONOR AND PROFILE TABS
- **File path**: `frontend/src/components/NavBar.tsx`
- **What changed**: Removed the condition that hid `/donor` and `/profile` when `!user`. 
- **Why it changed**: The user clarified that those tabs should always remain visible in the Navbar. Clicking them while logged out correctly handles the access denial on the page level rather than hiding the links outright. The `/login` tab remains the only one dynamically hidden upon authentication.

## FIX AUTH / LOGOUT AND PREVENT 401 SPAM
- **File path**: `frontend/src/utils/apiClient.ts`
- **What changed**: In the Axios response interceptor, when a 401 error is encountered, it now correctly calls `useAuthStore.getState().logout()` instead of `setUser(null)`. This ensures that an expired or invalid token is fully purged from `localStorage`.
- **File path**: `frontend/src/pages/AdminPanel.tsx`
- **File path**: `frontend/src/pages/NGODashboard.tsx`
- **What changed**: Added role-based condition checks (`if (user?.role === '...')`) inside the main `useEffect` data-fetching blocks. This prevents the dashboards from firing `/api/admin/...` or `/api/charity/...` endpoints while a non-authenticated user is routing through or visiting the pages, eliminating the console spam of 401 errors.

## FIX ISSUE 1: REMOVE DUPLICATE HEADER AND REFRESH
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: Removed the duplicate `<h2>My Donation History</h2>` header and the duplicate "Refresh" button block from within the table component.
- **Why it changed**: The parent `DonorDashboard.tsx` already renders a "Transaction History" header and handles the refresh button.

## FIX ISSUE 2: MAP NESTED CAMPAIGN DATA TO FLAT FIELDS
- **File path**: `frontend/src/utils/apiClient.ts`
- **What changed**: Updated `apiService.donations.getByUser` to map `d.project?.title` to `campaignTitle` (and mapped other nested `project`/`ngo` fields).
- **Why it changed**: The backend returns nested `project` and `ngo` objects for a donation, but `DonationHistoryTable.tsx` expects flattened fields like `campaignTitle`. This mapping ensures the table populates the campaign names correctly.

## FIX ISSUE 2: MAP NESTED CAMPAIGN DATA TO FLAT FIELDS WITH DEFENSIVE MILESTONES
- **File path**: `frontend/src/utils/apiClient.ts`
- **What changed**: Updated `apiService.donations.getByUser` to map `d.project?.title` to `campaignTitle` (and mapped other nested `project`/`ngo` fields).
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**: Updated `buildJourney` to use `const milestones = campaign.milestones || []`.
- **Why it changed**: The previous mapping attempt caused a crash because successfully resolving `campaignId` unblocked `buildJourney`, which then tried to read `.length` on `campaign.milestones`. Since the public campaigns API does not return milestones, this was `undefined`. This two-part fix safely maps the data and prevents the crash.

## FIX ISSUE 3: FIX AMOUNT FORMATTING AND BADGE STYLING
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: 
  1. Wrapped `donation.amount` in `Number()` before calling `.toLocaleString()` to fix string numbers rendering as `₹05000` instead of `₹5,000`.
  2. Replaced the old text-heavy status badge with a minimal inline indicator (a colored 2x2 dot) mapped to Success/Pending/Failed, and capitalized the status text.

## FIX ISSUE 4: REPLACE HEAVY ATTESTATION PILL WITH MINIMAL BADGE
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: 
  1. Replaced the `<AttestationVerificationBadge>` component call with an inline minimal button using the requested `w-2 h-2 rounded-full` dot pattern.
  2. Removed the unused `AttestationVerificationBadge` import at the top of the file.
  3. Green dot maps to 'Receipt Confirmed' and yellow dot maps to 'Pending NGO Confirmation'.

## FIX ISSUE 5: RESTYLE TABLE ACTION BUTTONS
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: Updated the "Verify Integrity" `<button>` and "View on Explorer" `<a>` tags. Replaced their `cn()` button classes with the requested inline minimal text link classes (`text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors bg-transparent border-none p-0 cursor-pointer`). 
- **Why it changed**: To clean up the visual hierarchy and prevent the secondary actions from looking like heavy primary UI buttons.

## FIX ISSUE 5: MOVE TABLE ACTIONS TO CORRECT COLUMN
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: Moved the "Verify Integrity" and "View on Explorer" links out of the Attestation column and into the final Actions column. Restyled the "Details" button to match the requested minimal text link style and grouped all three actions into a unified flex row (`<div className="flex items-center gap-3 justify-center">`). 
- **Why it changed**: To clean up the layout and keep all table actions correctly constrained to the final table column.

## FIX ISSUE 6: REPOSITION NGO ONBOARDING BANNER
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**: Moved the "Are you an NGO? Apply for institution status" banner block from its original position (between the portfolio stats and the Active Deployments section) to the very bottom of the page, immediately preceding the closing wrapper `</div>`.
- **Why it changed**: To stop the banner from interrupting the primary view of active deployments, serving instead as a footer call-to-action.

## FIX ISSUE 7: FIX "NGOS BACKED" CAPITALIZATION
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**: Removed the `uppercase` tailwind class from the `StatBlock` and `SmallStatBlock` components so that labels like "NGOs Backed" and "Impact Verified" render in title case rather than all-caps.

## FIX ISSUE 8: FIX PORTFOLIO TITLE NAME FALLBACK
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**: Updated the main portfolio `h1` tag to use `Portfolio for {user?.name || user?.email?.split('@')[0] || 'Donor'}`.
- **Why it changed**: To correctly use the user's name if available, fallback to the email prefix, and finally fallback to "Donor" safely using optional chaining.

## FIX ISSUE 9: FIX HOMEPAGE STATS CALCULATION
- **File path**: `frontend/src/pages/Home.tsx`
- **What changed**: 
  1. Wrapped `c.raisedAmount` in `Number()` inside the `totalRaised` reduce function so that Prisma Decimal strings map to numbers correctly rather than concatenating as string zeroes.
  2. Changed the hardcoded `totalDonors: "—"` to sum up `c.successDonationCount` from the campaigns array.
  3. Removed the `isFallback={true}` prop from the "Verified Donors" `<StatBlock>` so that it correctly fires the count-up animation for the total donors.

## FIX ISSUE 10: FIX DONATION PAYLOAD TO BACKEND
- **File path**: `frontend/src/components/DonateDialog.tsx`
- **What changed**: 
  1. Bypassed `donationStore.createDonation` to call `apiService.donations.create` directly.
  2. Removed `orderId`, `txHash`, and `walletAddr` from the payload sent to the backend.
  3. Added `ngoId` extracted from `campaign.ngoId || campaign.ngo?.id`.
  4. Formatted `paymentMethod` as uppercase (e.g., `'UPI'`) to match Prisma enum requirements.

## FIX ISSUE 11: FIX DONATION STORE SIGNATURE
- **File path**: `frontend/src/store/donationStore.ts`
- **What changed**: 
  1. Updated the `createDonation` signature (both interface and implementation) to take `(campaign, amount, paymentMethod, ngoId)`.
  2. Removed `orderId`, `txHash`, and `walletAddress` arguments.
  3. Mapped the internal API call `apiService.donations.create` to strictly match the required endpoint payload: `{ campaignId, ngoId, amount, paymentMethod: paymentMethod.toUpperCase() }`.
  4. Updated `simulateDonationFlow` to respect the new 4-argument signature.

## Backend Changes

### FIX: ADD NGO ID TO PUBLIC CAMPAIGNS ENDPOINT
- **File path**: `backend/src/routes/public.ts`
- **What changed**: 
  1. Updated the Prisma select query in `GET /public/campaigns` to include `id: true` inside the `ngo` relation.
  2. Updated the response mapping to return `ngoId: campaign.ngo?.id ?? null` alongside the existing `ngoName`.
- **Why it changed**: To provide the frontend with the `ngoId` necessary for submitting donation payloads successfully.

## FIX: ADD NGO ID TO CAMPAIGN TYPE AND DONATE PAYLOAD
- **File path**: `frontend/src/types/index.ts`
- **What changed**: Added `ngoId: string` to the `Campaign` interface.
- **File path**: `frontend/src/components/DonateDialog.tsx`
- **What changed**: Removed the temporary `(campaign as any)` typecast when constructing the `ngoId` for the donation payload, now using strictly typed `campaign.ngoId` directly.

## FIX: RESOLVE AMOUNT CONCATENATION BUG IN DASHBOARD
- **File path**: `frontend/src/pages/DonorDashboard.tsx`
- **What changed**: Wrapped `d.amount` inside `Number()` in both the `totalDonated` calculation and the ledger card `total` calculation (`campDonations.reduce`).
- **Why it changed**: Amounts from Prisma Decimal types were being serialized as strings (e.g. `"5000"`), leading to string concatenation instead of addition. This caused the UI to show `05000...` instead of a sum.


## FIX: REMOVE REDUNDANT STATUS DOT
- **File path**: `frontend/src/components/DonationHistoryTable.tsx`
- **What changed**: Removed the colored dot indicator (`●`) from the `Status` column. The status text remains intact.
- **Why it changed**: To correctly align with the design intent, leaving the colored dot exclusively in the `Attestation` column.

## FIX: ATTESTATION MODAL DETAILS
- **File path**: `frontend/src/components/AttestationDetailsModal.tsx`
- **What changed**: 
  1. Removed manual numbers from the steps arrays to fix double-numbering since `<ol>` adds its own.
  2. Moved the close `✕` button out of the header flow and into an absolute top-right position.
  3. Corrected the blockchain language in the pending description.
  4. Updated the footer text to remove Solana specific wording.

## FIX: REPLACE FABRICATED ATTESTATION ID WITH DONATION ID
- **File path**: `frontend/src/components/AttestationDetailsModal.tsx`
- **What changed**: Changed the label "Attestation ID" to "Donation ID" and removed the fake `att-` prefix.
- **Why it changed**: To provide honest tracking data by showing the actual database donation reference instead of a fabricated attestation hash.

## FIX: PREVENT SUCCESS DIALOG CRASH
- **File path**: `frontend/src/components/DonateDialog.tsx`
- **What changed**: Added a null check before calling `shortenHash(successDonation.txHash)` in the success view.
- **Why it changed**: `txHash` is handled asynchronously by the backend and returns as `undefined` in the initial creation payload. Passing `undefined` to `shortenHash` caused a fatal React crash (blank screen).
