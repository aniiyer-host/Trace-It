// App.tsx – root layout, routing, and global Toaster
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { WalletButton } from '@/components/WalletButton'
import { AuthDialog } from '@/components/AuthDialog'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/uiStore'
import { logoutUser } from '@/services/mockAuth'
import Home from '@/pages/Home'
import DonorDashboard from '@/pages/DonorDashboard'
import NGODashboard from '@/pages/NGODashboard'
import { GitBranch, UserCircle, LogOut } from 'lucide-react'

const NAV_LINKS = [
  { to: '/', label: 'Campaigns', end: true },
  { to: '/donor', label: 'Donor', end: false },
  { to: '/ngo', label: 'NGO', end: false },
]

function NavBar() {
  const { user, setUser } = useUIStore()
  const [authOpen, setAuthOpen] = useState(false)

  const handleLogout = async () => {
    await logoutUser()
    setUser(null)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container max-w-6xl mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 font-extrabold text-lg">
          <GitBranch className="h-5 w-5 text-primary" />
          <span className="gradient-text">TraceIt</span>
        </NavLink>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm transition-colors ${isActive
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground mr-2">{user.email}</span>
              <Button size="sm" variant="ghost" className="gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setAuthOpen(true)} className="gap-2">
              <UserCircle className="h-4 w-4" />
              Sign In
            </Button>
          )}
          <WalletButton />
        </div>
      </div>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/donor" element={<DonorDashboard />} />
            <Route path="/ngo" element={<NGODashboard />} />
          </Routes>
        </main>
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
      </div>
      <Toaster />
    </BrowserRouter>
  )
}
