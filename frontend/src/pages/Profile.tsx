import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import { useUIStore } from '@/store/uiStore'

export default function Profile() {
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const { user, setUser } = useUIStore()
    const { toast } = useToast()
    const navigate = useNavigate()

    // Set initial form values when user loads
    useState(() => {
        if (user) {
            setEmail(user.email || '')
        }
    })

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500))

            toast({
                title: 'Profile updated',
                description: 'Your profile information has been saved'
            })
        } catch {
            toast({
                title: 'Update failed',
                variant: 'destructive'
            })
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = async () => {
        setLoading(true)
        try {
            await apiService.auth.logout()
            setUser(null)
        } catch {
            toast({
                title: 'Logout failed',
                variant: 'destructive'
            })
        } finally {
            setLoading(false)
        }
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
                <p className="text-muted-foreground text-lg max-w-md text-balance">Please sign in to view your profile.</p>
                <Button onClick={() => navigate('/login')}>Sign In</Button>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16 space-y-16 animate-fade-in">
            <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tighter">Settings</h1>
                <p className="text-muted-foreground text-lg">
                    Manage your account preferences and personal information.
                </p>
            </div>

            <div className="space-y-12">
                {/* Personal Information Section */}
                <section className="space-y-6">
                    <h2 className="text-xl font-bold tracking-tight uppercase text-foreground/50">
                        Personal Information
                    </h2>
                    <div className="bg-foreground/[0.02] border border-border/10 p-6 md:p-8">
                        <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-xl">
                            <div className="space-y-2">
                                <Label htmlFor="profile-email">Email Address</Label>
                                <Input
                                    id="profile-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-background"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="profile-name">Full Name</Label>
                                <Input
                                    id="profile-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your full name"
                                    className="bg-background"
                                />
                            </div>
                            <div className="pt-4">
                                <Button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full sm:w-auto"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </div>
                </section>

                {/* Preferences Section */}
                <section className="space-y-6">
                    <h2 className="text-xl font-bold tracking-tight uppercase text-foreground/50">
                        Preferences
                    </h2>
                    <div className="bg-foreground/[0.02] border border-border/10 p-6 md:p-8 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Email Notifications</Label>
                                <p className="text-sm text-muted-foreground">
                                    Receive updates about your donations and campaigns.
                                </p>
                            </div>
                            <Switch
                                defaultChecked={true}
                                onCheckedChange={(checked) => {
                                    toast({
                                        title: 'Preferences Updated',
                                        description: `Email notifications ${checked ? 'enabled' : 'disabled'}.`
                                    })
                                }}
                            />
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Public Profile</Label>
                                <p className="text-sm text-muted-foreground">
                                    Allow others to see your donation history.
                                </p>
                            </div>
                            <Switch defaultChecked={false} />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Blockchain Explorer Link</Label>
                                <p className="text-sm text-muted-foreground">
                                    Show direct links to Solana transactions.
                                </p>
                            </div>
                            <Switch defaultChecked={true} />
                        </div>
                    </div>
                </section>

                {/* Danger Zone Section */}
                <section className="space-y-6">
                    <h2 className="text-xl font-bold tracking-tight uppercase text-destructive/70">
                        Danger Zone
                    </h2>
                    <div className="bg-foreground/[0.02] border border-destructive/20 p-6 md:p-8 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <h3 className="font-medium">Sign Out</h3>
                                <p className="text-sm text-muted-foreground">
                                    Securely end your current session.
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                onClick={handleLogout}
                                disabled={loading}
                                className="w-full sm:w-auto"
                            >
                                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                Sign Out
                            </Button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}