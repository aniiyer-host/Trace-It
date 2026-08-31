# Phase 2 Implementation Plan: On-Chain Donation Recording + Webhook Integration

## Overview
This document provides detailed, step-by-step instructions for implementing the remaining tasks in Phase 2 of the Trace-It blockchain integration. Phase 2 focuses on completing the integration of the `blockchainService` into the actual backend donation flow, specifically wiring the service into the Razorpay webhook handler to record confirmed donations on-chain, implementing reliability mechanisms, and ensuring data consistency.

**Prerequisites:** Phase 1 must be fully completed and tested:
- Anchor program (`traceit`) deployed to Solana devnet
- `blockchainService.ts` and `blockchainInstance.ts` implemented and tested
- All backend tests passing
- Development environment properly configured

## Phase 2 Goals (Remaining Work)
1. Complete and enhance the Razorpay webhook integration with robust error handling
2. Implement a robust retry queue mechanism with background processor for failed Solana submissions
3. Verify and enhance public donation timeline API to display transaction hashes and explorer links
4. Complete status update hooks for all flow transitions (ALLOCATED, DISBURSED, DELIVERED)
5. Create a reconciliation script for orphaned records and status synchronization
6. Implement monitoring, logging, and alerting for blockchain operations

## Current State (What's Already Done)
Based on recent commits and file reviews:
- ✅ `backend/src/services/blockchainService.ts` created with core functionality
- ✅ `backend/src/services/blockchainInstance.ts` singleton factory created
- ✅ Initial webhook hook in `backend/src/routes/webhooks/razorpay.ts` (basic implementation)
- ✅ Database migration for `BlockchainRetryQueue` table created
- ✅ Basic retry queue helper function in webhook file
- ✅ Public donation API already selects `solanaTxHash` field
- ✅ Basic status update hook in admin disbursement approval

## Detailed Implementation Steps

### 1. Complete Webhook Integration with Robust Error Handling

#### Location
File: `backend/src/routes/webhooks/razorpay.ts`

#### Current State
The file already has a basic blockchain integration section but needs enhancement for:
- Better error classification and handling
- Improved retry queue integration
- More comprehensive audit logging
- Proper timeout handling

#### Enhancement Instructions
Replace the current blockchain integration section (lines ~211-298) with:

```typescript
// BLOCKCHAIN INTEGRATION: Record donation on-chain after successful payment
let blockchainService: BlockchainService | null = null;
try {
    blockchainService = await getBlockchainService();
    
    // Prepare donation data for on-chain recording
    const donationData = {
        donationId: donation.id, // UUID from Postgres
        donorUserId: donation.donorId, // Raw user ID (will be hashed by service)
        ngoId: donation.ngoId,
        campaignId: donation.campaignId ?? '',
        amountInr: donation.amount.toNumber(), // Amount in INR
        currency: 'INR',
        timestamp: new Date() // Current timestamp
    };

    // Record on-chain (idempotent - safe to call multiple times)
    const blockchainResult = await blockchainService.recordDonation(donationData);

    if (blockchainResult.success) {
        // Store transaction hash in donation record
        await prisma.donation.update({
            where: { id: donation.id },
            data: { solanaTxHash: blockchainResult.txHash }
        });

        // Log success to audit trail
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECORD_SUCCESS',
            metadata: {
                donationId: donation.id,
                transactionHash: blockchainResult.txHash
            },
            ipAddress: req.ip,
        });

        console.info(`Blockchain recording successful for donation ${donation.id}: ${blockchainResult.txHash}`);
    } else {
        // Handle recording failure - add to retry queue
        await addToBlockchainRetryQueue({
            donationId: donation.id,
            error: blockchainResult.error ?? 'Unknown blockchain error',
            operationType: 'RECORD_DONATION',
            retryCount: 0
        });

        // Log failure to audit trail
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECORD_FAILED',
            metadata: {
                donationId: donation.id,
                error: blockchainResult.error
            },
            ipAddress: req.ip,
        });

        console.error(`Blockchain recording failed for donation ${donation.id}: ${blockchainResult.error}`);
    }
} catch (error) {
    // Handle service initialization or other unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Blockchain service error for donation ${donation.id}:`, error);

    // Add to retry queue for service-level failures
    if (blockchainService) {
        await addToBlockchainRetryQueue({
            donationId: donation.id,
            error: errorMessage,
            operationType: 'SERVICE_ERROR',
            retryCount: 0
        });
    }

    await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: donation.id,
        action: 'BLOCKCHAIN_SERVICE_ERROR',
        metadata: {
            donationId: donation.id,
            error: errorMessage
        },
        ipAddress: req.ip,
    });
} finally {
    // Clean up service reference
    blockchainService = null;
}

