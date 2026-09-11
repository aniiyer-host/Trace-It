import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import { useAuthStore } from '@/store/authStore'

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } }
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
}

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [pan, setPan] = useState('')
  const [loading, setLoading] = useState(false)
  
  const [step, setStep] = useState<'details' | 'kyc' | 'success'>('details')
  
  const { setUser } = useAuthStore()
  const { toast } = useToast()
  const navigate = useNavigate()

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = e.target.value.toUpperCase()
    setPan(e.target.value)
  }

  const handleContinueToKYC = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      toast({ title: 'Please complete all required fields', variant: 'destructive' })
      return
    }
    setStep('kyc')
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      toast({ title: 'Email, password, and full name are required', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const { user, token } = await apiService.auth.register({
        email,
        password,
        name: fullName
      })

      setUser({ ...user, token })
      setStep('success')

      setTimeout(() => {
        // TODO: RBAC redirect pending backend branch merge.
        // Once `user.role` is returned from backend, route accordingly:
        // if (user.role === 'admin') navigate('/admin')
        // else if (user.role === 'ngo') navigate('/ngo')
        // else navigate('/donor')
        navigate('/donor')
      }, 1200)
    } catch {
      toast({ title: 'Signup failed', variant: 'destructive' })
      setLoading(false)
    }
  }

  return (
    <div className="w-screen min-h-[calc(100dvh-3.5rem)] relative left-1/2 -ml-[50vw] -mt-8 flex flex-col md:flex-row bg-background">
      {/* Left Panel: Trust Anchor */}
      <div className="hidden md:flex md:w-1/2 bg-foreground text-background flex-col justify-end p-12 lg:p-24">
        <h1 className="text-6xl lg:text-8xl font-extrabold tracking-tighter leading-none mb-6 text-balance">
          Impact<br />On-Chain.
        </h1>
        <p className="text-xl lg:text-2xl font-medium text-background/80 max-w-md text-balance">
          Join the network for transparent, cryptographically verifiable charitable giving.
        </p>
      </div>

      {/* Right Panel: Brutalist Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:px-16 lg:px-24">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="w-full max-w-md mx-auto md:mx-0"
        >
          {step === 'success' ? (
            <motion.div variants={itemVariants} className="space-y-4">
              <h2 className="text-4xl font-bold tracking-tight text-foreground">Welcome to TraceIt</h2>
              <p className="text-lg text-muted-foreground font-medium">Provisioning your account...</p>
              <div className="h-1 w-full bg-muted mt-8 overflow-hidden">
                <motion.div 
                  initial={{ scaleX: 0 }} 
                  animate={{ scaleX: 1 }} 
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                  className="h-full bg-emerald-500 origin-left"
                />
              </div>
            </motion.div>
          ) : (
            <>
              <motion.div variants={itemVariants} className="mb-12">
                <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-3">Apply</h2>
                <p className="text-lg text-muted-foreground font-medium">Create your institutional account.</p>
              </motion.div>

              <div className="space-y-8">
                {/* Basic Details Form */}
                <form onSubmit={step === 'details' ? handleContinueToKYC : handleSignup} className="space-y-8">
                  <div className={`space-y-8 transition-opacity duration-500 ${step === 'kyc' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <motion.div variants={itemVariants} className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Full Name</label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required={step === 'details'}
                        tabIndex={step === 'kyc' ? -1 : 0}
                        className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                        placeholder="Enter your full name"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={step === 'details'}
                        tabIndex={step === 'kyc' ? -1 : 0}
                        className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                        placeholder="Enter your email"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required={step === 'details'}
                        tabIndex={step === 'kyc' ? -1 : 0}
                        className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                        placeholder="••••••••"
                      />
                    </motion.div>
                    
                    {step === 'details' && (
                      <motion.div variants={itemVariants} className="pt-6">
                        <button
                          type="submit"
                          className="w-full bg-foreground text-background py-4 px-8 text-lg font-bold hover:bg-foreground/90 transition-all active:scale-[0.98]"
                        >
                          Continue to KYC
                        </button>
                      </motion.div>
                    )}
                  </div>

                  {/* KYC Section (Appears after details are filled) */}
                  {step === 'kyc' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-8 border-t-2 border-foreground"
                    >
                      <div className="mb-6 space-y-2">
                        <h3 className="text-xl font-bold tracking-tight text-foreground">Compliance Information</h3>
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                          For donations over ₹10,000, we verify your identity. Your PAN is hashed and never stored on-chain.
                        </p>
                      </div>

                      <div className="space-y-2 mb-8">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">PAN Number (Optional)</label>
                        <input
                          type="text"
                          value={pan}
                          onChange={handlePanChange}
                          maxLength={10}
                          pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                          title="PAN must be in format AAAAA9999A"
                          autoFocus
                          className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                          placeholder="ABCDE1234F"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-foreground text-background py-4 px-8 text-lg font-bold hover:bg-foreground/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center">
                            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                            Provisioning...
                          </span>
                        ) : (
                          'Complete Application'
                        )}
                      </button>
                    </motion.div>
                  )}
                </form>
              </div>
              
              <motion.div variants={itemVariants} className="mt-8">
                <p className="text-muted-foreground font-medium">
                  Already have an account?{' '}
                  <Link to="/login" className="text-foreground border-b border-foreground hover:text-muted-foreground hover:border-muted-foreground transition-colors pb-0.5">
                    Sign In
                  </Link>
                </p>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}