// ProofUploadDialog – NGO uploads milestone completion proof (mock IPFS CID)
// TODO: Replace mock CID generation with real IPFS/NFT.Storage upload
import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { uploadMilestoneProof } from '@/services/mockApi'
import { mockTxHash } from '@/lib/utils'
import type { Milestone } from '@/types'

interface Props {
    milestone: Milestone | null
    open: boolean
    onClose: () => void
    onSuccess: (ms: Milestone) => void
}

export function ProofUploadDialog({ milestone, open, onClose, onSuccess }: Props) {
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const handleUpload = async () => {
        if (!milestone) return
        if (!description.trim()) {
            toast({ title: 'Add a proof description', variant: 'destructive' })
            return
        }
        setLoading(true)
        try {
            // Generate deterministic mock IPFS CID
            // TODO: Replace with await nftStorage.store({ description, files: [...] })
            const cid = `Qm${mockTxHash(milestone.id + description).slice(0, 44)}`
            const updated = await uploadMilestoneProof({ milestoneId: milestone.id, description, cid })
            onSuccess(updated)
            toast({ title: 'Proof uploaded!', description: `CID: ${cid.slice(0, 20)}…` })
            setDescription('')
            onClose()
        } catch {
            toast({ title: 'Upload failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="glass border-border/60 max-w-md">
                <DialogHeader>
                    <DialogTitle className="gradient-text">Upload Milestone Proof</DialogTitle>
                    <DialogDescription>{milestone?.title}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* File drop zone (visual only – real upload needs backend) */}
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center text-muted-foreground hover:border-primary/50 transition-colors">
                        <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Drag photos / receipts here</p>
                        <p className="text-xs mt-1 opacity-60">
                            {/* TODO: wire to real <input type="file"> + IPFS upload */}
                            (Simulated in demo — no real file required)
                        </p>
                    </div>

                    <textarea
                        rows={3}
                        placeholder="Describe what was achieved and how funds were used…"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    />

                    <Button className="w-full" onClick={handleUpload} disabled={loading}>
                        {loading
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading…</>
                            : 'Submit Proof to Blockchain'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