return res.status(200).json({ received: true });
```

### 2. Implement Robust Retry Queue Mechanism

#### Step 2.1: Create Blockchain Retry Processor Service

#### Location
Create new file: `backend/src/services/blockchainRetryProcessor.ts`

```typescript
import { getBlockchainService } from './blockchainInstance';
import { writeAuditLog } from './auditLogService';
import { prisma } from '../db/prisma';
import { AuditActorType } from '../../../generated/prisma/enums';

export class BlockchainRetryProcessor {
    private readonly batchSize = 10;
    private readonly baseDelayMs = 5000; // 5 seconds base delay
    private readonly maxRetries = 5;
    private isRunning = false;
    private readonly operationTypes = ['RECORD_DONATION', 'UPDATE_STATUS'] as const;

    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }
        
        this.isRunning = true;
        console.log('Blockchain retry processor started');
        
        while (this.isRunning) {
            try {
                await this.processRetryQueue();
                await new Promise(resolve => setTimeout(resolve, this.baseDelayMs));
            } catch (error) {
                console.error('Error in blockchain retry processor:', error);
                await new Promise(resolve => setTimeout(resolve, this.baseDelayMs * 2)); // Longer delay on error
            }
        }
    }

    stop(): void {
        this.isRunning = false;
        console.log('Blockchain retry processor stopped');
    }

    private async processRetryQueue(): Promise<void> {
        // Get failed attempts that are ready for retry (exponential backoff)
        const retryItems = await prisma.blockchainRetryQueue.findMany({
            where: {
                AND: [
                    { 
                        OR: [
                            { retryCount: { lt: this.maxRetries } },
                            { lastAttempt: { lt: new Date(Date.now() - (this.baseDelayMs * Math.pow(2, Math.min(this.retryCount, 4)))) } }
                        ]
                    },
                    {
                        operationType: {
                            in: this.operationTypes
                        }
                    }
                ]
            },
            orderBy: { lastAttempt: 'asc' },
            take: this.batchSize
        });

        if (retryItems.length === 0) {
            return;
        }

        console.log(`Processing ${retryItems.length} blockchain retry items`);

        const blockchainService = await getBlockchainService();

        for (const item of retryItems) {
            try {
                // Fetch the donation to get current data
                const donation = await prisma.donation.findUnique({
                    where: { id: item.donationId }
                });

                if (!donation) {
                    // Donation no longer exists, remove from queue
                    await prisma.blockchainRetryQueue.delete({
                        where: { donationId: item.donationId }
                    });
                    continue;
                }

                // Skip if already has a transaction hash (successfully recorded elsewhere)
                if (item.operationType === 'RECORD_DONATION' && donation.solanaTxHash) {
                    await prisma.blockchainRetryQueue.delete({
                        where: { donationId: item.donationId }
                    });
                    continue;
                }

                // Process based on operation type
                if (item.operationType === 'RECORD_DONATION') {
                    await this.processRecordDonationRetry(item, donation, blockchainService);
                } else if (item.operationType === 'UPDATE_STATUS') {
                    await this.processUpdateStatusRetry(item, donation, blockchainService);
                }
            } catch (error) {
                // Handle unexpected errors
                await prisma.blockchainRetryQueue.update({
                    where: { id: item.id },
                    data: {
                        error: error.message,
                        retryCount: item.retryCount + 1,
                        lastAttempt: new Date(),
                        updatedAt: new Date()
                    }
                });

                console.error(`Unexpected error processing retry for donation ${item.donationId}:`, error);
            }
        }
    }

    private async processRecordDonationRetry(
        item: any, 
        donation: any, 
        blockchainService: BlockchainService
    ): Promise<void> {
        try {
            // Prepare donation data for on-chain recording
            const donationData = {
                donationId: donation.id,
                donorUserId: donation.donorId,
                ngoId: donation.ngoId,
                campaignId: donation.campaignId ?? '',
                amountInr: donation.amount.toNumber(),
                currency: 'INR',
                timestamp: new Date(donation.createdAt) // Use original donation timestamp
            };

            // Attempt to record on-chain
            const result = await blockchainService.recordDonation(donationData);

            if (result.success) {
                // Success! Update donation and remove from queue
                await prisma.donation.update({
                    where: { id: donation.id },
                    data: { solanaTxHash: result.txHash }
                });

                await prisma.blockchainRetryQueue.delete({
                    where: { id: item.id }
                });

                await writeAuditLog({
                    actorType: AuditActorType.SYSTEM,
                    entityType: 'donation',
                    entityId: donation.id,
                    action: 'BLOCKCHAIN_RETRY_SUCCESS',
                    metadata: {
                        donationId: donation.id,
                        transactionHash: result.txHash,
                        attemptNumber: item.retryCount + 1
                    },
                    ipAddress: 'retry-processor',
                });

                console.log(`Successfully recorded donation ${donation.id} on-chain via retry (attempt ${item.retryCount + 1}): ${result.txHash}`);
            } else {
                // Failed again, update retry count and error
                await prisma.blockchainRetryQueue.update({
                    where: { id: item.id },
                    data: {
                        error: result.error,
                        retryCount: item.retryCount + 1,
                        lastAttempt: new Date(),
                        updatedAt: new Date()
                    }
                });

                console.log(`Retry failed for donation ${donation.id} (attempt ${item.retryCount + 1}): ${result.error}`);
            }
        } catch (error) {
            await prisma.blockchainRetryQueue.update({
                where: { id: item.id },
                data: {
                    error: error.message,
                    retryCount: item.retryCount + 1,
                    lastAttempt: new Date(),
                    updatedAt: new Date()
                }
            });

            console.error(`Error processing record donation retry for ${donation.id}:`, error);
        }
    }

    private async processUpdateStatusRetry(
        item: any, 
        donation: any, 
        blockchainService: BlockchainService
    ): Promise<void> {
        try {
            // Parse the target status from metadata (would need to be stored)
            // For now, we'll need to enhance the retry queue to store target status
            // This is a simplified version - in practice you'd store the target status
            
            // Attempt to update status on-chain (using current DB status as target)
            const result = await blockchainService.updateDonationStatus(
                donation.id,
                donation.status // Assuming DB status is source of truth
            );

            if (result.success) {
                // Success! Remove from queue
                await prisma.blockchainRetryQueue.delete({
                    where: { id: item.id }
                });

                await writeAuditLog({
                    actorType: AuditActorType.SYSTEM,
                    entityType: 'donation',
                    entityId: donation.id,
                    action: 'BLOCKCHAIN_STATUS_UPDATE_RETRY_SUCCESS',
                    metadata: {
                        donationId: donation.id,
                        newStatus: donation.status,
                        transactionHash: result.txHash,
                        attemptNumber: item.retryCount + 1
                    },
                    ipAddress: 'retry-processor',
                });

                console.log(`Successfully updated donation ${donation.id} status on-chain via retry (attempt ${item.retryCount + 1}): ${result.txHash}`);
            } else {
                // Failed again, update retry count and error
                await prisma.blockchainRetryQueue.update({
                    where: { id: item.id },
                    data: {
                        error: result.error,
                        retryCount: item.retryCount + 1,
                        lastAttempt: new Date(),
                        updatedAt: new Date()
                    }
                });

                console.log(`Retry failed for donation ${donation.id} status update (attempt ${item.retryCount + 1}): ${result.error}`);
            }
        } catch (error) {
            await prisma.blockchainRetryQueue.update({
                where: { id: item.id },
                data: {
                    error: error.message,
                    retryCount: item.retryCount + 1,
                    lastAttempt: new Date(),
                    updatedAt: new Date()
                }
            });

            console.error(`Error processing status update retry for ${donation.id}:`, error);
        }
    }
}

