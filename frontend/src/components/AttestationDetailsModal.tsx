import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AttestationDetailsModalProps {
  donationId: string;
  attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed';
  onClose: () => void;
}

export default function AttestationDetailsModal({
  donationId,
  attestationStatus,
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
          description: 'The NGO has confirmed receipt of your donation. This confirmation is stored permanently on the blockchain and cannot be tampered with.',
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
          description: 'The NGO has confirmed both receipt and delivery of the funds to the intended beneficiaries.',
          steps: [
            'Donation recorded on blockchain',
            'Funds transferred to NGO wallet',
            'NGO confirmed receipt of funds',
            'NGO confirmed delivery to beneficiaries',
            'Delivery attestation stored on-chain'
          ]
        }
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

            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Donation ID:</strong> {donationId.substring(0, 8)}...
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Timestamp:</strong> {new Date().toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                Once the NGO confirms receipt, this will be permanently recorded on-chain.
              </p>
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