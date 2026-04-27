// WalletButton – Connect / Disconnect mock Phantom wallet
import { Wallet, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/uiStore'
import { connectWallet, disconnectWallet } from '@/services/mockWallet'
import { shortenHash } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export function WalletButton() {
    const { wallet, walletLoading, setWallet, setWalletLoading } = useUIStore()
    const { toast } = useToast()

    const handleConnect = async () => {
        setWalletLoading(true)
        try {
            const state = await connectWallet()
            setWallet(state)
            toast({ title: 'Wallet connected', description: `${shortenHash(state.publicKey!)} • ${state.balance} SOL` })
        } catch {
            toast({ title: 'Connection failed', variant: 'destructive' })
        } finally {
            setWalletLoading(false)
        }
    }

    const handleDisconnect = async () => {
        setWalletLoading(true)
        const state = await disconnectWallet()
        setWallet(state)
        setWalletLoading(false)
        toast({ title: 'Wallet disconnected' })
    }

    if (walletLoading) {
        return (
            <Button variant="outline" disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
            </Button>
        )
    }

    if (wallet.connected && wallet.publicKey) {
        return (
            <Button
                variant="outline"
                className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
                onClick={handleDisconnect}
            >
                <Wallet className="h-4 w-4" />
                {shortenHash(wallet.publicKey)}
                <LogOut className="h-3 w-3 ml-1 text-muted-foreground" />
            </Button>
        )
    }

    return (
        <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80 animate-pulse-brand"
            onClick={handleConnect}
        >
            <Wallet className="h-4 w-4" />
            Connect Wallet
        </Button>
    )
}