// Start the processor when the module is imported in a long-running process
if (require.main === module) {
    const processor = new BlockchainRetryProcessor();
    processor.start().catch(console.error);
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        processor.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        processor.stop();
        process.exit(0);
    });
}

export default BlockchainRetryProcessor;
```

#### Step 2.2: Enhance the BlockchainRetryQueue Model

Update the Prisma schema to include additional fields for better retry management:

In `backend/prisma/schema.prisma`, add to the `BlockchainRetryQueue` model:
```prisma
model BlockchainRetryQueue {
  id        String   @id @default(uuid())
  donationId String
  error     String?
  operationType String // RECORD_DONATION or UPDATE_STATUS
  retryCount Int     @default(0)
  lastAttempt DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([donationId])
  @@index([lastAttempt])
}
```

Then run:
```bash
npx prisma migrate dev --name enhance_blockchain_retry_queue
npx prisma migrate deploy
```

#### Step 2.3: Import and Start Processor in Application Entry Point

#### Location
File: `backend/src/index.ts`

Add after app initialization:
```typescript
// Start blockchain retry processor
import BlockchainRetryProcessor from './services/blockchainRetryProcessor';

const retryProcessor = new BlockchainRetryProcessor();
retryProcessor.start().catch(console.error);

// Graceful shutdown handling
process.on('SIGINT', () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
});

