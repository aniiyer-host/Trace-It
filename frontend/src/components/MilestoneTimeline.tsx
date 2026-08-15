// MilestoneTimeline – vertical progress tracker for a campaign's milestones
import { ExternalLink } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Milestone } from '@/types'

interface Props {
    milestones: Milestone[]
}

export function MilestoneTimeline({ milestones }: Props) {
    return (
        <ol className="relative border-l border-border/60 ml-3 space-y-6">
            {milestones.map((ms, i) => (
                <li key={ms.id} className="ml-6">
                    {/* Dot */}
                    <span
                        className={`
              absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background text-xs font-bold
              ${ms.status === 'delivered' ? 'bg-emerald-500 text-background' : 'bg-muted text-muted-foreground'}
            `}
                    >
                        {i + 1}
                    </span>

                    <div className="glass rounded-lg p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                            <h4 className="font-semibold text-sm">{ms.title}</h4>
                            <StatusBadge status={ms.status} />
                        </div>

                        <p className="text-xs text-muted-foreground">{ms.description}</p>

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>Target: <strong className="text-foreground">{formatUSD(ms.targetAmount)}</strong></span>

                            {ms.proofCid && (
                                <span>Proof CID: <code className="text-primary">{ms.proofCid}</code></span>
                            )}

                            {ms.txHash && (
                                <a
                                    href={`https://explorer.solana.com/tx/${ms.txHash}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    {shortenHash(ms.txHash)} ↗
                                </a>
                            )}

                            {ms.approvedAt && (
                                <span>Released: {new Date(ms.approvedAt).toLocaleDateString()}</span>
                            )}
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    )
}
