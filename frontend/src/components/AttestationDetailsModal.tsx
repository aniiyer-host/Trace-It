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
          description: 'Your donation has been recorded on the blockchain and is awaiting confirmation from the NGO that they have received the funds.',
          steps: [
            '1. Donation recorded on blockchain',
            '2. Funds transferred to NGO wallet',
            '3. Awaiting NGO confirmation of receipt',
            '4. Once confirmed, attestation stored on-chain'
          ]
        }
      case 'receipt_confirmed':
        return {
          title: 'NGO Confirmed Receipt',
          description: 'The NGO has confirmed receipt of your donation. This confirmation is stored permanently on the blockchain and cannot be tampered with.',
          steps: [
            '1. Donation recorded on blockchain',
            '2. Funds transferred to NGO wallet',
            '3. NGO confirmed receipt of funds',
            '4. Attestation stored on-chain (immutable)'
          ]
        }
      case 'delivery_confirmed':
        return {
          title: 'Delivery Confirmed',
          description: 'The NGO has confirmed both receipt and delivery of the funds to the intended beneficiaries.',
          steps: [
            '1. Donation recorded on blockchain',
            '2. Funds transferred to NGO wallet',
            '3. NGO confirmed receipt of funds',
            '4. NGO confirmed delivery to beneficiaries',
            '5. Delivery attestation stored on-chain'
          ]
        }
    }
  }

  const { title, description, steps } = getAttestationDetails()

  // Simple modal implementation using Card components
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-96 max-w-xs mx-4">
        <CardHeader className="flex items-start justify-between p-6">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            ✕
          </button>
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
                <strong>Attestation ID:</strong> att-{donationId.substring(0, 8)}...
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Timestamp:</strong> {new Date().toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                This attestation is stored on the Solana blockchain and can be verified by anyone.
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