process.on('SIGTERM', () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
});
```

### 3. Verify and Enhance Public Donation Timeline API

#### Location
File: `backend/src/routes/public.ts`

#### Enhancement
In the `getPublicDonationById` function (or similar), after fetching donation data, add explorer URL computation:

```typescript
// After fetching donation data
const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    // ... existing select ...
});

// Add explorer URL for easy viewing if transaction hash exists
const explorerUrl = donation.solanaTxHash
    ? `https://explorer.solana.com/tx/${donation.solanaTxHash}?cluster=${process.env.SOLANA_CLUSTER || 'devnet'}`
    : null;

// In the response, include this field
return res.json({
    // ... existing fields ...
    explorerUrl,
    solanaTxHash: donation.solanaTxHash
});
```

### 4. Complete Allocation/Disbursement Flow Hooks

#### Step 4.1: NGO Allocation Flow Hook

#### Location
File: `backend/src/services/statusService.ts` (or wherever allocation happens)

#### Implementation
After NGO allocates funds (changes donation status to ALLOCATED):
```typescript
// After updating donation status to ALLOCATED in DB
try {
    const blockchainService = await getBlockchainService();
    
    const result = await blockchainService.updateDonationStatus(
        donationId,
        2 // ALLOCATED status
    );

    if (result.success) {
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donationId,
            action: 'BLOCKCHAIN_STATUS_UPDATE_ALLOCATED',
            metadata: {
                donationId,
                newStatus: 2,
                transactionHash: result.txHash
            },
            ipAddress: 'allocation-service',
        });
        
        console.info(`Donation ${donationId} status updated to ALLOCATED on-chain: ${result.txHash}`);
    } else {
        // Add to retry queue for status update failure
        await addToBlockchainRetryQueue({
            donationId,
            error: result.error,
            operationType: 'UPDATE_STATUS',
            retryCount: 0,
            metadata: { targetStatus: 2 }
        });
        
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donationId,
            action: 'BLOCKCHAIN_STATUS_UPDATE_ALLOCATED_FAILED',
            metadata: {
                donationId,
                error: result.error
            },
            ipAddress: 'allocation-service',
        });
        
        console.error(`Failed to update donation ${donationId} status to ALLOCATED on-chain: ${result.error}`);
    }
} catch (error) {
    // Handle service errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await addToBlockchainRetryQueue({
        donationId,
        error: errorMessage,
        operationType: 'UPDATE_STATUS',
        retryCount: 0,
        metadata: { targetStatus: 2 }
    });
    
    await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: donationId,
        action: 'BLOCKCHAIN_SERVICE_ERROR_ALLOCATED',
        metadata: {
            donationId,
            error: errorMessage
        },
        ipAddress: 'allocation-service',
    });
    
    console.error(`Blockchain service error during allocation for donation ${donationId}:`, error);
}
```

#### Step 4.2: Disbursement Approval Flow Hook

#### Location
File: `backend/src/routes/admin.ts` (disbursement approval route)

#### Enhancement
Improve the existing basic hook to match the pattern above, adding proper retry queue handling and audit logging.

#### Step 4.3: Beneficiary Delivery Confirmation Hook

#### Location
Wherever beneficiary delivery is confirmed (likely in NGO dashboard or admin panel)

#### Implementation
When delivery status is confirmed (changes donation status to DELIVERED):
```typescript
// After updating donation status to DELIVERED in DB
try {
    const blockchainService = await getBlockchainService();
    
    const result = await blockchainService.updateDonationStatus(
        donationId,
        4 // DELIVERED status
    );

    if (result.success) {
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donationId,
            action: 'BLOCKCHAIN_STATUS_UPDATE_DELIVERED',
            metadata: {
                donationId,
                newStatus: 4,
                transactionHash: result.txHash
            },
            ipAddress: 'delivery-confirmation-service',
        });
        
        console.info(`Donation ${donationId} status updated to DELIVERED on-chain: ${result.txHash}`);
    } else {
        // Add to retry queue for status update failure
        await addToBlockchainRetryQueue({
            donationId,
            error: result.error,
            operationType: 'UPDATE_STATUS',
            retryCount: 0,
            metadata: { targetStatus: 4 }
        });
        
        await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donationId,
            action: 'BLOCKCHAIN_STATUS_UPDATE_DELIVERED_FAILED',
            metadata: {
                donationId,
                error: result.error
            },
            ipAddress: 'delivery-confirmation-service',
        });
        
        console.error(`Failed to update donation ${donationId} status to DELIVERED on-chain: ${result.error}`);
    }
} catch (error) {
    // Handle service errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await addToBlockchainRetryQueue({
        donationId,
        error: errorMessage,
        operationType: 'UPDATE_STATUS',
        retryCount: 0,
        metadata: { targetStatus: 4 }
    });
    
    await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: donationId,
        action: 'BLOCKCHAIN_SERVICE_ERROR_DELIVERED',
        metadata: {
            donationId,
            error: errorMessage
        },
        ipAddress: 'delivery-confirmation-service',
    });
    
    console.error(`Blockchain service error during delivery confirmation for donation ${donationId}:`, error);
}
```

### 5. Create Reconciliation Script

#### Location
Create new file: `backend/scripts/reconcile-blockchain-records.ts`

```typescript
#!/usr/bin/env ts-node
import { getBlockchainService } from '../src/services/blockchainInstance';
import { prisma } from '../src/db/prisma';
import { writeAuditLog } from '../src/services/auditLogService';
import { AuditActorType } from '../../../generated/prisma/enums';

