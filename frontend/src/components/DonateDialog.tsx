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
    const [successDonation, setSuccessDonation] = useState<Donation | null>(null)

    const { user } = useAuthStore()
    const donationStore = useDonationStore()
    const { toast } = useToast()

    const finalAmount = custom ? parseInt(custom, 10) || 0 : amount

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
            // TODO: Replace with real Razorpay checkout
            await initiateUpiPayment(finalAmount)

            // Construct exact payload requested
            const payload = {
                campaignId: campaign.id,
                ngoId: campaign.ngoId,
                amount: finalAmount,
                paymentMethod: method.toUpperCase(),
            }
            const donation = await apiService.donations.create(payload) as Donation
            donationStore.addDonation(donation)
            setSuccessDonation(donation)
            toast({ title: `${formatUSD(finalAmount)} donation successful! 🎉` })
        } catch (_error) {
            console.error(_error)
            toast({ title: 'Donation failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setSuccessDonation(null)
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

                {successDonation ? (
                    <div className="text-center space-y-4 py-4">
                        <p className="text-4xl">🎉</p>
                        <p className="font-semibold text-emerald-400">Donation Confirmed!</p>
                        <p className="text-sm text-muted-foreground">
                            Tx: {successDonation.txHash ? shortenHash(successDonation.txHash) : 'Pending blockchain confirmation'}
                        </p>
                        <a
                            href={`https://explorer.solana.com/tx/${successDonation.txHash}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" /> View on Solana Explorer
                        </a>

                        {successDonation.paymentMethod === 'upi' && (
                            <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 text-left space-y-2 text-sm">
                                <h3 className="font-semibold border-b border-border/50 pb-2 mb-2">Donation Receipt</h3>
                                <div className="flex justify-between"><span className="text-muted-foreground">Date:</span> <span>{new Date(successDonation.createdAt).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Order ID:</span> <span className="font-mono text-xs">{successDonation.orderId}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Campaign:</span> <span className="truncate ml-4">{successDonation.campaignTitle}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{formatUSD(successDonation.amount)}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Payment:</span> <span className="uppercase">{successDonation.paymentMethod}</span></div>
                                <Button
                                    variant="outline"
                                    className="w-full mt-4"
                                    onClick={() => {
                                        const text = `TRACE-IT DONATION RECEIPT\n--------------------------\nDate: ${new Date(successDonation.createdAt).toLocaleString()}\nOrder ID: ${successDonation.orderId}\nCampaign: ${successDonation.campaignTitle}\nAmount: ${formatUSD(successDonation.amount)}\nPayment Method: ${successDonation.paymentMethod.toUpperCase()}\nSolana TX: ${successDonation.txHash}\n\nThank you for your contribution!`;
                                        const blob = new Blob([text], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `Receipt_${successDonation.orderId}.txt`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                >
                                    Download Receipt
                                </Button>
                            </div>
                        )}

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