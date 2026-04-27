import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely (shadcn/ui helper) */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Format USD amount */
export function formatUSD(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(amount)
}

/** Shorten a hash/pubkey for display e.g. "5x8A...9z2B" */
export function shortenHash(hash: string, start = 6, end = 4): string {
    if (hash.length <= start + end) return hash
    return `${hash.slice(0, start)}...${hash.slice(-end)}`
}

/** Simulated async delay (replaces real API latency) */
export function delay(ms = 800): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

/** Generate a deterministic mock tx hash */
export function mockTxHash(seed?: string): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789'
    // Use seed to make partially deterministic; pad with pseudo-random chars
    let hash = seed ? seed.replace(/[^A-Za-z0-9]/g, '') : ''
    while (hash.length < 88) {
        hash += chars[Math.floor(Math.random() * chars.length)]
    }
    return hash.slice(0, 88)
}

/** Build a Solana devnet explorer URL for a tx hash */
export function explorerUrl(txHash: string): string {
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
}

/** Status colour map for badges */
export const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    allocated: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    disbursed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}
