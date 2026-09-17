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
  4. **Signup KYC Flow:** Preserved exact API validation sequence. The PAN field now visually fades in _after_ the user submits basic details, without navigating to a separate wizard screen, and relies entirely on the exact original `apiService.auth.register` shape.
  5. **RBAC Redirect Pending:** `useAuthStore` does not yet return `user.role` from the backend. Left a clearly flagged `TODO` in both files for the post-login redirect, currently defaulting to `/donor`.
- **Reason:** To align the authentication gates with the "Living Trust" aesthetic and prepare for RBAC backend integration.

### Stage 2: Bug Fixes (Blank Screen & Compile Errors)

- **Changes:**
  1. **Missing Route:** Added `<Route path="/signup" element={<Signup />} />` to `App.tsx`.
     - _Reason/Fix:_ When we removed the middle-man dialogs, the direct `/signup` route wasn't in `App.tsx`, causing `react-router-dom` to render a completely blank page.
  2. **TypeScript Imports (TS1484):** Fixed `Variants` imports in `Login.tsx` and `Signup.tsx` to use `import type { Variants }` instead of mixing it with standard imports.
     - _Reason/Fix:_ Vite's strict `verbatimModuleSyntax` was failing the build and crashing HMR.
  3. **Vite Native Environment Crash:** Replaced `process.env.NODE_ENV === 'development'` with `import.meta.env.DEV` inside `apiClient.ts` error interceptors.
     - _Reason/Fix:_ `process` is not available natively in the Vite browser environment. If an API request failed, the error interceptor threw a fatal `ReferenceError: process is not defined`, completely crashing the JS execution thread.
  4. **Data Shape Crash (`campaigns.slice` undefined):** Updated `apiClient.campaigns.getAll()` to safely return `Array.isArray(res) ? res : (res?.data || [])`. Also wrapped campaigns mapping in `Home.tsx` with `(campaigns || []).slice(0, 3)`.
     - _Reason/Fix:_ `apiClient` was hardcoded to expect `{ data: [...] }`. When the local backend returned `[...]` directly, it resulted in extracting `.data` from an array, setting `undefined` to `campaigns` in the Zustand store. `Home.tsx` then blindly called `campaigns.slice(0, 3)`, which threw `TypeError: Cannot read properties of undefined` and fatally unmounted the entire React tree (leaving only the NavBar visible).

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
- **State Safety**: Ensured `loadingId` properly disables _all_ row actions across the queue while any single approval/rejection is in flight.

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

## FIX: AUTHENTICATION REDIRECT AND NAVIGATION

- **File path**: `frontend/src/components/AuthDialog.tsx`
- **What changed**: Added role-based `navigate()` redirect logic following a successful login (Admin goes to `/admin`, Charity to `/ngo`, otherwise `/donor`).
- **File path**: `frontend/src/components/NavBar.tsx`
- **What changed**: Updated the `NAV_LINKS` filter to hide the `/donor` link for logged-in NGO and Admin users.

### FIX: DISABLE RATE LIMIT IN DEV ENVIRONMENT

- **File path**: `backend/src/index.ts`
- **What changed**: Wrapped the global `app.use(limiter)` in a check for `process.env.NODE_ENV === "production"`.
- **File path**: `backend/src/routes/auth.ts`
- **What changed**: Wrapped `router.use(authLimiter)` in a check for `process.env.NODE_ENV === "production"`.
- **Why it changed**: To prevent the 100/15min global limit and 10/15min auth limit from aggressively blocking rapid local development and hot reloading.

### FIX: DONATE ENDPOINT RESPONSE SHAPE

- **File path**: `backend/src/routes/donor.ts`
- **What changed**: Removed the restrictive `select` block from `prisma.donation.create()` and updated the `res.status(201).json` response to return the full donation object (`id`, `publicId`, `amount`, `status`, `paymentMethod`, `createdAt`, `campaignId`, `ngoId`, `razorpayOrderId`).
- **Why it changed**: The frontend `DonateDialog.tsx` relies on these fields to display the success receipt. Returning a partial object caused the frontend to crash or render blank values.

## FIX ISSUE 12: ADD SUCCESS POLLING TO DONATE DIALOG

- **File path**: `frontend/src/components/DonateDialog.tsx`
- **What changed**:
  1. Imported `useEffect` from `react`.
  2. Added a polling `useEffect` that checks `apiService.donations.getByUser` every 3 seconds while `createdDonation.status !== "SUCCESS"`.
  3. Stops polling automatically if 30 seconds elapse or if `SUCCESS` is detected, replacing `createdDonation` with the updated fetched version.
- **Why it changed**: To smoothly transition the modal from "Payment Initiated" to "Success" after the backend automatically updates the donation status in the background.

### FIX 1 - DonationCard.tsx String Concatenation Fix

Wrapped Decimal string properties in `Number()` to correctly evaluate math and string formatting instead of performing string comparisons or passing strings into `toLocaleString()`.

Changes in `frontend/src/components/DonationCard.tsx`:

```tsx
@@ -17,8 +17,8 @@
-    const isFunded = campaign.raisedAmount >= campaign.targetAmount
-    const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100))
+    const isFunded = Number(campaign.raisedAmount) >= Number(campaign.targetAmount)
+    const progress = Math.min(100, Math.round((Number(campaign.raisedAmount) / Number(campaign.targetAmount)) * 100))

@@ -63,4 +63,4 @@
-                        <span className="font-bold text-foreground text-lg tabular-nums tracking-tight">₹{campaign.raisedAmount.toLocaleString()}</span>
-                        <span className="text-muted-foreground font-medium tracking-tight">of ₹{campaign.targetAmount.toLocaleString()}</span>
+                        <span className="font-bold text-foreground text-lg tabular-nums tracking-tight">₹{Number(campaign.raisedAmount).toLocaleString()}</span>
+                        <span className="text-muted-foreground font-medium tracking-tight">of ₹{Number(campaign.targetAmount).toLocaleString()}</span>
```

### FIX 2 - AdminPanel.tsx String Concatenation Fix

Wrapped Decimal string properties in `Number()` to correctly evaluate math instead of performing string concatenation in AdminPanel summary calculation.

Changes in `frontend/src/pages/AdminPanel.tsx`:

```tsx
@@ -169,2 +169,2 @@
-    const totalTarget = campaigns.reduce((sum, c) => sum + c.targetAmount, 0);
-    const totalRaised = campaigns.reduce((sum, c) => sum + c.raisedAmount, 0);
+    const totalTarget = campaigns.reduce((sum, c) => sum + Number(c.targetAmount), 0);
+    const totalRaised = campaigns.reduce((sum, c) => sum + Number(c.raisedAmount), 0);
```

### FIX 1 - StatusBadge.tsx Minimal Styling Restoration

Replaced heavy pill badge design (backgrounds, borders, Lucide icons, animations) with the standard minimal `dot + text` pattern matching the Trace-It design system.

Replaced the entire `frontend/src/components/StatusBadge.tsx` file:

