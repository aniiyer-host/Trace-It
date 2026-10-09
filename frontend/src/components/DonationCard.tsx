import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { Campaign } from '@/types'
import { MapPin, Target, ExternalLink } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'

interface DonationCardProps {
    campaign: Campaign
    onDonate?: (campaign: Campaign) => void
    onView?: (campaign: Campaign) => void
    compact?: boolean
}

export function DonationCard({ campaign, onDonate, onView, compact = false }: DonationCardProps) {
    const isFunded = Number(campaign.raisedAmount) >= Number(campaign.targetAmount)
    const progress = Math.min(100, Math.round((Number(campaign.raisedAmount) / Number(campaign.targetAmount)) * 100))

    return (
        <Card className={cn(
            'overflow-hidden bg-card text-card-foreground border border-border shadow-sm rounded-2xl',
            compact && 'text-sm'
        )}>
            {/* Image Container with scale effect */}
            <div className={cn("relative overflow-hidden bg-muted", compact ? 'h-32' : 'h-56')}>
                {campaign.imageUrl ? (
                    <img 
                        src={campaign.imageUrl} 
                        alt={`Campaign image for ${campaign.title}`} 
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 bg-muted">
                        <Target className="w-12 h-12 stroke-[1]" />
                    </div>
                )}
            </div>

            <CardHeader className="space-y-3 px-6 pt-6 pb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {campaign.category}
                </p>
                <h3 className="font-bold text-xl tracking-tight text-foreground leading-snug text-balance line-clamp-2">
                    {campaign.title}
                </h3>
                <div className="flex items-center text-muted-foreground text-sm font-medium">
                    <MapPin className="h-4 w-4 mr-1.5 opacity-70" />
                    {campaign.ngoName}
                </div>
            </CardHeader>

            <CardContent className="space-y-6 px-6 pb-6">
                <p className="text-muted-foreground leading-relaxed text-pretty line-clamp-3">
                    {campaign.description}
                </p>

                <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-sm items-end">
                        <span className="font-bold text-foreground text-lg tabular-nums tracking-tight">₹{Number(campaign.raisedAmount).toLocaleString()}</span>
                        <span className="text-muted-foreground font-medium tracking-tight">of ₹{Number(campaign.targetAmount).toLocaleString()}</span>
                    </div>
                    <Progress value={progress} className="h-2 bg-muted" indicatorClassName="transition-all duration-1000 bg-primary" />
                </div>
            </CardContent>

            <CardFooter className="gap-3 pt-0 px-6 pb-6">
                {onDonate && !isFunded && (
                    <Button 
                        size="lg" 
                        className="flex-1 bg-foreground text-background hover:bg-foreground/90 rounded-xl font-bold shadow-none"
                        onClick={() => onDonate(campaign)}
                    >
                        Donate
                    </Button>
                )}
                {isFunded && (
                    <div className="flex-1 flex justify-center py-2.5">
                        <StatusBadge status="FULLY FUNDED" />
                    </div>
                )}
                {onView && (
                    <Button 
                        size="lg" 
                        variant="outline" 
                        className="gap-2 rounded-xl border-border text-foreground hover:bg-muted hover:text-foreground font-bold"
                        onClick={() => onView(campaign)}
                    >
                        <ExternalLink className="h-4 w-4" /> Track
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}