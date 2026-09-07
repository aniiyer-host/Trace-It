// App.tsx – root layout, routing, and global Toaster
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { NavBar } from '@/components/NavBar'
import Home from '@/pages/Home'
import DonorDashboard from '@/pages/DonorDashboard'
import NGODashboard from '@/pages/NGODashboard'
import AdminPanel from '@/pages/AdminPanel'
import Login from '@/pages/Login'
import Profile from '@/pages/Profile'
// Placeholder for attestation verification page (to be implemented)
import AttestationVerify from '@/pages/AttestationVerify'
import PageTransition from '@/components/PageTransition'

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="traceit-theme">
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <PageTransition>
          <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/donor" element={<DonorDashboard />} />
              <Route path="/ngo" element={<NGODashboard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/attestation/verify/:attestationId" element={<AttestationVerify />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </main>
        </PageTransition>
        <footer className="border-t border-border/30 py-4 text-center text-xs text-muted-foreground">
          TraceIt © 2025 — All data is simulated for demo purposes •{' '}
          <a
            href="https://explorer.solana.com/?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Solana Devnet
          </a>
        </footer>
        <Toaster />
      </div>
    </BrowserRouter>
    </ThemeProvider>
  )
}