```tsx
import type { DonationStatus, ExtendedStatus } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  status: DonationStatus | ExtendedStatus | string;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function StatusBadge({ status, className }: Props) {
  const normStatus = (status || "").toString().toUpperCase();

  let dotColor = "bg-gray-400";
  let label = normStatus.charAt(0) + normStatus.slice(1).toLowerCase();

  if (normStatus === "SUCCESS" || normStatus === "DELIVERED") {
    dotColor = "bg-green-500";
  } else if (normStatus === "PENDING" || normStatus === "INITIATED") {
    dotColor = "bg-yellow-500";
  } else if (normStatus === "FAILED" || normStatus === "REJECTED") {
    dotColor = "bg-red-500";
  }

  if (normStatus === "INITIATED") label = "Initiated";
  if (normStatus === "PENDING") label = "Pending";
  if (normStatus === "SUCCESS") label = "Success";
  if (normStatus === "FAILED") label = "Failed";
  if (normStatus === "DELIVERED") label = "Delivered";
  if (normStatus === "REJECTED") label = "Rejected";
  if (normStatus === "PROCESSING") label = "Processing";
  if (normStatus === "REFUNDED") label = "Refunded";
  if (normStatus === "CANCELLED") label = "Cancelled";
  if (normStatus === "VERIFIED") label = "Verified";
  if (normStatus === "ALLOCATED") label = "Allocated";
  if (normStatus === "DISBURSED") label = "Disbursed";

  return (
    <span
      className={cn("flex items-center gap-2 text-xs font-medium", className)}
    >
      <span className={cn("w-2 h-2 rounded-full inline-block", dotColor)} />
      {label}
    </span>
  );
}
```

### FIX 2 - DonationHistoryTable.tsx Layout & Naming Fixes

Removed the DEV ONLY inline simulation button to declutter the table rows (simulation remains available in DonateDialog). Also fixed the campaign name fallback string to be more informative.

Changes in `frontend/src/components/DonationHistoryTable.tsx`:

```tsx
@@ -97,3 +97,3 @@
                   <td className="font-medium text-left max-w-xs truncate py-4">
-                    {donation.campaignTitle || 'Campaign'}
+                    {donation.campaignTitle || `Campaign ${donation.campaignId?.substring(0, 8)}`}
                   </td>
@@ -103,19 +103,3 @@
                   <td className="text-center py-4">
-                    <div className="flex flex-col items-center gap-1.5">
-                      <StatusBadge status={donation.status} size="sm" />
-                      {/* DEV ONLY SIMULATION BUTTON */}
-                      {import.meta.env.DEV && isInitiated && (
-                        <button
-                          onClick={() => handleSimulatePayment(donation.id)}
-                          disabled={simulatingId === donation.id}
-                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors cursor-pointer"
-                        >
-                          {simulatingId === donation.id ? (
-                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
-                          ) : (
-                            <Zap className="h-2.5 w-2.5" />
-                          )}
-                          Simulate Payment
-                        </button>
-                      )}
-                    </div>
+                    <StatusBadge status={donation.status} size="sm" />
                   </td>
```

### FIX 3 - DonateDialog.tsx Order ID Mapping Fix

Updated the `newDonation` object construction to correctly map the `razorpayOrderId` from the backend's updated API response format.

Changes in `frontend/src/components/DonateDialog.tsx`:

```tsx
@@ -105,3 +105,3 @@
                 paymentMethod: method,
-                orderId: res.orderId || `order_${Date.now()}`,
+                orderId: res.razorpayOrderId || `order_${Date.now()}`,
                 status: 'INITIATED',
```

## Backend Changes

### FIX - Blockchain Graceful Fallback

Updated `getBlockchainService()` to return `null` instead of crashing if `SOLANA_WALLET_KEYPAIR_PATH` is missing in the environment variables (e.g. during local dev without blockchain set up).

Changes in `backend/src/services/blockchainInstance.ts`:

```typescript
@@ -5,5 +5,10 @@

-export async function getBlockchainService(): Promise<BlockchainService> {
+export async function getBlockchainService(): Promise<BlockchainService | null> {
   if (instance) return instance;

+  if (!process.env.SOLANA_WALLET_KEYPAIR_PATH) {
+    console.warn('[Blockchain] SOLANA_WALLET_KEYPAIR_PATH not configured — blockchain service disabled. This is expected in local dev.');
+    return null;
+  }
+
   const service = new BlockchainService({
```

Changes in `backend/.env.example`:

```env
# Path to Solana wallet keypair JSON file
# Required for blockchain recording
# Leave empty in local dev to disable
# blockchain features
SOLANA_WALLET_KEYPAIR_PATH=
```

**NOTE**: Currently, callers of `getBlockchainService()` (e.g., `donationService.ts`, `charity.ts`, `admin.ts`) do **NOT** handle a `null` return. They will throw a TypeError when trying to call methods on the service. These callers need to be updated to safely check for null.

### FIX - Blockchain Callers Null Checking

Added null checks to all core callers of `getBlockchainService()` to safely skip on-chain interactions when the blockchain service is disabled (returns `null`), while preserving all other core business logic (database updates, state changes, etc).

Changes in `backend/src/services/donationService.ts`:
Wrapped the `recordDonation` call in an `if (blockchainService) { ... } else { console.warn(...) }` block.

Changes in `backend/src/routes/charity.ts`:
Updated `handleBlockchainOperation` wrapper to accept the initialized `blockchainService` as an argument to its `operationFn` callback, and only execute the callback if the service is available.

Changes in `backend/src/routes/admin.ts`:
Added early returns in three on-chain update functions:

```typescript
const blockchainService = await getBlockchainService();
if (!blockchainService) {
  console.warn(
    "[Blockchain] Service not available — skipping on-chain recording",
  );
  return;
}
```

Changes in `backend/src/routes/webhooks/razorpay.ts`:
Wrapped the `recordDonation` blockchain integration inside the webhook success handler in an `if (blockchainService) { ... }` block to ensure webhooks process fully even if the blockchain layer is disabled locally.

### FIX 1 - Missing Order ID in Success Card

The polling function in `DonateDialog.tsx` was replacing the local `createdDonation` state with the object returned by `apiService.donations.getByUser`. Although the backend was correctly including `razorpayOrderId` in its selection, the frontend relies on the `orderId` property being present to display in the UI. We updated the frontend API client mapping to explicitly map `razorpayOrderId` to `orderId` (and `razorpayOrderId`).

Changes in `frontend/src/utils/apiClient.ts`:

```typescript
@@ -112,6 +112,8 @@
         campaignId: d.project?.id,
         ngoName: d.ngo?.organisationName,
         ngoId: d.ngo?.id,
+        razorpayOrderId: d.razorpayOrderId,
+        orderId: d.razorpayOrderId,
       }));
```

### FIX 2 - Attestation Column Logic

The attestation column was incorrectly reading the main donation status to determine if an attestation was confirmed. We updated the logic to check for the presence of a "SIGNED" or "APPROVED" attestation inside the nested `attestations` array. If no such record is found (or if attestations data is missing entirely), the UI correctly falls back to showing "Pending NGO Confirmation".

Changes in `frontend/src/components/DonationHistoryTable.tsx`:

```tsx
@@ -91,7 +91,9 @@
             {donations.map((donation) => {
               const normStatus = (donation.status || '').toString().toUpperCase()
-              const isConfirmed = normStatus === 'SUCCESS' || normStatus === 'DELIVERED' || normStatus === 'DISBURSED' || normStatus === 'ALLOCATED'
+              const isConfirmed = donation.attestations && Array.isArray(donation.attestations)
+                ? donation.attestations.some((a: any) => a.type === 'RECEIPT' && (a.status === 'SIGNED' || a.status === 'APPROVED'))
+                : false;
```

