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
