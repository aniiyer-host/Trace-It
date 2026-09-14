import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AttestationDetailsModalProps {
  donationId: string;
  attestationStatus: string;
  amount?: number;
  campaignTitle?: string;
  confirmedAt?: string;
  donationDate?: string;
  onClose: () => void;
}

export default function AttestationDetailsModal({
  donationId,
  attestationStatus,
  amount,
  campaignTitle,
  confirmedAt,
  donationDate,
  onClose,
}: AttestationDetailsModalProps) {
  const getAttestationDetails = () => {
    switch (attestationStatus) {
      case 'pending':
        return {
          title: 'Awaiting NGO Confirmation',
          description: 'Your donation has been received and is pending confirmation from the NGO. Once confirmed, the receipt will be recorded on-chain.',
          steps: [
            'Donation recorded on blockchain',
            'Funds transferred to NGO wallet',
            'Awaiting NGO confirmation of receipt',
            'Once confirmed, attestation stored on-chain'
          ]
        }
      case 'receipt_confirmed':
        return {
          title: 'NGO Confirmed Receipt',
          description: 'NGO has confirmed receipt of funds.',
          steps: [
            'Donation recorded on blockchain',
            'Funds transferred to NGO wallet',
            'NGO confirmed receipt of funds',
            'Attestation stored on-chain (immutable)'
          ]
        }
      case 'delivery_confirmed':
        return {
          title: 'Delivery Confirmed',
          description: 'NGO has confirmed delivery to beneficiary.',
          steps: [
            'Donation recorded on blockchain',
            'Funds transferred to NGO wallet',
            'NGO confirmed receipt of funds',
            'NGO confirmed delivery to beneficiaries',
            'Delivery attestation stored on-chain'
          ]
        }
      default:
        return { title: 'Unknown Status', description: '', steps: [] }
    }
  }

  const { title, description, steps } = getAttestationDetails()

  // Simple modal implementation using Card components
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-96 max-w-xs mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
        >
          ✕
        </button>
        <CardHeader className="p-6">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <CardDescription className="text-sm text-muted-foreground">
              {description}
            </CardDescription>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Verification Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>

            <div className="mt-4 pt-4 border-t space-y-1">
              <p className="text-xs text-muted-foreground">
                <strong>Donation ID:</strong> {donationId.substring(0, 8)}...
              </p>
              {amount !== undefined && (
                <p className="text-xs text-muted-foreground">
                  <strong>Amount:</strong> ₹{amount.toLocaleString()}
                </p>
              )}
              {campaignTitle && (
                <p className="text-xs text-muted-foreground">
                  <strong>Campaign / NGO:</strong> {campaignTitle}
                </p>
              )}
              {attestationStatus === 'pending' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    <strong>Donation Date:</strong> {donationDate ? new Date(donationDate).toLocaleDateString() : new Date().toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Once the NGO confirms receipt, this will be permanently recorded on-chain.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <strong>Confirmed Date:</strong> {confirmedAt ? new Date(confirmedAt).toLocaleDateString() : 'Unknown'}
                </p>
              )}
            </div>
          </div>
        </CardContent>
        <div className="flex justify-end p-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/50 rounded"
          >
            Close
          </button>
        </div>
      </Card>
    </div>
  )
}