### FIX 3 - NGO Inbox Data Mapping

The NGO dashboard's pending attestation cards were trying to read fields directly off the root object (e.g. `attestation.amount`, `attestation.donorName`, `attestation.requestedAt`) that didn't exist in the raw response from the backend. We updated the rendering logic to extract these fields from the nested `donation` object and use correct DB column names (`createdAt`).

Changes in `frontend/src/pages/NgoDashboard.tsx`:

```tsx
@@ -262,9 +262,9 @@
                                     <div key={`att-${key}`} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 border-l-emerald-500 transition-colors">
                                         <div className="space-y-1">
                                             <div className="text-sm font-semibold tracking-widest text-emerald-600 dark:text-emerald-500 uppercase">Attestation Request</div>
-                                            <div className="text-2xl font-bold tracking-tighter tabular-nums">{formatUSD(attestation.amount)}</div>
-                                            <div className="text-foreground/70">{attestation.donorName} <span className="text-foreground/30 mx-2">•</span> {attestation.campaignTitle}</div>
-                                            <div className="text-xs text-foreground/40 mt-1">Requested {new Date(attestation.requestedAt).toLocaleDateString()}</div>
+                                            <div className="text-2xl font-bold tracking-tighter tabular-nums">{formatUSD(Number(attestation.donation?.amount))}</div>
+                                            <div className="text-foreground/70">{attestation.donation?.donorId ? `Donor ${attestation.donation.donorId.substring(0,8)}` : 'Donor'} <span className="text-foreground/30 mx-2">•</span> {`Campaign ${attestation.donationId?.substring(0,8)}`}</div>
+                                            <div className="text-xs text-foreground/40 mt-1">Requested {new Date(attestation.createdAt).toLocaleDateString()}</div>
                                         </div>
```

We also updated `frontend/src/store/ngoStore.ts` to type the pending attestations correctly according to the backend shape, and fixed the dialog prop injection in `NgoDashboard.tsx`.

### FIX 1 - Add campaignId to Pending Attestations Response

In `backend/src/routes/charity.ts`, we added `campaignId: true` to the Prisma select block for nested donation objects inside `GET /api/charity/attestations/pending`.

```typescript
@@ -758,5 +758,5 @@
       include: {
         donation: {
-          select: { id: true, publicId: true, amount: true, donorId: true },
+          select: { id: true, publicId: true, amount: true, donorId: true, campaignId: true },
         },
       },
```

### FIX 2 - Add attestations to Donor Dashboard Response

In `backend/src/routes/donor.ts`, we added `attestations` to the Prisma select block for the `GET /api/donor/dashboard` endpoint, exposing the required attestation status data to the frontend donor dashboard.

```typescript
@@ -68,6 +68,14 @@
             organisationName: true,
           },
         },
+        attestations: {
+          select: {
+            id: true,
+            type: true,
+            status: true,
+            createdAt: true,
+          }
+        },
       },
       orderBy: { createdAt: "desc" },
```

### FIX 3 - Fix Attestation Status Value Mismatch

In `frontend/src/components/DonationHistoryTable.tsx`, we updated the attestation status evaluation logic to explicitly look for `NGO_SIGNED` alongside the other statuses. We also introduced dual-state checking for `hasReceiptConfirmed` and `hasDeliveryConfirmed` to show the corresponding visual states to the donor.

```tsx
@@ -75,8 +75,13 @@
             {donations.map((donation) => {
               const normStatus = (donation.status || '').toString().toUpperCase()
-              const isConfirmed = donation.attestations && Array.isArray(donation.attestations)
-                ? donation.attestations.some((a: any) => a.type === 'RECEIPT' && (a.status === 'SIGNED' || a.status === 'APPROVED'))
+
+              const hasReceiptConfirmed = donation.attestations && Array.isArray(donation.attestations)
+                ? donation.attestations.some((a: any) => a.type === 'RECEIPT' && (a.status === 'NGO_SIGNED' || a.status === 'SIGNED' || a.status === 'APPROVED'))
+                : false;
+
+              const hasDeliveryConfirmed = donation.attestations && Array.isArray(donation.attestations)
+                ? donation.attestations.some((a: any) => a.type === 'DELIVERY' && (a.status === 'NGO_SIGNED' || a.status === 'SIGNED' || a.status === 'APPROVED'))
                 : false;
...
@@ -95,10 +95,10 @@
                       <span
                         className={cn(
                           'w-2 h-2 rounded-full inline-block',
-                          isConfirmed ? 'bg-green-500' : 'bg-yellow-500'
+                          hasDeliveryConfirmed ? 'bg-green-500' : (hasReceiptConfirmed ? 'bg-blue-500' : 'bg-yellow-500')
                         )}
                       />
-                      {isConfirmed ? 'Receipt Confirmed' : 'Pending NGO Confirmation'}
+                      {hasDeliveryConfirmed ? 'Delivery Confirmed' : (hasReceiptConfirmed ? 'Receipt Confirmed' : 'Pending NGO Confirmation')}
                     </button>
```

### FIX 4 - Campaign Name Lookup in NGO Inbox

Since the backend now returns `campaignId` inside the nested donation payload (from FIX 1), we updated the `NgoDashboard.tsx` card rendering to look up the campaign title from the `ngoCampaigns` state using `campaignId`.

Changes in `frontend/src/pages/NgoDashboard.tsx`:

```tsx
@@ -262,7 +262,12 @@
                                 {/* Attestation Requests */}
-                                {Object.entries(pendingAttestations).map(([key, attestation]) => (
+                                {Object.entries(pendingAttestations).map(([key, attestation]) => {
+                                    const campaignTitle = ngoCampaigns.find(
+                                        c => c.id === (attestation.donation as any)?.campaignId
+                                    )?.title || `Campaign ${attestation.donationId?.substring(0, 8)}`;
+
+                                    return (
                                     <div key={`att-${key}`} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 border-l-emerald-500 transition-colors">
...
-                                            <div className="text-foreground/70">{attestation.donation?.donorId ? `Donor ${attestation.donation.donorId.substring(0,8)}` : 'Donor'} <span className="text-foreground/30 mx-2">•</span> {`Campaign ${attestation.donationId?.substring(0,8)}`}</div>
+                                            <div className="text-foreground/70">{attestation.donation?.donorId ? `Donor ${attestation.donation.donorId.substring(0,8)}` : 'Donor'} <span className="text-foreground/30 mx-2">•</span> {campaignTitle}</div>
```

### FIX 5 (Part A) - Auto-Create Delivery Attestation Request

In `backend/src/routes/charity.ts` (inside `signAttestation`), we added logic to automatically upsert a `DELIVERY` attestation request in `PENDING` state whenever the NGO successfully signs the initial `RECEIPT` attestation.

```typescript
@@ -819,6 +819,24 @@
       },
     });

+    if (attestation.type === 'RECEIPT') {
+      await prisma.attestation.upsert({
+        where: {
+          donationId_type: {
+            donationId: attestation.donationId,
+            type: 'DELIVERY'
+          }
+        },
+        update: {},
+        create: {
+          donationId: attestation.donationId,
+          type: 'DELIVERY',
+          status: 'PENDING',
+          requestedBy: attestation.requestedBy
+        }
+      })
+    }
```

### FIX 5 (Part B) - Distinguish Delivery vs Receipt in NGO Inbox

