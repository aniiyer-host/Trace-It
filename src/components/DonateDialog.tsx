// DonateDialog – Modal for making a UPI or SOL donation to a campaign
import { useState } from 'react'
import { Loader2, Wallet2, CreditCard, ExternalLink } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useUIStore } from '@/store/uiStore'
import { useDonationStore } from '@/store/donationStore'
import { initiateUpiPayment, initiateSolPayment } from '@/services/mockPayments'
import { createDonation } from '@/services/mockApi'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Campaign, PaymentMethod } from '@/types'

const PRESET_AMOUNTS = [25, 50, 100, 250]

interface Props {
    campaign: Campaign | null
    open: boolean
    onClose: () => void
}

export function DonateDialog({ campaign, open, onClose }: Props) {
    const [amount, setAmount] = useState(50)
    const [custom, setCustom] = useState('')
    const [method, setMethod] = useState<PaymentMethod>('upi')
    const [loading, setLoading] = useState(false)
    const [successTx, setSuccessTx] = useState<string | null>(null)

    const { wallet } = useUIStore()
    const { addDonation } = useDonationStore()
    const { toast } = useToast()

    const finalAmount = custom ? parseInt(custom, 10) || 0 : amount

    const handleDonate = async () => {
        if (!campaign || !wallet.connected || !wallet.publicKey) {
            toast({ title: 'Connect your wallet first', variant: 'destructive' })
            return
        }
        if (finalAmount < 1) {
            toast({ title: 'Enter a valid amount', variant: 'destructive' })
            return
        }
        setLoading(true)
        try {
            let orderId: string
            let txHash: string

            if (method === 'upi') {
                // TODO: Replace with real Razorpay checkout
                const result = await initiateUpiPayment(finalAmount)
                orderId = result.orderId
                txHash = result.razorpayPaymentId
            } else {
                // TODO: Replace with @solana/web3.js send transaction
                const result = await initiateSolPayment(finalAmount)
                orderId = result.txHash
                txHash = result.txHash
            }

            const donation = await createDonation(
                campaign, finalAmount, method, orderId, txHash, wallet.publicKey,
            )
            addDonation(donation)
            setSuccessTx(txHash)
            toast({ title: `${formatUSD(finalAmount)} donation successful! 🎉` })
        } catch {
            toast({ title: 'Donation failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setSuccessTx(null)
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

                {successTx ? (
                    <div className="text-center space-y-4 py-4">
                        <p className="text-4xl">🎉</p>
                        <p className="font-semibold text-emerald-400">Donation Confirmed!</p>
                        <p className="text-sm text-muted-foreground">Tx: {shortenHash(successTx)}</p>
                        <a
                            href={`https://explorer.solana.com/tx/${successTx}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" /> View on Solana Explorer
                        </a>
                        <Button className="w-full" onClick={handleClose}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Amount selector */}
                        <div>
                            <p className="text-sm font-medium mb-2">Amount (USD)</p>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                                {PRESET_AMOUNTS.map((a) => (
                                    <Button
                                        key={a}
                                        size="sm"
                                        variant={amount === a && !custom ? 'default' : 'outline'}
                                        onClick={() => { setAmount(a); setCustom('') }}
                                    >
                                        ${a}
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
                        <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                            <TabsList className="w-full">
                                <TabsTrigger value="upi" className="flex-1 gap-2"><CreditCard className="h-4 w-4" />UPI</TabsTrigger>
                                <TabsTrigger value="sol" className="flex-1 gap-2"><Wallet2 className="h-4 w-4" />SOL</TabsTrigger>
                            </TabsList>
                            <TabsContent value="upi">
                                <p className="text-xs text-muted-foreground">Powered by Razorpay (simulated). Your UPI app will open in production.</p>
                            </TabsContent>
                            <TabsContent value="sol">
                                <p className="text-xs text-muted-foreground">Sends SOL via Phantom wallet (simulated). Real tx on Solana devnet in production.</p>
                            </TabsContent>
                        </Tabs>

                        <Button className="w-full" onClick={handleDonate} disabled={loading || !wallet.connected}>
                            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</> : `Donate ${formatUSD(finalAmount)}`}
                        </Button>
                        {!wallet.connected && (
                            <p className="text-xs text-center text-destructive">Connect your wallet above to donate</p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