async function main() {
    console.log('Starting blockchain reconciliation process...');
    
    const blockchainService = await getBlockchainService();
    
    // Find donations that are SUCCESS or higher but missing solanaTxHash
    const donationsNeedingRecording = await prisma.donation.findMany({
        where: {
            status: { in: [1, 2, 3, 4] }, // SUCCESS or higher
            solanaTxHash: null
        },
        include: {
            ngo: true
        }
    });

    console.log(`Found ${donationsNeedingRecording.length} donations needing blockchain recording`);

    let recordedCount = 0;
    let failedCount = 0;

    for (const donation of donationsNeedingRecording) {
        try {
            console.log(`Processing donation ${donation.id} for recording...`);
            
            const donationData = {
                donationId: donation.id,
                donorUserId: donation.donorId,
                ngoId: donation.ngoId,
                campaignId: donation.campaignId ?? '',
                amountInr: donation.amount.toNumber(),
                currency: 'INR',
                timestamp: new Date(donation.createdAt)
            };

            const result = await blockchainService.recordDonation(donationData);

            if (result.success) {
                // Update donation with transaction hash
                await prisma.donation.update({
                    where: { id: donation.id },
                    data: { solanaTxHash: result.txHash }
                });

                await writeAuditLog({
                    actorType: AuditActorType.SYSTEM,
                    entityType: 'donation',
                    entityId: donation.id,
                    action: 'BLOCKCHAIN_RECONCILE_RECORD',
                    metadata: {
                        donationId: donation.id,
                        transactionHash: result.txHash
                    },
                    ipAddress: 'reconciliation-script',
                });

                console.log(`✓ Successfully recorded donation ${donation.id}: ${result.txHash}`);
                recordedCount++;
            } else {
                console.error(`✗ Failed to record donation ${donation.id}: ${result.error}`);
                
                await writeAuditLog({
                    actorType: AuditActorType.SYSTEM,
                    entityType: 'donation',
                    entityId: donation.id,
                    action: 'BLOCKCHAIN_RECONCILE_FAILED',
                    metadata: {
                        donationId: donation.id,
                        error: result.error
                    },
                    ipAddress: 'reconciliation-script',
                });
                
                failedCount++;
            }
        } catch (error) {
            console.error(`✗ Unexpected error processing donation ${donation.id}:`, error);
            
            await writeAuditLog({
                actorType: AuditActorType.SYSTEM,
                entityType: 'donation',
                entityId: donation.id,
                action: 'BLOCKCHAIN_RECONCILE_ERROR',
                metadata: {
                    donationId: donation.id,
                    error: error.message
                },
                ipAddress: 'reconciliation-script',
            });
            
            failedCount++;
        }
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Also check for donations that need status updates
    const donationsNeedingStatusUpdate = await prisma.donation.findMany({
        where: {
            status: { in: [2, 3, 4] }, // ALLOCATED or higher
            solanaTxHash: { not: null }
        }
    });

    console.log(`Found ${donationsNeedingStatusUpdate.length} donations needing status verification`);

    let syncedCount = 0;
    let syncFailedCount = 0;

    for (const donation of donationsNeedingStatusUpdate) {
        try {
            const onChainData = await blockchainService.getDonationRecord(donation.id);
            
            if (onChainData && onChainData.status !== donation.status) {
                console.log(`Donation ${donation.id} status mismatch: DB=${donation.status}, Chain=${onChainData.status}`);
                
                // Update on-chain status to match DB (assuming DB is source of truth)
                const result = await blockchainService.updateDonationStatus(
                    donation.id,
                    donation.status
                );

                if (result.success) {
                    await writeAuditLog({
                        actorType: AuditActorType.SYSTEM,
                        entityType: 'donation',
                        entityId: donation.id,
                        action: 'BLOCKCHAIN_RECONCILE_STATUS_SYNC',
                        metadata: {
                            donationId: donation.id,
                            newStatus: donation.status,
                            transactionHash: result.txHash
                        },
                        ipAddress: 'reconciliation-script',
                    });

                    console.log(`✓ Synchronized donation ${donation.id} status to ${donation.status}`);
                    syncedCount++;
                } else {
                    console.error(`✗ Failed to synchronize donation ${donation.id} status: ${result.error}`);
                    
                    await writeAuditLog({
                        actorType: AuditActorType.SYSTEM,
                        entityType: 'donation',
                        entityId: donation.id,
                        action: 'BLOCKCHAIN_RECONCILE_STATUS_SYNC_FAILED',
                        metadata: {
                            donationId: donation.id,
                            error: result.error
                        },
                        ipAddress: 'reconciliation-script',
                    });
                    
                    syncFailedCount++;
                }
            }
        } catch (error) {
            console.error(`✗ Error checking donation ${donation.id} status:`, error);
            
            await writeAuditLog({
                actorType: AuditActorType.SYSTEM,
                entityType: 'donation',
                entityId: donation.id,
                action: 'BLOCKCHAIN_RECONCILE_STATUS_ERROR',
                metadata: {
                    donationId: donation.id,
                    error: error.message
                },
                ipAddress: 'reconciliation-script',
            });
            
            syncFailedCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`
    Blockchain reconciliation process completed.
    Summary:
    - Recordings: ${recordedCount} successful, ${failedCount} failed
    - Status Sync: ${syncedCount} successful, ${syncFailedCount} failed
    `);
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error in reconciliation script:', error);
        process.exit(1);
    });
}