In `frontend/src/pages/NgoDashboard.tsx`, we updated the attestation cards to dynamically render their label, subtitle, and border color based on the attestation type, making the two stages visually distinct.

```tsx
@@ -271,7 +271,18 @@
                                         c => c.id === (attestation.donation as any)?.campaignId
                                     )?.title || `Campaign ${attestation.donationId?.substring(0, 8)}`;

-                                    return (
-                                    <div key={`att-${key}`} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 border-l-emerald-500 transition-colors">
+                                    const isDelivery = attestation.type === 'DELIVERY';
+
+                                    return (
+                                    <div key={`att-${key}`} className={cn("group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 transition-colors",
+                                        isDelivery ? "border-l-blue-500" : "border-l-emerald-500"
+                                    )}>
                                         <div className="space-y-1">
-                                            <div className="text-sm font-semibold tracking-widest text-emerald-600 dark:text-emerald-500 uppercase">Attestation Request</div>
-                                            <div className="text-2xl font-bold tracking-tighter tabular-nums">{formatUSD(Number(attestation.donation?.amount))}</div>
+                                            <div className={cn("text-sm font-semibold tracking-widest uppercase",
+                                                isDelivery ? "text-blue-600 dark:text-blue-500" : "text-emerald-600 dark:text-emerald-500"
+                                            )}>
+                                                {isDelivery ? "Delivery Attestation" : "Receipt Attestation"}
+                                            </div>
+                                            <div className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
+                                                {isDelivery ? "Confirm delivery to beneficiary" : "Confirm you received the funds"}
+                                            </div>
+                                            <div className="text-2xl font-bold tracking-tighter tabular-nums pt-1">{formatUSD(Number(attestation.donation?.amount))}</div>
```

### FIX 1 - Admin NaN Amounts

In `frontend/src/pages/AdminPanel.tsx`, the action items map was attempting to read fields that didn't exist in the API response objects (`ms.targetAmount` and `att.amount`). We updated these to correctly read the actual backend fields, wrapped in `Number()` parsing.

```typescript
@@ -147,7 +147,7 @@
                 id: key,
                 entityId: ms.id,
                 title: ms.title,
-                amount: ms.targetAmount,
+                amount: Number(ms.amountInr),
                 ngo: camp?.ngo || 'Unknown NGO',
                 campaign: camp?.title || 'Unknown Campaign'
             })
@@ -157,7 +157,7 @@
                 id: key,
                 entityId: att.donationId,
                 title: att.statement,
-                amount: att.amount,
+                amount: Number(att.donation?.amount),
                 ngo: att.ngoName,
                 campaign: att.campaignTitle
             })
```

### FIX 2 - Campaign Status String Comparison

In `frontend/src/pages/AdminPanel.tsx`, the campaign status column was incorrectly performing a string comparison (`"50.00" >= "1000.00"` evaluates to `true`) because the backend Prisma `Decimal` type is serialized as a string. We updated the logic to wrap the values in `Number()` before comparison.

```typescript
@@ -88,8 +88,8 @@
             <td className="py-4 px-4 text-muted-foreground">{campaign.ngo}</td>
             <td className="py-4 px-4">
                 <span className="flex items-center gap-2 text-sm">
-                    <span className={`h-1.5 w-1.5 rounded-full ${campaign.raisedAmount >= campaign.targetAmount ? 'bg-emerald-500' : 'bg-primary'}`} />
-                    {campaign.raisedAmount >= campaign.targetAmount ? 'Funded' : 'Active'}
+                    <span className={`h-1.5 w-1.5 rounded-full ${Number(campaign.raisedAmount) >= Number(campaign.targetAmount) ? 'bg-emerald-500' : 'bg-primary'}`} />
+                    {Number(campaign.raisedAmount) >= Number(campaign.targetAmount) ? 'Funded' : 'Active'}
                 </span>
             </td>
             <td className="py-4 px-4 text-right tabular-nums">{(campaign.milestones || []).length}</td>
```

### FIX 3 - Admin Navbar Links

In `frontend/src/components/NavBar.tsx`, we added the `/admin` link to the `NAV_LINKS` array and updated the `.filter()` logic to properly enforce Role-Based Access Control (RBAC) on navigation items.

```typescript
@@ -14,6 +14,7 @@
   { to: '/campaigns', label: 'Explore', end: false },
   { to: '/donor', label: 'Donor', end: false },
   { to: '/ngo', label: 'NGO', end: false },
+  { to: '/admin', label: 'Admin', end: false },
   { to: '/login', label: 'Login', end: true },
   { to: '/profile', label: 'Profile', end: false }
 ]
...
@@ -46,7 +46,9 @@
           <nav className="flex items-center gap-1">
             {NAV_LINKS.filter(link => {
               if (link.to === '/login') return !user
+              if (link.to === '/admin') return user?.role === 'ADMIN'
               if (link.to === '/donor') return !user || user.role === 'DONOR' || !user.role
+              if (link.to === '/ngo') return user?.role !== 'ADMIN' // Hides it for ADMIN. Non-charities will have it mapped to /ngos below.
```

### FIX 4 - Profile Button in Donor Dashboard

In `frontend/src/pages/DonorDashboard.tsx`, we updated the Profile button `onClick` handler to use `navigate('/profile')` instead of popping a placeholder alert.

```typescript
@@ -173,7 +173,7 @@
               * TODO: RBAC-pending profile redirect
               * Update this alert to a router navigation when Profile supports roles.
               */}
-            <Button variant="ghost" onClick={() => alert('Profile page coming soon')}>Profile</Button>
+            <Button variant="ghost" onClick={() => navigate('/profile')}>Profile</Button>
             <Button variant="outline" onClick={() => setUser(null)}>Sign Out</Button>
           </div>
         </div>
```

### FIX 5 - Details and Verify Integrity buttons

In `frontend/src/components/DonationHistoryTable.tsx` and `frontend/src/pages/DonorDashboard.tsx`, we updated the 'Details' and 'Verify Integrity' buttons to trigger real functionality instead of alerts.

- 'Details' now opens the `AttestationDetailsModal`, dynamically calculating the status (`delivery_confirmed`, `receipt_confirmed`, or `pending`) and passing the relevant donation details to `onViewAttestation`.
- 'Verify Integrity' now uses the `useToast` hook to display a clean notification: "Blockchain verification will be available once on-chain recording is active."
- Updated `DonorDashboard` to import `useToast` and properly pass down the extended attestation data to the modal.

### FIX 6 - Attestation Detail Card Polish

In `frontend/src/components/AttestationDetailsModal.tsx`, we enhanced the modal to display dynamic information about the donation instead of hardcoded placeholder text.

- Added props: `amount`, `campaignTitle`, `confirmedAt`, and `donationDate`.
- Updated the content strings for each status (PENDING, RECEIPT_CONFIRMED, DELIVERY_CONFIRMED) to fulfill user requirements.
- Implemented conditional rendering in the modal footer to show the donation amount, NGO/campaign title, and either the donation date (for pending) or the confirmation date (for completed states).
- In `DonationHistoryTable.tsx` and `DonorDashboard.tsx`, we updated the `attestationData` payload and function signatures to pass `donationDate: donation.createdAt` down to the modal.

---

## Backend Changes

### Schema — beneficiaryIdHash field

FILE: `backend/prisma/schema.prisma`

