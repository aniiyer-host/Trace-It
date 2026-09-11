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

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  
  const { setUser } = useAuthStore()
  const { toast } = useToast()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Email and password are required', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const { user, token } = await apiService.auth.login(email, password)
      setUser({ ...user, token })
      
      setSuccess(true)
      
      setTimeout(() => {
        if (user.role === 'ADMIN') navigate('/admin')
        else if (user.role === 'CHARITY') navigate('/ngo')
        else navigate('/donor')
      }, 1200)
    } catch {
      toast({ title: 'Authentication failed', variant: 'destructive' })
      setLoading(false)
    }
  }

  return (
    <div className="w-screen min-h-[calc(100dvh-3.5rem)] relative left-1/2 -ml-[50vw] -mt-8 flex flex-col md:flex-row bg-background">
      {/* Left Panel: Trust Anchor (Hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-foreground text-background flex-col justify-end p-12 lg:p-24">
        <h1 className="text-6xl lg:text-8xl font-extrabold tracking-tighter leading-none mb-6 text-balance">
          Trace Every Rupee.
        </h1>
        <p className="text-xl lg:text-2xl font-medium text-background/80 max-w-md text-balance">
          Transparent, immutable, and accountable. Impact you can verify on-chain.
        </p>
      </div>

      {/* Right Panel: The Brutalist Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:px-16 lg:px-24">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="w-full max-w-md mx-auto md:mx-0"
        >
          {success ? (
            <motion.div variants={itemVariants} className="space-y-4">
              <h2 className="text-4xl font-bold tracking-tight text-foreground">Welcome Back</h2>
              <p className="text-lg text-muted-foreground font-medium">Authenticating your session...</p>
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
                <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-3">Sign In</h2>
                <p className="text-lg text-muted-foreground font-medium">Access your institutional dashboard.</p>
              </motion.div>

              <form onSubmit={handleLogin} className="space-y-8">
                <motion.div variants={itemVariants} className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                    placeholder="name@institution.org"
                  />
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 focus:border-foreground text-2xl font-medium py-2 px-0 outline-none transition-colors rounded-none placeholder:text-muted-foreground/30"
                    placeholder="••••••••"
                  />
                </motion.div>

                <motion.div variants={itemVariants} className="pt-6">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-foreground text-background py-4 px-8 text-lg font-bold hover:bg-foreground/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        Authenticating...
                      </span>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </motion.div>
              </form>
              
              <motion.div variants={itemVariants} className="mt-8">
                <p className="text-muted-foreground font-medium">
                  Don't have an account?{' '}
                  <Link to="/signup" className="text-foreground border-b border-foreground hover:text-muted-foreground hover:border-muted-foreground transition-colors pb-0.5">
                    Apply for access
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