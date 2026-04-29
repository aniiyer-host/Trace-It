import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useUIStore } from '@/store/uiStore'
import { loginWithEmail } from '@/services/mockAuth'

interface Props {
    open: boolean
    onClose: () => void
}

export function AuthDialog({ open, onClose }: Props) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const { setUser } = useUIStore()
    const { toast } = useToast()

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const user = await loginWithEmail(email, password)
            setUser(user)
            toast({ title: 'Welcome to TraceIt!', description: `Logged in as ${user.email}` })
            onClose()
        } catch {
            toast({ title: 'Authentication failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="glass border-border/60 max-w-sm">
                <DialogHeader>
                    <DialogTitle className="gradient-text text-xl">Sign In / Sign Up</DialogTitle>
                    <DialogDescription>Enter your email and password to access the donation network.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="donor@example.com"
                            required
                            className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-medium">Password</label>
                            <a href="#" className="text-xs text-primary hover:underline" onClick={(e) => { e.preventDefault(); toast({ title: 'Forgot Password', description: 'Reset link sent (simulation).' }) }}>Forgot password?</a>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                            required
                            className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</> : 'Continue'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
