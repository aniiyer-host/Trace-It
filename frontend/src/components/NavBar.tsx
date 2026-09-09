// NavBar.tsx – Professional navigation header with attestation focus
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { GitBranch, UserCircle, LogOut, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthDialog } from '@/components/AuthDialog'
import { ModeToggle } from '@/components/ModeToggle'
import { useUIStore } from '@/store/uiStore'
import { useNGOStore } from '@/store/ngoStore'
import { apiService } from '@/utils/apiClient'

const NAV_LINKS = [
  { to: '/', label: 'Campaigns', end: true },
  { to: '/donor', label: 'Donor', end: false },
  { to: '/ngo', label: 'NGO', end: false },
  { to: '/login', label: 'Login', end: true },
  { to: '/profile', label: 'Profile', end: false }
]

export function NavBar() {
  const { user, setUser } = useUIStore()
  const { pendingAttestations } = useNGOStore()
  const [authOpen, setAuthOpen] = useState(false)
  const location = useLocation()
  const isNGOPage = location.pathname.startsWith('/ngo')
  const pendingCount = Object.keys(pendingAttestations).length

  const handleLogout = async () => {
    await apiService.auth.logout()
    setUser(null)
  }

  return (
    <>
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
            {/* Attestation badge for NGO - shows pending count */}
            {isNGOPage && pendingCount > 0 && (
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary bg-primary/20 rounded-full px-2 py-0.5">
                  {pendingCount}
                </span>
              </div>
            )}
            <ModeToggle />
          </div>
        </div>
        <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      </header>
    </>
  )
}