export default main;
```

Add to `package.json` scripts:
```json
"reconcile:blockchain": "ts-node backend/scripts/reconcile-blockchain-records.ts"
```

### 6. Environment Configuration Verification

#### Step 6.1: Ensure Required Variables Exist

Verify that `.env` contains:
```env
# Blockchain Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=[your_actual_program_id_here]
SOLANA_WALLET_KEYPAIR_PATH=/home/aaditya/.config/solana/devnet-traceit.json
BLOCKCHAIN_HMAC_SECRET=[your_high_entropy_secret_here]

# Existing Variables
DATABASE_URL="postgresql://..."
DIRECT_DATABASE_URL="postgresql://..."
PORT=3000
NODE_ENV=development
RAZORPAY_KEY_ID="..."
RAZORPAY_KEY_SECRET="..."
```

#### Step 6.2: Update .env.example

Ensure `.env.example` includes all required variables with placeholder values.

#### Step 6.3: Add Documentation

Create/update documentation with wallet management instructions:
```
# Wallet Management for Development

1. Generate development wallet:
   solana-keygen new --outfile ~/.config/solana/devnet-traceit.json

2. Fund wallet with devnet SOL:
   solana airdrop 2 $(solana address -k ~/.config/solana/devnet-traceit.json) --url http://127.0.0.1:8899

