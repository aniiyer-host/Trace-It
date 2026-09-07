import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

interface AttestationToastProps {
  type: 'request' | 'receipt' | 'delivery' | 'approved' | 'rejected'
  message: string
  donationId?: string
  attestationId?: string
}

export default function AttestationToast({
  type,
  message,
  donationId,
  attestationId,
}: AttestationToastProps) {
  const { toast } = useToast()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!shown) {
      setShown(true)

      let title = 'Attestation Update'
      let description = message
      let variant: 'default' | 'destructive' = 'default'

      switch (type) {
        case 'request':
          title = 'Attestation Requested'
          variant = 'default'
          break
        case 'receipt':
          title = 'Receipt Confirmed'
          variant = 'default'
          break
        case 'delivery':
          title = 'Delivery Confirmed'
          variant = 'default'
          break
        case 'approved':
          title = 'Attestation Approved'
          // Use the success toast variant from the hook
          break
        case 'rejected':
          title = 'Attestation Rejected'
          variant = 'destructive'
          break
        default:
          title = 'Attestation Update'
          variant = 'default'
          break
      }

      // For approved attestations, use the success toast variant
      if (type === 'approved') {
        const { success } = useToast()
        success({
          title,
          description,
          // Add toast action to view details if IDs are provided
          action: donationId || attestationId ? (
            <button
              onClick={() => {
                // Navigate to attestation verification or donation details
                if (attestationId) {
                  window.open(`/attestation/verify/${attestationId}`, '_blank')
                }
              }}
              className="btn-link text-sm hover:text-primary"
            >
              View Details
            </button>
          ) : undefined,
        })
        return
      }

      toast({
        title,
        description,
        variant: variant,
        // Add toast action to view details if IDs are provided
        action: donationId || attestationId ? (
          <button
            onClick={() => {
              // Navigate to attestation verification or donation details
              if (attestationId) {
                window.open(`/attestation/verify/${attestationId}`, '_blank')
              }
            }}
            className="btn-link text-sm hover:text-primary"
          >
            View Details
          </button>
        ) : undefined,
      })
    }
  }, [type, message, donationId, attestationId, shown, toast])

  return null // This component doesn't render anything, it just triggers the toast
}