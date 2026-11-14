/** Legacy queue writes are retired. Historical rows remain inert for audit/migration evidence. */
export async function addToBlockchainRetryQueue(data: {
  donationId: string;
  error: string;
  retryCount: number;
  operationType?: 'RECORD_DONATION' | 'UPDATE_STATUS' | 'NGO_REGISTRATION' | 'COHORT_REGISTRATION' | 'DISBURSEMENT_RECORDING';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  void data;
  console.warn('[BlockchainRetryQueue] retired; legacy queue writes are disabled');
}
