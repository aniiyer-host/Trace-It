// Signup.tsx – Complete signup/onboarding experience with KYC collection
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, CheckCircle2, MapPin, DollarSign, Shield, Loader2, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { signupWithEmail } from '@/services/authService'
import { useAuthStore } from '@/store/authStore'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [pan, setPan] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'welcome' | 'details' | 'kyc' | 'verify' | 'success'>('welcome')
  const { setUser } = useAuthStore()
  const { toast } = useToast()

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      toast({ title: 'Email, password, and full name are required', variant: 'destructive' })
      return
    }

    // Check if KYC is needed (amount > 10,000 INR would trigger this in real scenario)
    // For demo, we'll always collect PAN but make it optional for now
    const needsKYC = pan.trim() !== ''

    setLoading(true)
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      const user = await signupWithEmail({
        email,
        password,
        fullName
      })

      setUser(user)

      if (needsKYC) {
        setStep('verify') // In real app, this would be KYC verification
      } else {
        setStep('success')
      }

      setTimeout(() => {
        setStep('welcome')
      }, 2000)
    } catch {
      toast({ title: 'Signup failed', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPan(e.target.value)
    // Auto-format PAN input to uppercase
    e.target.value = e.target.value.toUpperCase()
    setPan(e.target.value)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary/5 text-primary/50 border-b border-border/20">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold gradient-text">
              TraceIt Signup
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
              <h2 className="text-3xl font-bold">Join TraceIt</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Sign up to track donations from source to impact with blockchain verification.
                Your identity stays private while every rupee is traced on-chain.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                className="w-full md:w-auto px-8 py-3"
                onClick={() => setStep('details')}
              >
                Get Started
              </Button>

              <Button
                variant="outline"
                className="w-full md:w-auto px-8 py-3 border-border/50 text-muted-foreground hover:border-primary/50"
              >
                Already have an account? Sign In
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>By continuing, you agree to our Terms of Service and Privacy Policy.</p>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Create Your Account</h2>
              <p className="text-muted-foreground">
                Enter your details to begin tracking donations with blockchain transparency.
              </p>
            </div>

            <form onClick={(e) => e.preventDefault()} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="signup-fullname">Full Name</Label>
                <Input
                  id="signup-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="signup-email">Email Address</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a secure password"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="signup-remember" className="flex items-center gap-2">
                  <input
                    id="signup-remember"
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
                onClick={handleSignup}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <div className="border-t border-border/30 pt-6 mt-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
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

        {step === 'kyc' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <Shield className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">Complete KYC Verification</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                For donations over ₹10,000, we need to verify your identity for compliance.
                Your PAN will be hashed and never stored on-chain.
              </p>
            </div>

            <form onClick={(e) => e.preventDefault()} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="signup-pan">PAN Number</Label>
                <Input
                  id="signup-pan"
                  type="text"
                  value={pan}
                  onChange={handlePanChange}
                  placeholder="Enter your PAN (e.g., ABCDE1234F)"
                  maxLength={10}
                  pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                  title="PAN must be in format AAAAA9999A"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: AAAAA9999A (5 letters, 4 digits, 1 letter)
                </p>
              </div>

              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="signup-kyc-remember" className="flex items-center gap-2">
                  <input
                    id="signup-kyc-remember"
                    type="checkbox"
                    checked={false}
                    onChange={() => {}}
                    className="h-4 w-4 text-primary rounded border-gray-300"
                  />
                  Remember my PAN for future donations
                </Label>
              </div>

              <Button
                type="submit"
                onClick={handleSignup}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Continue'
                )}
              </Button>
            </form>

            <div className="border-t border-border/30 pt-6 mt-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Your PAN is used only to generate a cryptographic hash for compliance.
                  The raw PAN is never stored on-chain or shared with third parties.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <Mail className="h-12 w-12 text-emerald-400 mx-auto" />
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
                onClick={() => setStep('details')}
              >
                Edit Details
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center space-y-8 py-12">
            <div className="space-y-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <h2 className="text-3xl font-bold text-emerald-500">Welcome to TraceIt!</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                You've successfully signed in. Let's start tracking your impact.
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