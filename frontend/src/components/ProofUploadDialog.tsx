// ProofUploadDialog – Enhanced NGO proof upload with better UX and validation
import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { useToast } from '@/hooks/use-toast'
import { uploadMilestoneProof } from '@/services/mockApi'
import { mockTxHash, formatUSD } from '@/lib/utils'
import type { Milestone, Campaign } from '@/types'

interface ProofUploadData {
    milestone: Milestone
    campaign: Campaign | null
}

interface Props {
    data: ProofUploadData | null
    open: boolean
    onClose: () => void
    onSuccess: (ms: Milestone) => void
}

export function ProofUploadDialog({ data, open, onClose, onSuccess }: Props) {
    if (!data) return null

    const milestone = data.milestone
    const campaign = data.campaign

    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const { toast } = useToast()

    const handleUpload = async () => {
        if (!milestone) return
        if (!description.trim()) {
            toast({ title: 'Add a proof description', variant: 'destructive' })
            return
        }
        setLoading(true)
        setUploadProgress(0)

        try {
            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90))
            }, 300)

            // Generate deterministic mock IPFS CID
            const cid = `Qm${mockTxHash(milestone.id + description).slice(0, 44)}`

            // Complete progress
            setUploadProgress(100)
            setTimeout(() => {
                clearInterval(progressInterval)
            }, 500)

            const updated = await uploadMilestoneProof({ milestoneId: milestone.id, description, cid })
            onSuccess(updated)
            toast({
                title: 'Proof uploaded!',
                description: `CID: ${cid.slice(0, 20)}…`
            })
            setDescription('')
            onClose()
        } catch (error) {
            console.error(error)
            toast({ title: 'Upload failed', variant: 'destructive' })
        } finally {
            setLoading(false)
            setUploadProgress(0)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="glass border-border/60 max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="gradient-text text-xl">Upload Milestone Proof</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        {milestone?.title} • {campaign?.ngo}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Milestone Info Card */}
                    <div className="glass rounded-lg p-5 border border-border/40">
                        <div className="flex flex-col space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-lg">{milestone?.title}</h3>
                                <StatusBadge status={milestone?.status ?? 'pending'} className="ml-auto" />
                            </div>
                            <p className="text-sm text-muted-foreground">{milestone?.description}</p>
                            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                                <div>
                                    <span className="font-medium">Target Amount:</span>
                                    <span className="ml-2">{formatUSD(milestone?.targetAmount ?? 0)}</span>
                                </div>
                                <div>
                                    <span className="font-medium">Campaign:</span>
                                    <span className="ml-2">{campaign?.title}</span>
                                </div>
                                <div>
                                    <span className="font-medium">Status:</span>
                                    <span className="ml-2 capitalize">{milestone?.status}</span>
                                </div>
                                <div>
                                    <span className="font-medium">Milestone #:</span>
                                    <span className="ml-2">{milestone?.id}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Upload Section */}
                    <div className="space-y-4">
                        {/* File drop zone (enhanced visual) */}
                        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground hover:border-primary/50 transition-colors relative overflow-hidden">
                            <div className="absolute inset-0 -z-10">
                                <div className="w-full h-full bg-gradient-to-r from-primary/5 to-teal/5" />
                            </div>
                            <Upload className="h-10 w-10 mx-auto mb-4 opacity-60" />
                            <p className="text-sm font-medium">Drag & drop files here or click to browse</p>
                            <p className="text-xs mt-1 opacity-70">
                                Images, PDFs, documents supported (simulated in demo)
                            </p>
                            {/* Optional file input */}
                            <label
                                className="mt-3 flex items-center justify-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer"
                            >
                                Browse Files
                                <input
                                    type="file"
                                    accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            // In a real app, we'd process the files here
                                            // For demo, we'll just show a notification
                                            toast({
                                                title: `File selected: ${e.target.files[0].name}`,
                                                description: 'File upload simulated in demo mode'
                                            })
                                        }
                                    }}
                                />
                            </label>
                        </div>

                        {/* Upload Progress */}
                        {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="space-y-2">
                                <div className="w-full bg-muted/5 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-full transition_all duration-500"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground text-right mt-1">
                                    {`${uploadProgress}%`}
                                </p>
                            </div>
                        )}

                        {/* Description */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium block">
                                Proof Description
                            </label>
                            <textarea
                                rows={4}
                                placeholder="Describe what was achieved, how funds were used, and any relevant details..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {description.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    {description.length}/500 characters
                                </p>
                            )}
                        </div>

                        {/* Submit Button */}
                        <Button
                            className="w-full"
                            onClick={handleUpload}
                            disabled={loading || !description.trim()}
                        >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Uploading...
                                    </>
                                ) : (
                                    'Submit Proof to Blockchain'
                                )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}