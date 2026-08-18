# Changelog

All notable changes to **TraceIt** will be documented here.

Format: [Semantic Versioning](https://semver.org/) — `Added | Changed | Fixed | Removed`

---

## [0.3.0] — 2026-08-18
### Added
- Blockchain integration for recording donations on-chain after successful Razorpay payments
- Blockchain status update integration for disbursement approvals (updating donation status to ALLOCATED on-chain)
- Blockchain retry processor for failed on-chain recording attempts with exponential backoff
- Environment variable validation for required blockchain configuration (SOLANA_RPC_URL, SOLANA_WALLET_KEYPAIR_PATH, SOLANA_PROGRAM_ID)
- Database model for blockchain retry queue (BlockchainRetryQueue)
- Automatic startup of blockchain retry processor in non-test environments

### Changed
- Updated admin disbursement approval to trigger blockchain status updates (non-blocking)
- Updated Razorpay webhook handler to record donations on-chain after successful payment
- Updated backend initialization to start blockchain retry processor
- Modified donation schema to include solanaTxHash field for storing on-chain transaction references

### Fixed
- TypeScript errors related to nullable campaignId fields (converted to empty string for on-chain storage)
- TypeScript errors related to Decimal to number conversion for amounts
- Fixed error handling for unknown error types in blockchain service calls
- Resolved scoping issue in admin routes where blockchain function was called outside its definition block

---

## [0.2.0] — 2026-08-15

### Added
- Security documentation (SECURITY.md) and split into docs/compliance.md, docs/threats.md, docs/remediations.md
- ESLint security plugin (eslint-plugin-security) for enhanced security linting
- Input validation in StatusBadge component to prevent potential injection risks
- Fixed React hooks warnings in DonorDashboard and NGODashboard to prevent cascading renders
- Fixed TypeScript enum issue in use-toast hook
- Removed unnecessary exports of variant constants from badge and button components to satisfy react-refresh

### Changed
- Updated ESLint configuration to include security plugin
- Updated use-toast hook to use traditional object instead of enum for compatibility
- Updated DonorDashboard to use useCallback for loadDonations and proper effect dependencies
- Updated NGODashboard to combine useEffects for campaign selection

### Fixed
- ESLint warnings and errors (security, react-hooks, react-refresh, no-unused-vars)
- TypeScript build errors in use-toast hook
- React hook violation warnings in multiple components

### Removed
- (Nothing removed in this change)

---


## [0.1.0] — 2026-04-27

### Added
- **Project scaffold** — React 18 + TypeScript + Vite (react-ts template)
- **Dependencies** — Zustand, react-router-dom, lucide-react, Tailwind CSS v3, shadcn/ui
- **shadcn/ui components** — Card, Button, Badge, Progress, Dialog, Table, Tabs, Toast
- **Design system** — Dark-mode-first CSS with TraceIt brand palette (teal/purple/amber), glass-morphism utility, gradient text, custom scrollbar, tailwindcss-animate
- **`src/types/index.ts`** — Shared TypeScript types: `Campaign`, `Milestone`, `Donation`, `WalletState`, payment results, `ProofUpload`, `DonationStatus`
- **`src/lib/utils.ts`** — `cn()`, `formatUSD()`, `shortenHash()`, `delay()`, `mockTxHash()`, `explorerUrl()`, `STATUS_COLORS`
- **`src/services/mockWallet.ts`** — Simulated Phantom wallet connect/disconnect (fake pubkey `Trc7...Demo`, 4.2069 SOL)
- **`src/services/mockPayments.ts`** — UPI (Razorpay simulation) and SOL (Phantom simulation) payment flows with 800–1000ms latency
- **`src/services/mockApi.ts`** — 3 seed campaigns (Flood Relief, Girls' Education, Clean Water), 7 milestones, donation CRUD, proof upload, admin approval, demo status-cycle helper
- **`src/store/donationStore.ts`** — Zustand: campaigns list, loadCampaigns(), donations array, optimistic updateMilestoneStatus()
- **`src/store/uiStore.ts`** — Zustand: wallet state, loading flags, activeCampaignId
- **`src/components/WalletButton.tsx`** — Connect/Disconnect toggle with loading spinner and pubkey display
- **`src/components/StatusBadge.tsx`** — Colour-coded badge for `pending | allocated | disbursed | delivered`
- **`src/components/DonationCard.tsx`** — Campaign card with progress bar, category badge, Donate/Track buttons
- **`src/components/MilestoneTimeline.tsx`** — Vertical numbered timeline with Solana Explorer links
- **`src/components/DonateDialog.tsx`** — Donation modal: preset/custom amount, UPI/SOL tabs, success screen with explorer link
- **`src/components/ProofUploadDialog.tsx`** — NGO proof upload dialog with mock IPFS CID generation
- **`src/components/AuthDialog.tsx`** — Modal for email/password user authentication
- **`src/pages/Home.tsx`** — Hero, feature cards, responsive campaign grid with skeleton loading
- **`src/pages/DonorDashboard.tsx`** — Donations table, campaign selector, MilestoneTimeline panel, URL-param pre-selection
- **`src/pages/NGODashboard.tsx`** — Campaign tabs, stats grid, active milestone action card, hidden demo cycle button (`#demo-cycle-btn`)
- **`src/App.tsx`** — Sticky glass navbar (Home / Donor / NGO), WalletButton, react-router Routes, global Toaster

### Changed
- **Currency** — App-wide currency formatting updated to use Indian Rupees (INR/₹) instead of USD.
- **Authentication** — Wallet connection is no longer mandatory for generic donations. Users authenticate via Email/Password credentials; wallets are strictly optional for Solana-based transfers.

### Architecture Notes
- All async mock functions use `await delay(600–1000ms)` to simulate real API latency
- Zero PII — only deterministic IDs, hashes, and status flags
- Every service file has `// TODO:` markers for real integration points (Solana web3.js, Razorpay, IPFS)
- Status flow: `pending → allocated → disbursed → delivered`
- Solana Explorer links: `https://explorer.solana.com/tx/<hash>?cluster=devnet`
