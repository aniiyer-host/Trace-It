// Campaign card shown on the Home page and Donor Dashboard
import { ExternalLink, Users } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Campaign } from '@/types'
import { formatUSD, cn } from '@/lib/utils'

const CATEGORY_COLOURS: Record<Campaign['category'], string> = {
    disaster: 'bg-red-500/20 text-red-400 border-red-500/30',
    education: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    health: 'bg-green-500/20 text-green-400 border-green-500/30',
    environment: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

interface Props {
    campaign: Campaign
    onDonate?: (campaign: Campaign) => void
    onView?: (campaign: Campaign) => void
    compact?: boolean
}

export function DonationCard({ campaign, onDonate, onView, compact = false }: Props) {
    const pct = Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100))
    const isFunded = pct >= 100

    return (
        <Card className={cn('glass hover:border-primary/40 transition-all duration-300 animate-fade-in', compact && 'text-sm')}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className={cn('leading-tight', compact ? 'text-base' : 'text-lg')}>
                        {campaign.title}
                    </CardTitle>
                    <Badge
                        className={cn('shrink-0 border text-xs', CATEGORY_COLOURS[campaign.category])}
                        variant="outline"
                    >
                        {campaign.category}
                    </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{campaign.ngo}</p>
            </CardHeader>

            <CardContent className="space-y-3">
                {!compact && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description}</p>
                )}

                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Raised</span>
                        <span className="font-semibold">
                            {formatUSD(campaign.raisedAmount)}{' '}
                            <span className="text-muted-foreground font-normal">/ {formatUSD(campaign.targetAmount)}</span>
                        </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-right mt-1 text-muted-foreground">{pct}% funded</p>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {campaign.milestones.length} milestones
                </div>
            </CardContent>

            <CardFooter className="gap-2 pt-0">
                {onDonate && !isFunded && (
                    <Button size="sm" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/80" onClick={() => onDonate(campaign)}>
                        Donate
                    </Button>
                )}
                {isFunded && (
                    <Badge className="flex-1 justify-center py-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border">
                        ✓ Fully Funded
                    </Badge>
                )}
                {onView && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => onView(campaign)}>
                        <ExternalLink className="h-3 w-3" /> Track
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