Added `beneficiaryIdHash String?` to the Campaign model (after `ipfsCid`).
Nullable so all existing campaigns are unaffected.
Stores HMAC-SHA512(walletId, campaignId) — the raw wallet ID is never stored.

```
+  beneficiaryIdHash  String?  // HMAC-SHA512(walletId, campaignId) — raw ID never stored
```

Migration command (run manually):
cd backend && npx prisma migrate dev --name add_beneficiary_id_hash

### Campaign Creation — beneficiaryId hashing

FILE: `backend/src/routes/charity.ts`

1. Imported `HashService` from `../services/hashService.js`.
2. Added `beneficiaryId` to body destructuring in `createCampaign`.
3. After `prisma.campaign.create()`, if `beneficiaryId` is provided, hashes it with `HashService.hmacSha512(beneficiaryId, campaign.id)` and stores the result in `campaign.beneficiaryIdHash` via a follow-up `prisma.campaign.update()`.
4. Added `TODO: Phase 4` comment above the hash block referencing `BENEFICIARY_BLOCKCHAIN_HANDOFF.md`.
5. Destructures `beneficiaryIdHash` out of the campaign object before sending the response — the hash is never returned to the client.

### Delivery Attestation — beneficiary hash comparison

FILE: `backend/src/routes/charity.ts` (`signAttestation` handler)

1. Added `beneficiaryId` extraction from `req.body` alongside `donationId`.
2. Added a DELIVERY-only verification block after the existing `attestation.status` guard and before `prisma.attestation.update()`:
   - Looks up the campaign via the `donation.campaignId` already available from the ownership-check query.
   - If the campaign has a `beneficiaryIdHash` and `beneficiaryId` was not provided → returns 422 `BENEFICIARY_ID_REQUIRED`.
   - Hashes the submitted ID with `HashService.hmacSha512(beneficiaryId, donation.campaignId)`.
   - On mismatch → writes audit log via existing `writeAuditLog` helper (`action: "BENEFICIARY_HASH_MISMATCH"`) and returns 422 `BENEFICIARY_MISMATCH`.
   - On match → falls through to the existing `prisma.attestation.update()` (NGO_SIGNED status update).
3. Added `TODO: Phase 4 - Store this verification on-chain` comment referencing `BENEFICIARY_BLOCKCHAIN_HANDOFF.md`.
4. Used `writeAuditLog` (existing helper) — NOT raw `prisma.auditLog.create` — to match codebase pattern.

---

## Frontend Changes

### Create Beneficiary Wallet Dialog

FILE: `frontend/src/components/BeneficiaryWalletDialog.tsx`

Created a new dialog component to generate a mock beneficiary wallet ID before campaign creation.

- Implements two internal screens (`form` and `result`) controlled by local state.
- **Screen 1 (Form):** Collects an internal reference and generates a deterministic mock wallet ID (e.g. `SOL` + hex).
- **Screen 2 (Result):** Displays the generated wallet ID with a one-click copy button, an amber warning box reminding the NGO to save the ID, and a submit button.
- Embedded a `TODO: Phase 4` comment for the blockchain team to replace the mock generation with real `@solana/web3.js` `Keypair.generate()` logic.
- Follows the flat UI design system (no glassmorphism).

### Campaign Creation Flow Update

FILE: `frontend/src/components/CreateCampaignDialog.tsx`

1. **State & Imports:** Added `BeneficiaryWalletDialog` import. Added state variables `step` (`'wallet-check' | 'form'`), `beneficiaryWalletId`, and `showWalletDialog`.
2. **Step 0 ('wallet-check'):** Implemented a new initial screen in the dialog replacing the form.
   - Shows two cards: "I have a Wallet ID" and "Create a Wallet".
   - "Create a Wallet" opens the new `BeneficiaryWalletDialog`.
   - On wallet creation, captures the ID and progresses to the form automatically.
3. **Form Updates ('form'):** Added a required "Beneficiary Wallet ID" field at the bottom of the campaign creation form. Pre-fills automatically if generated in Step 0, but remains editable.
4. **Submit Payload:** Appends `beneficiaryId: beneficiaryWalletId` to the `apiService.campaigns.create(draftPayload)` call.
5. **Reset:** Ensured `handleClose` cleanly resets the wizard state (`step`, `beneficiaryWalletId`, `showWalletDialog`) when closed.

### UI Polish

FILE: `frontend/src/components/CreateCampaignDialog.tsx`

Removed the `glass` class and added `bg-background` and standard borders, moving to the flat design system.

### Beneficiary Verification on Attestation

FILE: `frontend/src/utils/apiClient.ts`
FILE: `frontend/src/components/AttestationSignDialog.tsx`

1. **`apiClient.ts`:** Updated `ngos.signAttestation` to accept an optional `beneficiaryId` and spread it into the request body if present.
2. **State & Reset:** Added `beneficiaryId` and `beneficiaryError` state. Resets both on dialog open (via `useEffect`) and on switching between 'receipt' and 'delivery' tabs.
3. **UI Updates:** Added a conditional "Verify Beneficiary" block for `DELIVERY` type attestations, inserted above the action buttons. It features an input for the wallet ID and an amber error box that renders when a mismatch occurs.
4. **API Integration:** Updated `handleSignAttestation` to pass `beneficiaryId` when the type is `delivery`.
5. **Error Handling:** Added an explicit catch block for `422 BENEFICIARY_MISMATCH`, injecting the backend's error message directly into the UI (via `setBeneficiaryError`) while skipping the generic toast and keeping the dialog open.
6. **Validation:** Disabled the "Sign & Broadcast" button if the attestation type is `delivery` and the input is empty.

---

## Backend Changes

### Error — TypeScript Build Failures: `BlockchainService | null` not assignable to `BlockchainService`

**Files affected:**

- `backend/src/services/blockchainRetryProcessor.ts` (lines 95, 97)
- `backend/tests/ngo-registration-blockchain.test.ts` (lines 75, 78)
- `backend/tests/cohort-registration-blockchain.test.ts` (lines 122, 125)
- `backend/tests/disbursement-recording-blockchain.test.ts` (line 121)

**Error:**

```
TS2345: Argument of type 'BlockchainService | null' is not assignable to parameter of type 'BlockchainService'.
  Type 'null' is not assignable to type 'BlockchainService'.

TS18047: 'blockchainService' is possibly 'null'.
```

**Root cause:**
`getBlockchainService()` in `blockchainInstance.ts` has a return type of `Promise<BlockchainService | null>` — it intentionally returns `null` when `SOLANA_WALLET_KEYPAIR_PATH` is not configured (expected in local dev). All four call sites called `await getBlockchainService()` and then used the result directly — without a null guard — passing it to functions typed to accept only `BlockchainService` (non-null), or calling methods on it directly. TypeScript's strict null checks correctly flagged this as a type error at build time.

**Fix — null guard added immediately after `await getBlockchainService()` in all four files:**

```diff
// blockchainRetryProcessor.ts
  const blockchainService = await getBlockchainService();
+ if (!blockchainService) {
+   console.warn('[BlockchainRetryProcessor] Blockchain service unavailable — skipping retry batch.');
+   return;
+ }

// ngo-registration-blockchain.test.ts
  const blockchainService = await getBlockchainService();
+ if (!blockchainService) return; // skip if blockchain service not configured

// cohort-registration-blockchain.test.ts
  const blockchainService = await getBlockchainService();
+ if (!blockchainService) return; // skip if blockchain service not configured

// disbursement-recording-blockchain.test.ts
  const blockchainService = await getBlockchainService();
+ if (!blockchainService) return; // skip if blockchain service not configured
```