3. For team consistency (optional):
   - Share the same devnet-traceit.json file (development only!)
   - Never share mainnet wallet keys
```

### 7. Testing Strategy

#### Step 7.1: Unit Tests
Create/update test files:
- `backend/tests/webhook-integration.test.ts`: Test webhook → blockchain flow
- `backend/tests/blockchainRetryProcessor.test.ts`: Test retry queue processing
- `backend/tests/reconciliation.test.ts`: Test reconciliation script
- `backend/tests/blockchainService.test.ts`: Test service methods

#### Step 7.2: Integration Tests
Run existing blockchain tests:
```bash
cd blockchain
anchor test
```

#### Step 7.3: End-to-End Testing
Create test scenario:
1. Simulate Razorpay webhook payload
2. Verify donation recorded in DB with status=SUCCESS
3. Verify blockchain service called and txHash stored
4. Verify public API returns explorer link
5. Test status updates trigger on-chain changes
6. Test retry queue with simulated failures
7. Run reconciliation script to verify it fixes mismatches

### 8. Deployment Checklist

Before deploying to staging/production:
- [ ] Phase 1 fully completed and tested
- [ ] All backend tests pass
- [ ] Blockchain program deployed to target network
- [ ] Environment variables configured correctly
- [ ] Database migration for enhanced retry queue run
- [ ] Webhook integration code tested
- [ ] Retry processor configured to start with application
- [ ] Audit logging configured for blockchain operations
- [ ] Monitoring alerts set up for blockchain failures
- [ ] Documentation updated

## Completion Criteria

Phase 2 is complete when all of the following pass:
1. ✅ Anchor program compiles with zero errors (`anchor build`)
2. ✅ Program deploys to target network successfully
3. ✅ `record_donation` test creates on-chain account with correct data
4. ✅ Idempotency test handles duplicate `donation_id` gracefully
5. ✅ `update_donation_status` test validates all transitions properly
6. ✅ Invalid status transition test rejected with appropriate error
7. ✅ Zero amount test rejected with `InvalidAmount` error
8. ✅ `BlockchainService.recordDonation()` works against target network
9. ✅ `BlockchainService.getDonationRecord()` reads back recorded data correctly
10. ✅ `BlockchainService.verifyDonationIntegrity()` detects tampering
11. ✅ Retry queue processor processes failed submissions with exponential backoff
12. ✅ Webhook integration records transactions, handles failures, and queues retries
13. ✅ Public donation API returns explorable transaction hashes with proper URLs
14. ✅ Allocation flow (SUCCESS→ALLOCATED) triggers on-chain status updates
15. ✅ Disbursement flow (ALLOCATED→DISBURSED) triggers on-chain status updates
16. ✅ Delivery flow (DISBURSED→DELIVERED) triggers on-chain status updates
17. ✅ Reconciliation script fixes orphaned records and status mismatches
18. ✅ All environment variables properly configured and tested
19. ✅ No blockchain-related secrets committed to repository
20. ✅ Audit logs properly record all blockchain operations and failures

Once these criteria are met, we can proceed to **Phase 3**: Implementing NGO registry, cohort hashing, and disbursement program on-chain.

---
*Last Updated: 2026-08-31*