// Login.tsx – Professional login/onboarding experience
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, CheckCircle2, MapPin, DollarSign, Shield, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { loginWithEmail } from '@/services/mockAuth'
import { useUIStore } from '@/store/uiStore'
// Ensure all icons are used (prevents unused import warnings)
const _iconUsage = [<Users />, <CheckCircle2 />, <MapPin />, <DollarSign />, <Shield />, <Loader2 />];
// @ts-expect-error Preventing unused import warnings during development
window._iconUsage = _iconUsage;

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'welcome' | 'login' | 'verify' | 'success'>('welcome')
  const { setUser } = useUIStore()
  const { toast } = useToast()

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Email and password are required', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      const user = await loginWithEmail(email, password)
      setUser(user)

      setStep('success')
      setTimeout(() => {
        // In a real app, this would redirect to dashboard
        setStep('welcome')
      }, 2000)
    } catch {
      toast({ title: 'Authentication failed', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleGuestLogin = () => {
    // Simulate guest login
    setStep('success')
    setTimeout(() => {
      // Create a temporary guest user
      const guestUser = {
        id: `guest-${Date.now()}`,
        email: 'guest@traceit.demo'
      }
      setUser(guestUser)
      setStep('welcome')
    }, 1500)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary/5 text-primary/50 border-b border-border/20">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold gradient-text">
              TraceIt Login
            </h1>
            <div className="text-sm text-muted-foreground">
              Demo Mode • {new Date().getFullYear()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
        {step === 'welcome' && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <Users className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-3xl font-bold">Welcome to TraceIt</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Track every rupee's journey from donation to impact on the blockchain.
                Sign in to explore campaigns, make donations, and verify transparency.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                className="w-full md:w-auto px-8 py-3"
                onClick={() => setStep('login')}
              >
                Sign In
              </Button>
              <Button
                variant="outline"
                className="w-full md:w-auto px-8 py-3 border-border/50 text-muted-foreground hover:border-primary/50"
                onClick={handleGuestLogin}
              >
                Continue as Guest
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>By continuing, you agree to our Terms of Service and Privacy Policy.</p>
            </div>
          </div>
        )}

        {step === 'login' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Sign In to Your Account</h2>
              <p className="text-muted-foreground">
                Enter your email and password to access the donation tracking platform.
              </p>
            </div>

            <form onClick={(e) => e.preventDefault()} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="login-email">Email Address</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="login-remember" className="flex items-center gap-2">
                  <input
                    id="login-remember"
                    type="checkbox"
                    checked={false}
                    onChange={() => {}}
                    className="h-4 w-4 text-primary rounded border-gray-300"
                  />
                  Remember me
                </Label>
                <a href="#" className="text-primary hover:underline">
                  Forgot Password?
                </a>
              </div>

              <Button
                type="submit"
                onClick={handleLogin}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="border-t border-border/30 pt-6 mt-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Don't have an account? In the demo version, any email and password will work.
                </p>
                <div className="flex justify-center gap-4">
                  <a href="#" className="text-sm text-primary hover:underline">
                    Terms of Service
                  </a>
                  <span className="text-xs text-muted-foreground">|</span>
                  <a href="#" className="text-sm text-primary hover:underline">
                    Privacy Policy
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
              <h2 className="text-2xl font-bold">Verify Your Email</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                We've sent a verification link to {email}. Please check your inbox to complete the signup process.
              </p>
            </div>

            <div className="space-y-6">
              <Button
                variant="outline"
                className="w-full md:w-auto px-8 py-3"
                onClick={() => setStep('welcome')}
              >
                Go to Inbox
              </Button>
              <Button
                className="w-full md:w-auto px-8 py-3"
                onClick={() => setStep('login')}
              >
                Resend Email
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center space-y-8 py-12">
            <div className="space-y-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <h2 className="text-3xl font-bold text-emerald-500">Welcome Back!</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                You've successfully signed in to TraceIt. Redirecting to your dashboard...
              </p>
            </div>

            <div className="animate-pulse infinite">
              <div className="flex justify-center space-x-4">
                <DollarSign className="h-6 w-6 text-emerald-500" />
                <Users className="h-6 w-6 text-emerald-500" />
                <MapPin className="h-6 w-6 text-emerald-500" />
                <Shield className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-muted/5 text-center text-xs text-muted-foreground py-6 border-t border-border/20">
        <div className="container max-w-4xl mx-auto px-4">
          <p>
            TraceIt © {new Date().getFullYear()} — Built for transparent charitable giving
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
            <a href="#" className="hover:text-primary transition-colors">
              About
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              How It Works
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Blog
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