**Reason the fix is safe:**

- In `blockchainRetryProcessor.ts`: returning early means the retry batch is skipped when the blockchain service is unconfigured. There is nothing to retry without a working service, so this is correct behaviour.
- In the three test files: the null-check returns from a code path that is already guarded by `if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID)` — this block never executes during normal test runs. The null guard simply satisfies the TypeScript compiler for a path that is unreachable in the test environment.

**How this was triggered:**
`npx prisma generate` was run to regenerate the Prisma client after the `beneficiaryIdHash` migration. This caused `tsc` to recheck all types, exposing these pre-existing null-safety violations that had previously gone unnoticed (likely because the build had not been run after prior blockchain service additions).

### Error — 402 on Donation > ₹10,000 for Unverified Donor

FILE: `frontend/src/components/DonateDialog.tsx`

**Error:** `AxiosError: Request failed with status code 402` thrown from `POST /api/donations/donate`, showing generic "Donation failed" toast with no explanation.

**Root cause:** `kycCheckMiddleware.ts` intentionally returns `HTTP 402 { requiresKyc: true }` when a donation amount exceeds ₹10,000 and the donor's `kycStatus` is not `APPROVED` (e.g., the seeded `donor2@traceit.dev` has `kycStatus: NOT_REQUIRED`). The frontend catch block was typed as `catch (_error)` (not `any`) and made no distinction between 402 and other errors — it showed a generic "Donation failed" toast regardless.

**Fix:**

```diff
- } catch (_error) {
-     console.error(_error)
-     toast({ title: 'Donation failed', variant: 'destructive' })
+ } catch (_error: any) {
+     console.error(_error)
+     if (_error?.response?.status === 402 && _error?.response?.data?.requiresKyc) {
+         toast({
+             title: 'KYC Verification Required',
+             description: 'Donations over ₹10,000 require KYC verification. Please complete your KYC before donating this amount.',
+             variant: 'destructive',
+         })
+     } else {
+         toast({ title: 'Donation failed', variant: 'destructive' })
+     }
```

**Backend unchanged** — the 402 behaviour is intentional and correct. Only the frontend error handling was improved.

### Admin Panel: Missing Fields in Attestation Queue (Problem 1)

FILE: `backend/src/routes/admin.ts`

**Issue:** In the admin panel, the milestone and attestation queue table showed blank values for NGO name and Campaign title for attestations.
**Root Cause:** The `getPendingAttestationsAdmin` handler queried `prisma.attestation.findMany` but its `include.donation.select` block failed to include the `project` (Campaign) and `ngo` (Profile) relations. Consequently, the frontend couldn't display them.
**Fix:**

- Expanded the `select` block inside the `donation` include to pull in `campaignId`, `project: { select: { title: true } }`, and `ngo: { select: { organisationName: true } }`.
- Mapped the resulting attestations before sending the JSON response to attach `ngoName` and `campaignTitle` directly to each item, which `AdminPanel.tsx` expects.

### NGO Dashboard: Missing Campaign Statuses & Reapply (Problem 2)

FILE: `frontend/src/components/StatusBadge.tsx`
FILE: `frontend/src/pages/NGODashboard.tsx`

**Issue:** Campaigns correctly stored their status (PENDING_APPROVAL, REJECTED, ACTIVE) in the state, but this was never displayed in the NGO Dashboard UI. Furthermore, if a campaign was rejected, the NGO had no way to resubmit it.
**Fix:**

- Updated `StatusBadge.tsx` to explicitly map `ACTIVE`, `PENDING_APPROVAL`, and `REJECTED` to clean label overrides (e.g. "Awaiting Approval") and appropriate dot colors (Green, Yellow, Red).
- In `NGODashboard.tsx`, added a small `<StatusBadge>` next to the campaign title in the left sidebar list.
- In `NGODashboard.tsx`, added a prominent header block in the campaign detail view featuring the status badge.
- When status is `PENDING_APPROVAL`, a subtitle is shown: "Not yet publicly visible."
- When status is `REJECTED`, a "Reapply for Approval" button appears on the right, mapped to a new `handleReapply` function that calls `apiService.campaigns.submit(campaignId)`.
- Added a `reapplyingId` state to show a loading spinner on the button while the API request processes.

### Admin Panel: Missing Audit Logs & Search Filters (Problem 4)

FILE: `frontend/src/utils/apiClient.ts`
FILE: `frontend/src/pages/AdminPanel.tsx`

**Issue:** The backend had a fully functional `/api/admin/audit-logs` endpoint, but it wasn't connected to the frontend. The Admin Panel also lacked a way to filter or search through campaigns.
**Fix:**

- **API Client:** Added `admin.getAuditLogs` to `apiClient.ts` to accept optional pagination and filter parameters (`page`, `limit`, `action`, `userId`).
- **State & Data Fetching:** Added `auditLogs`, `auditLogsLoading`, and `campaignSearch` state to `AdminPanel.tsx`. Bound `loadAuditLogs` to the main initialization `useEffect`.
- **Campaign Filtering:** Added a derived `filteredCampaigns` array using `useMemo` that filters the `campaigns` array based on the `campaignSearch` text matching either the campaign title or the NGO name.
- **UI:** Added a search `<Input>` to the "Platform Campaigns" section header.
- **UI:** Rendered a new "Zone 4: System Audit Logs" section at the bottom of the page containing a table that displays the timestamp, action, actor, entity, and metadata for every system audit event.

### Admin Workload Reduction (Problem 3)

FILE: `backend/src/routes/charity.ts`
FILE: `backend/src/routes/admin.ts`
FILE: `frontend/src/components/DonationHistoryTable.tsx`

**Issue:** Admin was overwhelmed with approving every campaign and every receipt attestation manually.
**Fix:**

- **Campaign Creation Auto-Approve:** Modified `submitCampaign` in `charity.ts`. When an NGO hits submit, it instantly updates the status to `ACTIVE` (bypassing `PENDING_APPROVAL`).
- **First Attestation (Receipt) Auto-Approve:** Modified `signAttestation` in `charity.ts`. When an NGO signs a `RECEIPT` attestation, it instantly sets status to `APPROVED` and generates two audit logs (`ATTESTATION_NGO_SIGNED` and `ATTESTATION_APPROVED`), meaning it bypasses the admin queue but is still logged.
- **Admin Queue Filtration:** Modified `getPendingAttestationsAdmin` in `admin.ts`. The query now strictly looks for `status: NGO_SIGNED` AND `type: DELIVERY`. This ensures that even if a receipt attestation somehow got stuck, it will never show up in the Admin's queue.
- **Donor Visibility Integrity:** Modified `DonationHistoryTable.tsx` so that it only lights up the "Confirmed" state in the timeline if the backend attestation status is strictly `APPROVED`. This ensures the donor sees the instant approval of the Receipt, but realistically waits for the Admin's final approval for the Delivery.

## Beneficiary ID Retrieval Feature (Backend)

