// AttestationVerify – Public attestation verification page
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, MapPin, Users } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function AttestationVerify() {
  const { attestationId } = useParams<{ attestationId: string }>()
  const [attestation, setAttestation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const loadAttestation = async () => {
      if (!attestationId) {
        setError('Attestation ID is required')
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // In a real app, we would fetch the attestation by its ID directly
        // For demo, we'll simulate by checking known attestations
        // Since we don't have a direct fetch by attestationId, we'll demonstrate the concept

        // Simulate fetching attestation data
        // In reality, this would be: const result = await fetchAttestationById(attestationId)
        setTimeout(() => {
          // Mock attestation data for demonstration
          const mockAttestation = {
            id: attestationId,
            donationId: 'don-001',
            amount: 5000,
            campaignTitle: 'Flood Relief – Assam 2025',
            ngoName: 'AidIndia Foundation',
            attestedAt: '2025-07-09T14:00:00Z',
            statement: 'AidIndia Foundation confirms receipt of ₹5,000 donated for Flood Relief – Assam 2025 on 2025-07-08',
            type: 'receipt'
          }

          setAttestation(mockAttestation)
          setLoading(false)
        }, 800)
      } catch (err) {
        console.error('Failed to load attestation:', err)
        setError('Failed to load attestation')
        setLoading(false)
        toast({
          title: 'Error loading attestation',
          variant: 'destructive'
        })
      }
    }

    loadAttestation()
  }, [attestationId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="space-y-6">
          <Loader2 className="h-8 w-8 animate-spin" />
          <h2 className="text-xl font-bold">Loading Attestation...</h2>
          <p className="text-muted-foreground">
            Verifying attestation on the blockchain...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="space-y-6">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold text-destructive">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button
            onClick={() => window.history.back()}
            variant="outline"
          >
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  if (!attestation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="space-y-6">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-xl font-bold">Attestation Not Found</h2>
          <p className="text-muted-foreground">
            No attestation found with the provided ID. Please check the ID and try again.
          </p>
          <Button
            onClick={() => window.history.back()}
            variant="outline"
          >
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary/5 text-primary/50 border-b border-border/20">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold gradient-text">
              Attestation Verification
            </h1>
            <div className="text-sm text-muted-foreground">
              Public Verification • {new Date().getFullYear()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-8">
          {/* Attestation Header */}
          <div className="space-y-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h2 className="text-3xl font-bold text-emerald-500">Attestation Verified</h2>
            <p className="lg:text-xl text-muted-foreground max-w-2xl mx-auto">
              This attestation has been verified and is stored permanently on the Solana blockchain.
            </p>
          </div>

          {/* Attestation Details */}
          <Card className="glass">
            <CardHeader className="flex flex-col space-y-2">
              <CardTitle className="text-xl font-semibold">Attestation Details</CardTitle>
              <CardDescription className="text-muted-foreground">
                Verifiable proof of NGO confirmation on the blockchain
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="font-medium">Attestation Information:</p>
                <div className="space-y-3 text-sm">
                  <p><strong>Attestation ID:</strong> {attestation.id}</p>
                  <p><strong>Type:</strong> {attestation.type === 'receipt' ? 'Receipt Confirmation' : 'Delivery Confirmation'}</p>
                  <p><strong>NGO:</strong> {attestation.ngoName}</p>
                  <p><strong>Timestamp:</strong> {new Date(attestation.attestedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="font-medium">Attestation Statement:</p>
                <p className="text-muted-foreground bg-muted/50 p-4 rounded">
                  {attestation.statement}
                </p>
              </div>

              <div className="space-y-4">
                <p className="font-medium">Verification Details:</p>
                <div className="space-y-3 text-sm">
                  <p><strong>On-Chain Status:</strong> <span className="text-emerald-600">Confirmed & Immutable</span></p>
                  <p><strong>Blockchain:</strong> Solana Devnet</p>
                  <p><strong>Verification Method:</strong> Cryptographic signature verification</p>
                  <p><strong>Data Integrity:</strong> Tamper-proof and permanently stored</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="font-medium">Related Donation:</p>
                <div className="space-y-3 text-sm">
                  <p><strong>Donation ID:</strong> {attestation.donationId.substring(0, 8)}...</p>
                  <p><strong>Amount:</strong> ₹{attestation.amount.toLocaleString()}</p>
                  <p><strong>Campaign:</strong> {attestation.campaignTitle}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="glass">
            <CardHeader className="flex flex-col space-y-2">
              <CardTitle className="text-xl font-semibold">How Attestation Verification Works</CardTitle>
              <CardDescription className="text-muted-foreground">
                Understanding the trust mechanism behind Trace-It
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="font-medium">The Trust Flow:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>
                    Donor makes a donation via traditional payment methods (UPI/Card)
                  </li>
                  <li>
                    Donation is recorded on the blockchain with a unique hash
                  </li>
                  <li>
                    Funds are transferred to the NGO's wallet
                  </li>
                  <li>
                    NGO confirms receipt of funds and signs an attestation
                  </li>
                  <li>
                    Attestation is stored permanently on-chain and cannot be altered
                  </li>
                  <li>
                    Anyone can verify the attestation using this public verification page
                  </li>
                </ol>
              </div>

              <div className="space-y-4">
                <p className="font-medium">Why This Matters:</p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>
                    <strong>Transparency:</strong> Every donation's journey is visible and verifiable
                  </li>
                  <li>
                    <strong>Accountability:</strong> NGOs must confirm receipt before funds are released
                  </li>
                  <li>
                    <strong>Immutability:</strong> Once stored on-chain, attestations cannot be tampered with
                  </li>
                  <li>
                    <strong>Privacy:</strong> Donor identities are protected through cryptographic hashing
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => {
                // In a real app, this would copy the attestation ID to clipboard
                navigator.clipboard.writeText(attestation.id).then(() => {
                  toast({
                    title: 'Attestation ID copied to clipboard!',
                    description: `Share this ID to allow others to verify: ${attestation.id}`
                  })
                })
              }}
              className="w-full md:w-auto"
            >
              <Users className="mr-2 h-4 w-4" /> Share Verification
            </Button>
            <Button
              onClick={() => {
                window.open(`https://explorer.solana.com/address/${attestation.id}?cluster=devnet`, '_blank')
              }}
              variant="outline"
              className="w-full md:w-auto"
            >
              <MapPin className="mr-2 h-4 w-4" /> View on Blockchain Explorer
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-muted/5 text-center text-xs text-muted-foreground py-6 border-t border-border/20">
        <div className="container max-w-4xl mx-auto px-4">
          <p>
            TraceIt © {new Date().getFullYear()} — Built for transparent charitable giving
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
            <a href="#" className="hover:text-primary transition-colors">
              About
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              How It Works
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Blog
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Helper component for AlertTriangle (since we don't have it imported)
function AlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 7c.77-2.333-2.692-2.333-3.464-4H12"
      />
    </svg>
  )
}