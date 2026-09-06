// WalletButton – Connect / Disconnect mock Phantom wallet using UI store
import { Wallet, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/uiStore'
import { shortenHash } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export function WalletButton() {
  const { wallet, walletLoading, connectWallet, disconnectWallet } = useUIStore()
  const { toast } = useToast()

  const handleConnect = async () => {
    try {
      await connectWallet()
      // The wallet state is updated by the store, so we can access it here
      const { publicKey, balance } = wallet
      if (publicKey) {
        toast({
          title: 'Wallet connected',
          description: `${shortenHash(publicKey)} • ${balance} SOL`,
        })
      }
    } catch {
      toast({ title: 'Connection failed', variant: 'destructive' })
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectWallet()
      toast({ title: 'Wallet disconnected' })
    } catch {
      toast({ title: 'Disconnection failed', variant: 'destructive' })
    }
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