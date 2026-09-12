import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import { useAuthStore } from '@/store/authStore'

const ProfileFormSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address")
})

const NgoOnboardSchema = z.object({
    organisationName: z.string().min(2, "Organisation name must be at least 2 characters"),
    registrationNo: z.string().min(3, "Registration number must be at least 3 characters"),
    description: z.string().optional(),
    fcraNumber: z.string().optional(),
    taxExemptionNo80g: z.string().optional()
})

export default function Profile() {
    const { user, setUser } = useAuthStore()
    const { toast } = useToast()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState(user?.email || '')
    // "@ts-expect-error" user.name is not in the type definition, falling back nicely
    const [name, setName] = useState(user?.name || '')

    const handlePreferenceToggle = (setting: string, state: boolean) => {
        toast({
            title: 'Preferences Updated',
            description: `${setting} ${state ? 'enabled' : 'disabled'}.`
        })
    }

    const [ngoLoading, setNgoLoading] = useState(false)
    const [ngoSuccessMsg, setNgoSuccessMsg] = useState('')
    const [orgName, setOrgName] = useState('')
    const [regNo, setRegNo] = useState('')
    const [description, setDescription] = useState('')
    const [fcra, setFcra] = useState('')
    const [taxExemption, setTaxExemption] = useState('')

    const handleNgoOnboard = async (e: React.FormEvent) => {
        e.preventDefault()
        
        const result = NgoOnboardSchema.safeParse({
            organisationName: orgName,
            registrationNo: regNo,
            description,
            fcraNumber: fcra,
            taxExemptionNo80g: taxExemption
        })

        if (!result.success) {
            toast({
                title: 'Validation Error',
                description: result.error.issues[0].message,
                variant: 'destructive'
            })
            return
        }

        setNgoLoading(true)
        try {
            await apiService.charity.onboard(result.data)
            setNgoSuccessMsg("Your application has been submitted. An admin will review it shortly.")
            toast({
                title: 'Application submitted',
                description: 'Your NGO application is under review.'
            })
        } catch (error: any) {
            toast({
                title: 'Application failed',
                description: error?.response?.data?.error || 'An error occurred while submitting your application.',
                variant: 'destructive'
            })
        } finally {
            setNgoLoading(false)
        }
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        
        const result = ProfileFormSchema.safeParse({ name, email })
        if (!result.success) {
            toast({
                title: 'Validation Error',
                description: result.error.issues[0].message,
                variant: 'destructive'
            })
            return
        }

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
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        Personal information
                    </h2>
                    <div className="bg-foreground/[0.02] p-6 md:p-8">
                        <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-xl">
                            <div className="space-y-2">
                                <Label htmlFor="profile-email">Email Address</Label>
                                <Input
                                    id="profile-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-background"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Changing your email will require re-verification.
                                </p>
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

                {/* Institution Registration Section */}
                {(!user || !(user as any).role || (user as any).role === 'DONOR' || (user as any).role === 'CHARITY') && (
                    <section className="space-y-6">
                        <h2 className="text-xl font-semibold tracking-tight text-foreground">
                            Institution Registration
                        </h2>
                        <div className="bg-foreground/[0.02] p-6 md:p-8">
                            {(user as any)?.role === 'CHARITY' || ngoSuccessMsg ? (
                                <p className="text-muted-foreground font-medium">
                                    {ngoSuccessMsg || "NGO status active."}
                                </p>
                            ) : (
                                <form onSubmit={handleNgoOnboard} className="space-y-6 max-w-xl">
                                    <div className="space-y-2">
                                        <Label htmlFor="org-name">Organisation Name *</Label>
                                        <Input
                                            id="org-name"
                                            value={orgName}
                                            onChange={(e) => setOrgName(e.target.value)}
                                            placeholder="Enter registered NGO name"
                                            className="bg-background"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-no">Registration Number *</Label>
                                        <Input
                                            id="reg-no"
                                            value={regNo}
                                            onChange={(e) => setRegNo(e.target.value)}
                                            placeholder="Enter official registration ID"
                                            className="bg-background"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="desc">Description (Optional)</Label>
                                        <Input
                                            id="desc"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Briefly describe your mission"
                                            className="bg-background"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="fcra">FCRA Number (Optional)</Label>
                                        <Input
                                            id="fcra"
                                            value={fcra}
                                            onChange={(e) => setFcra(e.target.value)}
                                            placeholder="Required for foreign donations"
                                            className="bg-background"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tax-80g">Tax Exemption No. 80G (Optional)</Label>
                                        <Input
                                            id="tax-80g"
                                            value={taxExemption}
                                            onChange={(e) => setTaxExemption(e.target.value)}
                                            placeholder="e.g. AAATT1234E"
                                            className="bg-background"
                                        />
                                    </div>
                                    <div className="pt-4">
                                        <Button 
                                            type="submit" 
                                            disabled={ngoLoading}
                                            className="w-full sm:w-auto"
                                        >
                                            {ngoLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                            Submit Application
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </section>
                )}

                {/* Preferences Section */}
                <section className="space-y-6">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        Preferences
                    </h2>
                    <div className="bg-foreground/[0.02] p-6 md:p-8 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Email Notifications</Label>
                                <p className="text-sm text-muted-foreground">
                                    Receive updates about your donations and campaigns.
                                </p>
                            </div>
                            <Switch
                                defaultChecked={true}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceToggle('Email notifications', e.target.checked)}
                            />
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Public Profile</Label>
                                <p className="text-sm text-muted-foreground">
                                    Allow others to see your donation history.
                                </p>
                            </div>
                            <Switch 
                                defaultChecked={false} 
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceToggle('Public profile', e.target.checked)}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Blockchain Explorer Link</Label>
                                <p className="text-sm text-muted-foreground">
                                    Show direct links to Solana transactions.
                                </p>
                            </div>
                            <Switch 
                                defaultChecked={true} 
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceToggle('Blockchain links', e.target.checked)}
                            />
                        </div>
                    </div>
                </section>

                {/* Danger Zone Section */}
                <section className="space-y-6">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        Danger zone
                    </h2>
                    <div className="bg-foreground/[0.02] p-6 md:p-8 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <h3 className="font-medium">Sign Out</h3>
                                <p className="text-sm text-muted-foreground">
                                    Securely end your current session.
                                </p>
                            </div>
                            <Button
                                onClick={handleLogout}
                                disabled={loading}
                                className="w-full sm:w-auto bg-foreground/[0.06] text-foreground hover:bg-destructive hover:text-white transition-colors"
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