- **`backend/prisma/schema.prisma`**: Added `beneficiaryIdEncrypted String?` field to `Campaign` model to allow persistent secure storage of the beneficiary ID. (Did not modify `beneficiaryIdHash`).
- **`backend/src/services/hashService.ts`**: Added `encryptBeneficiaryId` and `decryptBeneficiaryId` static methods modeled exactly after `DocumentService.encryptBuffer`. Utilizes `aes-256-cbc` and a new `AES_BENEFICIARY_KEY` 32-byte env variable.
- **`backend/src/routes/charity.ts`**:
  - In `createCampaign`: Added logic to encrypt and store the raw `beneficiaryId` in `beneficiaryIdEncrypted` without mutating existing HMCA-SHA512 hashing or payload filtering.
  - Added `getBeneficiaryId` Express controller applying the exact ownership check pattern: `requireAuth`, `requireRole(UserRole.CHARITY)`, `findFirst({ where: { id: campaignId, ngoId: userId } })`.
  - Registered `GET /campaigns/:id/beneficiary-id` on the `charityRouter`.

## Pre-requisites Completed Before Frontend UI

- **Security Verification (Leak Prevention)**: Audited all endpoints returning Campaign objects to ensure `beneficiaryIdEncrypted` is excluded.
  - Fixed `backend/src/routes/charity.ts`: `getCampaigns` and `submitCampaign` now strip both `beneficiaryIdHash` and `beneficiaryIdEncrypted` from the response payloads.
  - Fixed `backend/src/routes/admin.ts`: `getPendingCampaigns` and `approveCampaign` now securely strip these fields before returning campaigns to the frontend.
  - Confirmed `public.ts` and `donor.ts` were already secure as they strictly use Prisma `select` queries limiting returned fields.
- **Testing**: Added `backend/tests/beneficiary-id.test.ts` mirroring the existing project test setup to guarantee robust security logic. Tests cover:
  - Encryption/decryption round-trip success in `hashService.ts`.
  - Proper payload stripping across `GET` and `POST` campaign endpoints.
  - Correct 200 decryption for the owning NGO.
  - Strict 404 rejection for non-owning NGOs.
  - Strict 403 Forbidden checks for `ADMIN` and `DONOR` roles attempting to hit the endpoint.

## Beneficiary ID Retrieval Feature (Frontend)

- **`frontend/src/utils/apiClient.ts`**: Added `apiClient.campaigns.getBeneficiaryId()` pointing to `GET /charity/campaigns/:id/beneficiary-id`.
- **`frontend/src/pages/NGODashboard.tsx`**:
  - Implemented a standalone `BeneficiaryIdReveal` subcomponent.
  - State matches the requirement: shows an `Eye` icon button that fetches on click (no pre-fetch).
  - Displays ID in a minimalist, mono-spaced field joined cleanly with a standard copy-to-clipboard button `Copy` / `Check`.
  - Follows "Living Trust" design cues (e.g. `bg-foreground/[0.03]`, `border-foreground/10`, no glassmorphism, flat borders).
  - Placed seamlessly adjacent to the `StatusBadge` in the Campaign Detail Header view.
- **Test Import Fixes**: Resolved build errors in `backend/tests/beneficiary-id.test.ts`.
  - Fixed Express `app` import from `{ app } from '../src/app'` to the established pattern `import app from '../src/index.js'`.
  - Fixed `UserRole` import path from `'../../generated/prisma/enums'` to `'../generated/prisma/enums.js'` to correctly align with relative module paths and ESM requirements.
  - Added `.js` extensions to local imports (`prisma.js`, `hashService.js`) to satisfy the ESNext/bundler setup in `tsconfig.json`.

## Test Suite Fixes (Pre-existing Mismatches)

- **`backend/tests/charity.test.ts` (Line 118)**:
  - Updated assertion to `expect(res.body.status).toBe(CampaignStatus.ACTIVE);` (previously `PENDING_APPROVAL`) due to the intentional auto-approval change.
- **`backend/tests/attestation.test.ts` (Lines 195, 203-229)**:
  - Updated receipt attestation assertion to expect `AttestationStatus.APPROVED` instead of `NGO_SIGNED`.
  - Refactored the admin queue tests. Since receipt attestations auto-approve and skip the admin queue, added a step where the NGO signs the `DELIVERY` attestation first, then updated the admin assertions to look for that `deliveryAttestationId` instead.
- **`backend/tests/simulation.test.ts` (Lines 73-74)**:
  - Updated assertions to match the new API response shape: changed `orderId` to `razorpayOrderId` and `publicDonationId` to `publicId`.
- **`backend/tests/e2e.test.ts` (Lines 165-171, 255, 487, 558)**:
  - Updated multiple assertions and variables assigning `res.body.publicDonationId` to match the correct response field `res.body.publicId`, which also fixed cascading Prisma query failures (`where: { publicId: undefined }`).
  - Updated `orderId` expectation to `razorpayOrderId`.

## Audit Log Bug Fix

- **`backend/src/routes/charity.ts` (Line 959)**:
  - Fixed a silent `P2003` Prisma foreign key error that occurred when the system auto-approved a receipt attestation. The `writeAuditLog` call was incorrectly passing `actorId: 'system'`, which violated the UUID foreign key constraint on the `Profile` table. Updated it to use `actorId: null` (with `actorType: AuditActorType.SYSTEM`) matching the established project pattern for system actions.
- **`backend/src/services/storageService.ts`**: Bypassed real AWS SDK calls in the `test` environment to prevent un-awaited background processes from logging errors after Jest teardown.
  - `uploadFile`: Returns early if `NODE_ENV === 'test'`.
  - `getSignedUrl`: Returns a dummy URL string if `NODE_ENV === 'test'`.
- **`frontend/src/components/CreateCampaignDialog.tsx`**: Fixed a bug where a failure to submit a campaign (DRAFT to ACTIVE) was silently swallowed. The UI would show a success toast even if the submission failed, leaving the campaign stuck in DRAFT. Now it properly throws the error to be caught and displayed by the UI.
- **`frontend/src/components/BeneficiaryWalletDialog.tsx`**: Removed the warning alert ("Save this Wallet ID securely... This ID cannot be recovered") from the wallet generation dialog, as NGOs can now securely view the beneficiary ID later from their dashboard.
- **`frontend/src/pages/AdminPanel.tsx`**: Fixed an issue where the NGO column remained blank in the Pending Approvals and Active Campaigns tables. Updated the cell renderer to properly display the NGO name by falling back gracefully across `ngoName`, nested `ngo.organisationName`, `ngo` string, and `ngoId`.
- **`backend routes removed /milestone and updated with /disbursements`**: Fixed mismatch naming and frontned reflects same in apiClient.ts . In Signup.tsx fixed where token was getting attached to user.token and was preventing auto login upon register

# CI Fixes Frontend Changes

## 1. DonationHistoryTable.tsx

- Removed unused `useState` and `apiService` imports.
- Removed unused `onRefresh` and `onVerifyIntegrity` props from the component.
- Kept the existing **Verify Integrity** UI behavior without unused callback dependencies.
- This resolved TypeScript/ESLint build errors caused by unused declarations.

## 2. DonorDashboard.tsx

- Updated the `attestationModalData` state type to include the optional fields actually used by the dashboard:
  - `amount`
  - `campaignTitle`
  - `confirmedAt`
  - `donationDate`

- Removed the unused `donationId` variable.
- Updated the blockchain verification handler to display an informational toast until on-chain verification is active.
- This resolved the related TypeScript build errors.

## 3. NGODashboard.tsx

