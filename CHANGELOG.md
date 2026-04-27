# Changelog

All notable changes to **TraceIt** will be documented here.

Format: [Semantic Versioning](https://semver.org/) — `Added | Changed | Fixed | Removed`

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
- **`src/pages/Home.tsx`** — Hero, feature cards, responsive campaign grid with skeleton loading
- **`src/pages/DonorDashboard.tsx`** — Donations table, campaign selector, MilestoneTimeline panel, URL-param pre-selection
- **`src/pages/NGODashboard.tsx`** — Campaign tabs, stats grid, active milestone action card, hidden demo cycle button (`#demo-cycle-btn`)
- **`src/App.tsx`** — Sticky glass navbar (Home / Donor / NGO), WalletButton, react-router Routes, global Toaster

### Architecture Notes
- All async mock functions use `await delay(600–1000ms)` to simulate real API latency
- Zero PII — only deterministic IDs, hashes, and status flags
- Every service file has `// TODO:` markers for real integration points (Solana web3.js, Razorpay, IPFS)
- Status flow: `pending → allocated → disbursed → delivered`
- Solana Explorer links: `https://explorer.solana.com/tx/<hash>?cluster=devnet`
