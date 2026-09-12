// DonateDialog – Modal for making a UPI or SOL donation to a campaign
import { useState } from 'react'
import { Loader2, CreditCard, ExternalLink } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { useDonationStore } from '@/store/donationStore'
import { apiService } from '@/utils/apiClient'
import { initiateUpiPayment } from '@/services/mockPayments'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Campaign, PaymentMethod, Donation } from '@/types'

const PRESET_AMOUNTS = [25, 50, 100, 250]

interface Props {
    campaign: Campaign | null
    open: boolean
    onClose: () => void
}

export function DonateDialog({ campaign, open, onClose }: Props) {
    const [amount, setAmount] = useState(50)
    const [custom, setCustom] = useState('')
    const method: PaymentMethod = 'upi'
    const [loading, setLoading] = useState(false)
    const [createdDonation, setCreatedDonation] = useState<Donation | null>(null)
    const [isSimulating, setIsSimulating] = useState(false)

    const { user } = useAuthStore()
    const donationStore = useDonationStore()
    const { toast } = useToast()

    const finalAmount = custom ? parseInt(custom, 10) || 0 : amount

    /* --- OLD DONATE LOGIC (preserved/commented) ---
    const handleDonateOld = async () => {
        if (!campaign) {
            toast({ title: 'Select a campaign', variant: 'destructive' })
            return
        }
        if (!user) {
            toast({ title: 'Sign in to donate', variant: 'destructive' })
            return
        }
        if (finalAmount < 1) {
            toast({ title: 'Enter a valid amount', variant: 'destructive' })
            return
        }
        setLoading(true)
        try {
            await initiateUpiPayment(finalAmount)
            const payload = {
                campaignId: campaign.id,
                ngoId: campaign.ngoId,
                amount: finalAmount,
                paymentMethod: method.toUpperCase(),
            }
            const donation = await apiService.donations.create(payload) as Donation
            donationStore.addDonation(donation)
            toast({ title: `${formatUSD(finalAmount)} donation successful! 🎉` })
        } catch (_error) {
            console.error(_error)
            toast({ title: 'Donation failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }
    ------------------------------------------------ */

    const handleDonate = async () => {
        if (!campaign) {
            toast({ title: 'Select a campaign', variant: 'destructive' })
            return
        }
        if (!user) {
            toast({ title: 'Sign in to donate', variant: 'destructive' })
            return
        }
        if (finalAmount < 1) {
            toast({ title: 'Enter a valid amount', variant: 'destructive' })
            return
        }
        setLoading(true)
        try {
            await initiateUpiPayment(finalAmount)

            const payload = {
                campaignId: campaign.id,
                ngoId: campaign.ngoId,
                amount: finalAmount,
                paymentMethod: method.toUpperCase(),
            }
            const res = await apiService.donations.create(payload) as any
            
            const newDonation: Donation = {
                id: res.id || `don-${Date.now()}`,
                publicId: res.publicDonationId,
                campaignId: campaign.id,
                campaignTitle: campaign.title,
                amount: finalAmount,
                paymentMethod: method,
                orderId: res.orderId || `order_${Date.now()}`,
                status: 'INITIATED',
                createdAt: new Date().toISOString(),
                walletAddress: 'donor_wallet',
                explorerUrl: `https://explorer.solana.com/?cluster=devnet`
            }

            donationStore.addDonation(newDonation)
            setCreatedDonation(newDonation)
            toast({ title: `Donation initiated for ${formatUSD(finalAmount)}!` })
        } catch (_error) {
            console.error(_error)
            toast({ title: 'Donation failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const handleSimulatePayment = async () => {
        if (!createdDonation) return
        setIsSimulating(true)
        try {
            await apiService.webhooks.simulateSuccess(createdDonation.id)
            const updated: Donation = {
                ...createdDonation,
                status: 'SUCCESS',
                txHash: `sim_tx_${createdDonation.id.slice(0, 8)}`,
            }
            setCreatedDonation(updated)
            toast({ title: 'Payment confirmed & attestation generated! 🎉' })
        } catch (err) {
            console.error('Simulation error:', err)
            toast({ title: 'Simulation failed', variant: 'destructive' })
        } finally {
            setIsSimulating(false)
        }
    }

    const handleClose = () => {
        setCreatedDonation(null)
        setCustom('')
        setAmount(50)
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="glass border-border/60 max-w-md">
                <DialogHeader>
                    <DialogTitle className="gradient-text text-xl">Donate to Campaign</DialogTitle>
                    <DialogDescription>{campaign?.title}</DialogDescription>
                </DialogHeader>

                {createdDonation ? (
                    <div className="text-center space-y-4 py-4">
                        {createdDonation.status === 'SUCCESS' ? (
                            <>
                                <p className="text-4xl">🎉</p>
                                <p className="font-semibold text-emerald-400">Payment Confirmed!</p>
                                <p className="text-sm text-muted-foreground">
                                    Tx: {createdDonation.txHash ? shortenHash(createdDonation.txHash) : 'Recorded on Solana devnet'}
                                </p>
                                {createdDonation.txHash && (
                                    <a
                                        href={`https://explorer.solana.com/tx/${createdDonation.txHash}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                                    >
                                        <ExternalLink className="h-3 w-3" /> View on Solana Explorer
                                    </a>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary animate-pulse">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                                <p className="font-semibold text-primary">Payment Initiated</p>
                                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                    Awaiting gateway webhook confirmation (~15 seconds).
                                </p>
                                {import.meta.env.DEV && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isSimulating}
                                        onClick={handleSimulatePayment}
                                        className="text-xs bg-muted/40 hover:bg-primary/20 border-primary/40 text-primary"
                                    >
                                        {isSimulating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                        ⚡ Dev: Instant Simulate Payment
                                    </Button>
                                )}
                            </>
                        )}

                        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 text-left space-y-2 text-sm">
                            <h3 className="font-semibold border-b border-border/50 pb-2 mb-2">
                                {createdDonation.status === 'SUCCESS' ? 'Donation Receipt' : 'Order Details'}
                            </h3>
                            <div className="flex justify-between"><span className="text-muted-foreground">Date:</span> <span>{new Date(createdDonation.createdAt).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Order ID:</span> <span className="font-mono text-xs">{createdDonation.orderId}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Campaign:</span> <span className="truncate ml-4">{campaign?.title || createdDonation.campaignTitle}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{formatUSD(createdDonation.amount)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Status:</span> <span className="font-medium uppercase">{createdDonation.status}</span></div>

                            {createdDonation.status === 'SUCCESS' && (
                                <Button
                                    variant="outline"
                                    className="w-full mt-4"
                                    onClick={() => {
                                        const text = `TRACE-IT DONATION RECEIPT\n--------------------------\nDate: ${new Date(createdDonation.createdAt).toLocaleString()}\nOrder ID: ${createdDonation.orderId}\nCampaign: ${campaign?.title || createdDonation.campaignTitle}\nAmount: ${formatUSD(createdDonation.amount)}\nPayment Method: ${createdDonation.paymentMethod.toUpperCase()}\nStatus: SUCCESS\n\nThank you for your contribution!`;
                                        const blob = new Blob([text], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `Receipt_${createdDonation.orderId}.txt`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                >
                                    Download Receipt
                                </Button>
                            )}
                        </div>

                        <Button className="w-full" onClick={handleClose}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Amount selector */}
                        <div>
                            <p className="text-sm font-medium mb-2">Amount (INR)</p>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                                {PRESET_AMOUNTS.map((a) => (
                                    <Button
                                        key={a}
                                        size="sm"
                                        variant={amount === a && !custom ? 'default' : 'outline'}
                                        onClick={() => { setAmount(a); setCustom('') }}
                                    >
                                        ₹{a}
                                    </Button>
                                ))}
                            </div>
                            <input
                                type="number"
                                placeholder="Custom amount…"
                                value={custom}
                                onChange={(e) => setCustom(e.target.value)}
                                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        {/* Payment method */}
                        <div className="flex flex-col gap-2 p-3 border border-border/50 rounded-lg bg-muted/20">
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">UPI Payment</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Powered by Razorpay. Your fiat payment will be recorded on-chain via ZK attestations.
                            </p>
                        </div>

                        <Button className="w-full" onClick={handleDonate} disabled={loading || !user}>
                            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</> : `Donate ${formatUSD(finalAmount)}`}
                        </Button>
                        {!user && (
                            <p className="text-xs text-center text-destructive">Sign in first to donate</p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}