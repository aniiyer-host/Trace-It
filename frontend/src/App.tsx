// App.tsx – root layout, routing, and global Toaster
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { NavBar } from '@/components/NavBar'
const Home = lazy(() => import('@/pages/Home'))
const Campaigns = lazy(() => import('@/pages/Campaigns'))
const DonorDashboard = lazy(() => import('@/pages/DonorDashboard'))
const DonorVerify = lazy(() => import('@/pages/DonorVerify'))
const NGODashboard = lazy(() => import('@/pages/NGODashboard'))
const AdminPanel = lazy(() => import('@/pages/AdminPanel'))
const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const Profile = lazy(() => import('@/pages/Profile'))
const NgoDirectory = lazy(() => import('@/pages/NgoDirectory').then((module) => ({ default: module.NgoDirectory })))
// Placeholder for attestation verification page (to be implemented)
const AttestationVerify = lazy(() => import('@/pages/AttestationVerify'))
import PageTransition from '@/components/PageTransition'

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="traceit-theme">
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <NavBar />
            <PageTransition>
              <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
                <Suspense fallback={<div role="status" className="py-12 text-center text-muted-foreground">Loading page…</div>}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/campaigns" element={<Campaigns />} />
                    <Route path="/donor" element={<DonorDashboard />} />
                    <Route path="/verify" element={<DonorVerify />} />
                    <Route path="/ngo" element={<NGODashboard />} />
                    <Route path="/ngos" element={<NgoDirectory />} />
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/attestation/verify/:attestationId" element={<AttestationVerify />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/profile" element={<Profile />} />
                  </Routes>
                </Suspense>
              </main>
            </PageTransition>
            <Toaster />
          </div>
        </BrowserRouter>
      </MotionConfig>
    </ThemeProvider>
  )
}
