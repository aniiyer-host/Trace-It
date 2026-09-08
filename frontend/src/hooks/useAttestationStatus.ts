import { useState, useEffect, useCallback } from 'react'
import { useDonationStore } from '@/store/donationStore'

export function useAttestationStatus(donationId: string) {
  const [status, setStatus] = useState<'pending' | 'receipt_confirmed' | 'delivery_confirmed' | null>(null)
  const [loading, setLoading] = useState(false)
  const { getAttestationStatus } = useDonationStore()

  const fetchStatus = useCallback(async () => {
    if (!donationId) return
    setLoading(true)
    try {
      const attestationStatus = await getAttestationStatus(donationId)
      setStatus(attestationStatus ?? null)
    } catch (error) {
      console.error('Failed to fetch attestation status:', error)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [donationId, getAttestationStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return { status, loading, refetch: fetchStatus }
}