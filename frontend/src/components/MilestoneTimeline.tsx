// MilestoneTimeline – Enhanced vertical progress tracker with better visualizations
import { ExternalLink, Loader2 } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Milestone } from '@/types'

interface Props {
    milestones: Milestone[]
    className?: string
}

export function MilestoneTimeline({ milestones, className }: Props) {
    return (
        <div className={className}>
            <ol className="relative border-l border-border/60 ml-3 space-y-6">
                {milestones.map((ms, i) => {
                    const isLast = i === milestones.length - 1
                    const hasProof = Boolean(ms.proofSubmittedAt || ms.fieldReportUrl)
                    return (
                        <li key={ms.id} className="ml-6">
                            {/* Progress line (dashed for future milestones) */}
                            {!isLast && (
                                <div className={`
                                    absolute -left-1.5 top-8 bottom-0 w-px
                                    ${ms.status === 'delivered' ? 'border-trust-green' : 'border-dashed border-border/50'}
                                `} />
                            )}

                            {/* Dot */}
                            <span
                                className={`
                                    absolute -left-2.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background text-xs font-bold
                                    ${ms.status === 'delivered' ? 'bg-trust-green text-background' :
                                      ms.status === 'disbursed' ? 'bg-primary text-primary-foreground' :
                                      ms.status === 'allocated' ? 'bg-primary text-primary-foreground' :
                                      'bg-muted text-muted-foreground'}
                                `}
                            >
                                {i + 1}
                            </span>

                            <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-3">
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-sm">{ms.title}</h4>
                                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{ms.description}</p>
                                    </div>
                                    <StatusBadge status={ms.status} className="ml-2" />
                                </div>

                                <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="flex flex-wrap gap-4">
                                        <span>Target: <strong className="text-foreground">{formatUSD(ms.targetAmount)}</strong></span>

                                        {hasProof && (
                                            <span className="text-foreground">Proof submitted</span>
                                        )}

                                        {ms.txHash && (
                                            <a
                                                href={`https://explorer.solana.com/tx/${ms.txHash}?cluster=devnet`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-primary hover:underline"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                {shortenHash(ms.txHash)}
                                            </a>
                                        )}

                                        {ms.approvedAt && (
                                            <span>
                                                Released: {new Date(ms.approvedAt).toLocaleDateString()}
                                            </span>
                                        )}

                                        {ms.disbursedAt && (
                                            <span>
                                                Disbursed: {new Date(ms.disbursedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>

                                    {/* Loading state for demo purposes */}
                                    {ms.status === 'allocated' && !hasProof && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            <span className="text-sm text-primary">Awaiting proof submission...</span>
                                        </div>
                                    )}

                                    {(ms.disbursementStatus === 'PENDING' || ms.disbursementStatus === 'APPROVED' || (!ms.disbursementStatus && ms.status === 'disbursed' && !ms.approvedAt)) && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            <span className="text-sm text-primary">Awaiting fund transfer...</span>
                                        </div>
                                    )}

                                    {ms.disbursementStatus === 'SETTLED' && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-trust-green" />
                                            <span className="text-sm text-trust-green font-medium">Funds transferred successfully</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </li>
                    )
                })}
                {/* Extra space at the bottom for visual balance */}
                {!milestones.some(m => m.status === 'delivered') && (
                    <li className="ml-6 h-16">
                        <span className="absolute -left-2.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background">
                            <span className="h-4 w-4 bg-muted/50 rounded-full" />
                        </span>
                    </li>
                )}
            </ol>
        </div>
    )
}