- Updated the campaign status passed to `StatusBadge` to safely handle an undefined status.
- Added the fallback:
  - `c.status ?? 'UNKNOWN'`
  - `selectedCampaignObj.status ?? 'UNKNOWN'`

- This avoids passing an optional/undefined status where a string is required.
- The existing `StatusBadge` component already handles `UNKNOWN` using its default status styling.

  # Latest Backend & Frontend Changes

  ## Backend Changes

  ### 1. Campaign Submission Workflow Changed to Auto-Activate

  **FILE:** `backend/src/routes/charity.ts`
  - Updated the campaign submission workflow so that when an NGO submits a campaign, its status changes directly from `DRAFT` to `ACTIVE`.
  - Removed the requirement for Admin to manually approve a newly submitted campaign.
  - This matches the intended platform workflow where campaigns become available for donations after NGO submission.
  - Admin approval is reserved for later operational workflows such as disbursement/milestone approval rather than campaign activation.

  ### 2. Charity Test Updated for Auto-Activation

  **FILE:** `backend/tests/charity.test.ts`
  - Updated the campaign submission test to expect:
    - `CampaignStatus.ACTIVE`

  - The previous expectation of:
    - `CampaignStatus.PENDING_APPROVAL`
      was outdated after the campaign auto-activation workflow was introduced.

  - Campaign creation itself still correctly starts with `CampaignStatus.DRAFT`.

  ### 3. Attestation Test Flow Updated

  **FILE:** `backend/tests/attestation.test.ts`
  - Updated receipt attestation tests to expect `AttestationStatus.APPROVED`.
  - Receipt attestations are now automatically approved when signed by the NGO.
  - Updated Admin queue tests so that the Admin queue is tested against `DELIVERY` attestations instead of `RECEIPT` attestations.
  - This matches the new workload-reduction workflow:
    - Receipt → NGO signs → automatically approved.
    - Delivery → NGO signs → sent to Admin for approval.

  ### 4. Simulation Test Response Fields Corrected

  **FILE:** `backend/tests/simulation.test.ts`
  - Updated outdated response field references:
    - `orderId` → `razorpayOrderId`
    - `publicDonationId` → `publicId`

  - Tests now match the current API response structure.

  ### 5. E2E Test Response Fields Corrected

  **FILE:** `backend/tests/e2e.test.ts`
  - Updated outdated references from `publicDonationId` to `publicId`.
  - Updated `orderId` expectations to `razorpayOrderId`.
  - Corrected Prisma lookups that were receiving `undefined` because of the outdated response property names.
  - Updated related donation-flow assertions to match the current backend API contract.

  ### 6. Milestone Route Renamed to Disbursement Route

  **FILES:** Backend charity/admin routes and related tests
  - Replaced the old `/milestone` route naming with `/disbursements` where applicable.
  - Updated frontend API calls to use the corresponding disbursement endpoints.
  - Updated related test requests and route references to maintain consistency between backend and frontend.
  - This removes the previous terminology mismatch between the API implementation and the frontend.

  ### 7. Signup Token Assignment Fixed

  **FILE:** `frontend/src/pages/Signup.tsx`
  - Fixed the registration/login state issue where the returned authentication token was being attached to `user.token`.
  - Corrected the token handling so the newly registered user can be automatically authenticated/logged in after signup.
  - This prevents the user from being registered successfully but remaining unauthenticated in the frontend.

  ### 8. Backend Test/Teardown Cleanup
  - Updated test cleanup ordering where required so dependent database records are removed before their parent records.
  - Ensured `ImpactToken` records are deleted before `Donation` records to avoid foreign-key constraint failures.
  - This addresses the Prisma `impact_tokens_donationId_fkey` constraint encountered during Jest cleanup.

  ***

  ## Frontend Changes

  ### 9. Frontend ESLint Cleanup
  - Removed unused imports, variables, props, and declarations that were causing ESLint/TypeScript build issues.
  - Cleaned up unused state and API dependencies in:
    - `DonationHistoryTable.tsx`
    - `DonorDashboard.tsx`
    - `NGODashboard.tsx`

  - Preserved existing functionality while removing declarations that were no longer required.

  ### 10. Donation History Type Fixes

  **FILE:** `frontend/src/components/DonationHistoryTable.tsx`
  - Removed unused `useState` and `apiService` imports.
  - Removed unused `onRefresh` and `onVerifyIntegrity` props.
  - Kept the existing Verify Integrity UI behavior without unused callback dependencies.
  - This resolved frontend lint/build errors caused by unused declarations.

  ### 11. Donor Dashboard Type Fixes

  **FILE:** `frontend/src/pages/DonorDashboard.tsx`
  - Updated `attestationModalData` typing to include fields actually used by the UI:
    - `amount`
    - `campaignTitle`
    - `confirmedAt`
    - `donationDate`

  - Removed the unused `donationId` variable.
  - Updated blockchain verification handling to show an informational message while on-chain verification is not yet active.
  - Resolved related TypeScript/ESLint issues.

  ### 12. NGO Dashboard Status Type Safety

  **FILE:** `frontend/src/pages/NGODashboard.tsx`
  - Updated campaign status values passed to `StatusBadge`.
  - Added safe fallback handling:
    - `c.status ?? 'UNKNOWN'`
    - `selectedCampaignObj.status ?? 'UNKNOWN'`

  - Prevents undefined status values from violating the expected component type.
  - Existing `StatusBadge` handling continues to provide a default visual state for `UNKNOWN`.

  ### 13. Campaign Submission Error Handling

  **FILE:** `frontend/src/components/CreateCampaignDialog.tsx`
  - Fixed an error-handling issue where campaign submission could fail in the backend while the frontend still displayed a success message.
  - The submission error is now propagated correctly so the UI can display the failure.
  - Prevents campaigns from appearing successfully activated while remaining stuck in `DRAFT`.

  ### 14. Beneficiary Wallet UI Updated

  **FILE:** `frontend/src/components/BeneficiaryWalletDialog.tsx`
  - Removed the warning stating that the generated beneficiary wallet ID could not be recovered.
  - This warning became outdated after implementing secure beneficiary-ID retrieval from the NGO dashboard.
  - NGOs can now retrieve the beneficiary ID later through the authorized dashboard flow.

  ### 15. Admin NGO Name Display Fixed

  **FILE:** `frontend/src/pages/AdminPanel.tsx`
  - Fixed blank NGO names in Pending Approvals and Active Campaigns tables.
  - Added fallback handling for different API response structures:
    - `ngoName`
    - `ngo.organisationName`
    - `ngo`
    - `ngoId`

  - Ensures the NGO column displays available information instead of remaining blank.

  ***

  ## Verification

  ### Frontend Build
  - Ran:

  `npm run lint`
  - Lint completed successfully with no reported ESLint errors.

  - Ran:

  `npm run build`
  - Build completed successfully.
  - TypeScript compilation completed with **0 TypeScript errors**.
  - Only existing Vite warnings remain:
    - `__dirname` compatibility warning in `vite.config.ts`
    - Large bundle/chunk-size warning

  ### Backend Tests
  - Updated tests to match the current API contracts and workflow changes.
  - Corrected outdated response property names and campaign/attestation status expectations.
  - Corrected test cleanup ordering for database foreign-key dependencies.
  - Disbursement and Admin approval flows remain covered by tests.
  - Existing test output also confirms successful Admin and Disbursement test suites.
