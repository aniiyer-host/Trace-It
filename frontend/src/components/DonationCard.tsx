import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Campaign } from '@/types'
import { MapPin, Target, ExternalLink } from 'lucide-react'

interface DonationCardProps {
    campaign: Campaign
    onDonate?: (campaign: Campaign) => void
    onView?: (campaign: Campaign) => void
    compact?: boolean
    glass?: boolean // Legacy prop for older dashboards, but adapted for new bento style
}

export function DonationCard({ campaign, onDonate, onView, compact = false, glass = false }: DonationCardProps) {
    const isFunded = campaign.raisedAmount >= campaign.targetAmount
    const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100))

    return (
        <Card className={cn(
            'group overflow-hidden transition-all duration-500',
            glass ? 'glass hover:border-primary/40' : 'bg-card text-card-foreground border-border shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] rounded-[2.5rem]',
            compact && 'text-sm'
        )}>
            {/* Image Container with scale effect */}
            <div className={cn("relative overflow-hidden bg-muted", compact ? 'h-32' : 'h-56')}>
                {campaign.imageUrl ? (
                    <img 
                        src={campaign.imageUrl} 
                        alt={`Campaign image for ${campaign.title}`} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 bg-muted">
                        <Target className="w-12 h-12 stroke-[1]" />
                    </div>
                )}
                <div className="absolute top-4 right-4">
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur-md text-foreground border-none font-semibold px-3 py-1 shadow-sm">
                        {campaign.category}
                    </Badge>
                </div>
            </div>

            <CardHeader className={cn("space-y-3", glass ? '' : 'px-8 pt-8 pb-4')}>
                <h3 className="font-bold text-2xl tracking-tight text-foreground leading-snug text-balance line-clamp-2">
                    {campaign.title}
                </h3>
                <div className="flex items-center text-muted-foreground text-sm font-medium">
                    <MapPin className="h-4 w-4 mr-1.5 opacity-70" />
                    {campaign.ngoName}
                </div>
            </CardHeader>

            <CardContent className={cn("space-y-6", glass ? '' : 'px-8 pb-8')}>
                <p className="text-muted-foreground leading-relaxed text-pretty line-clamp-3">
                    {campaign.description}
                </p>

                <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-sm items-end">
                        <span className="font-bold text-foreground text-lg tabular-nums tracking-tight">₹{campaign.raisedAmount.toLocaleString()}</span>
                        <span className="text-muted-foreground font-medium tracking-tight">of ₹{campaign.targetAmount.toLocaleString()}</span>
                    </div>
                    <Progress value={progress} className="h-2 bg-muted" indicatorClassName={cn("transition-all duration-1000", isFunded ? 'bg-emerald-500' : 'bg-foreground')} />
                </div>
            </CardContent>

            <CardFooter className={cn("gap-3 pt-0", glass ? '' : 'px-8 pb-8')}>
                {onDonate && !isFunded && (
                    <Button 
                        size="lg" 
                        className="flex-1 bg-foreground text-background hover:bg-foreground/90 rounded-full font-bold shadow-none active:scale-[0.98] transition-all" 
                        onClick={() => onDonate(campaign)}
                    >
                        Donate
                    </Button>
                )}
                {isFunded && (
                    <div className="flex-1 flex justify-center py-3 bg-emerald-500/10 rounded-full text-emerald-600 font-bold border border-emerald-500/20">
                        ✓ Fully Funded
                    </div>
                )}
                {onView && (
                    <Button 
                        size="lg" 
                        variant="outline" 
                        className="gap-2 rounded-full border-border text-foreground hover:bg-muted hover:text-foreground font-bold active:scale-[0.98] transition-all" 
                        onClick={() => onView(campaign)}
                    >
                        <ExternalLink className="h-4 w-4" /> Track
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}