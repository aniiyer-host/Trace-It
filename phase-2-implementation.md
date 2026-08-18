# Phase 2 Implementation Plan: On-Chain Donation Recording + Webhook Integration

## Overview
This document provides detailed, step-by-step instructions for implementing Phase  for implementing Phase 2 of the Trace-It blockchain integration. Phase 2 focuses on wiring the `blockchainService` into the actual backend donation flow, specifically integrating with the Razorpay webhook handler to record confirmed donations on-chain.

**Prerequisites:** Phase 1 must be fully completed and tested:
- Anchor program (`traceit`) deployed to Solana devnet
- `blockchainService.ts` and `blockchainInstance.ts` implemented and tested
- All backend tests passing (30/30)
- Development environment properly configured

## Phase 2 Goals
1. Integrate `blockchainService.recordDonation()` into the Razorpay webhook handler
2. Implement a retry queue mechanism for failed Solana submissions
3. Enable public donation timeline API to display transaction hashes
4. Sync status updates (SUCCESS → ALLOCATED) with on-chain records
5. Create a reconciliation script for orphaned records

## Detailed Implementation Steps

### 1. Webhook Integration Point

#### Location
File: `backend/src/routes/webhooks/razorpay.ts`
Target: Line 199 (marked with `// TODO(blockchain-team)`)

#### Current Code Structure
```typescript
// ... existing webhook handler code ...

// TODO(blockchain-team): Integrate with blockchain service here
// After payment confirmation and DB update, record donation on-chain

// ... remaining code ...
```

#### Implementation Instructions

1. **Import Required Dependencies** (Add at top of file if not present):
```typescript
import { getBlockchainService } from '../../services/blockchainInstance';
import { writeAuditLog } from '../../services/auditLogService';
```

2. **Locate the Payment Confirmation Section**:
Find where the webhook handles `payment.captured` events and updates the donation status to `SUCCESS`.

3. **Add Blockchain Integration**:
After the database update but before the final response, add:

```typescript
// BLOCKCHAIN INTEGRATION: Record donation on-chain after successful payment
try {
  const blockchainService = await getBlockchainService();
  
  // Prepare donation data for on-chain recording
  const donationData = {
    donationId: donation.id, // UUID from Postgres
    donorUserId: donation.donorId, // Raw user ID (will be hashed by service)
    ngoId: donation.ngoId,
    campaignId: donation.campaignId,
    amountInr: donation.amount, // Amount in INR
    currency: 'INR',
    timestamp: new Date() // Current timestamp
  };

  // Record on-chain (idempotent - safe to call multiple times)
  const blockchainResult = await blockchainService.recordDonation(donationData);
  
  if (blockchainResult.success) {
    // Store transaction hash in donation record
    donation.solanaTxHash = blockchainResult.txHash;
    await donation.save();
    
    // Log success to audit trail
    await writeAuditLog(
      donation.ngoId,
      'BLOCKCHAIN_RECORD_SUCCESS',
      `Donation ${donation.id} recorded on-chain with tx: ${blockchainResult.txHash}`,
      donation.id
    );
    
    logger.info(`Blockchain recording successful for donation ${donation.id}: ${blockchainResult.txHash}`);
  } else {
    // Handle recording failure
    logger.error(`Blockchain recording failed for donation ${donation.id}: ${blockchainResult.error}`);
    
    // Add to retry queue for later processing
    await addToBlockchainRetryQueue({
      donationId: donation.id,
      error: blockchainResult.error,
      retryCount: 0
    });
    
    // Log failure to audit trail
    await writeAuditLog(
      donation.ngoId,
      'BLOCKCHAIN_RECORD_FAILED',
      `Failed to record donation ${donation.id} on-chain: ${blockchainResult.error}`,
      donation.id
    );
  }
} catch (error) {
  // Handle service initialization or other unexpected errors
  logger.error(`Blockchain service error for donation ${donation.id}:`, error);
  
  // Add to retry queue
  await addToBlockchainRetryQueue({
    donationId: donation.id,
    error: error.message,
    retryCount: 0
  });
  
  await writeAuditLog(
    donation.ngoId,
    'BLOCKCHAIN_SERVICE_ERROR',
    `Blockchain service error for donation ${donation.id}: ${error.message}`,
    donation.id
  );
}
```

4. **Add Helper Function for Retry Queue**:
At the end of the file, before the export statement, add:

```typescript
/**
 * Add failed blockchain operation to retry queue
 * In production, this would use a proper job queue like Bull/BullMQ
 * For simplicity, we'll use a PostgreSQL-based approach
 */
async function addToBlockchainRetryQueue(data: {
  donationId: string;
  error: string;
  retryCount: number;
}): Promise<void> {
  try {
    // Import Prisma client
    const { prisma } from require('../db/prisma');
    
    // Create or update retry queue entry
    await prisma.blockchainRetryQueue.upsert({
      where: { donationId: data.donationId },
      update: {
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        updatedAt: new Date()
      },
      create: {
        donationId: data.donationId,
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    logger.info(`Added donation ${data.donationId} to blockchain retry queue (attempt ${data.retryCount + 1})`);
  } catch (queueError) {
    logger.error(`Failed to add to retry queue:`, queueError);
    // Don't fail the webhook if queue fails - the donation is already recorded in DB
  }
}
```

5. **Create Database Table for Retry Queue**:
Add a migration script to create the blockchain retry queue table:

Create `prisma/migrations/` directory if it doesn't exist, then create a migration:

```bash
npx prisma migrate dev --name create_blockchain_retry_queue
```

This will generate a migration file. Edit the generated SQL to include:

```sql
CREATE TABLE "BlockchainRetryQueue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "donationId" TEXT NOT NULL,
  "error" TEXT NOT NULL,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttempt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BlockchainRetryQueue_donationId_key" UNIQUE ("donationId")
);

CREATE INDEX "BlockchainRetryQueue_lastAttempt_idx" ON "BlockchainRetryQueue"("lastAttempt");
```

Then run:
```bash
npx prisma migrate deploy
```

### 2. Retry Queue Implementation

#### Background Processor
Create a simple background processor to handle retry queue items:

1. **Create the Processor File**:
   `backend/src/services/blockchainRetryProcessor.ts`

```typescript
import { getBlockchainService } from './blockchainInstance';
import { writeAuditLog } from './auditLogService';
import { prisma } from '../db/prisma';
import { LogLevel } from '@nestjs/common';

export class BlockchainRetryProcessor {
  private readonly batchSize = 10;
  private readonly delayMs = 30000; // 30 seconds between batches
  private readonly maxRetries = 5;
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    console.log('Blockchain retry processor started');
    
    while (this.isRunning) {
      try {
        await this.processRetryQueue();
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      } catch (error) {
        console.error('Error in blockchain retry processor:', error);
        await new Promise(resolve => setTimeout(resolve, this.delayMs * 2)); // Longer delay on error
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
        OR: [
          { retryCount: { lt: this.maxRetries } },
          { lastAttempt: { lt: new Date(Date.now() - (this.delayMs * Math.pow(2, 5))) } } // Give up after 5 attempts with backoff
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
        if (donation.solanaTxHash) {
          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });
          continue;
        }

        // Attempt to record on-chain
        const donationData = {
          donationId: donation.id,
          donorUserId: donation.donorId,
          ngoId: donation.ngoId,
          campaignId: donation.campaignId,
          amountInr: donation.amount,
          currency: 'INR',
          timestamp: new Date(donation.createdAt) // Use original donation timestamp
        };

        const result = await blockchainService.recordDonation(donationData);

        if (result.success) {
          // Success! Update donation and remove from queue
          await prisma.donation.update({
            where: { id: donation.id },
            data: { solanaTxHash: result.txHash }
          });

          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });

          await writeAuditLog(
            donation.ngoId,
            'BLOCKCHAIN_RETRY_SUCCESS',
            `Donation ${donation.id} successfully recorded on-chain via retry: ${result.txHash}`,
            donation.id
          );

          console.log(`Successfully recorded donation ${donation.id} on-chain via retry: ${result.txHash}`);
        } else {
          // Failed again, update retry count and error
          await prisma.blockchainRetryQueue.update({
            where: { donationId: item.donationId },
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
        // Handle unexpected errors
        await prisma.blockchainRetryQueue.update({
          where: { donationId: item.donationId },
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

2. **Import and Start Processor in Application Entry Point**:
In `backend/src/index.ts`, add after the app initialization:

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

### 3. Public Donation Timeline API

The public donation API is already implemented in `backend/src/routes/public.ts`. No changes are needed as it already selects the `solanaTxHash` field.

However, we should verify and potentially enhance the response to include explorer links:

#### Location
File: `backend/src/routes/public.ts`
Function: `getDonationById` or similar

#### Enhancement
After fetching the donation, add a computed field for the explorer URL:

```typescript
// In the route handler after fetching donation
if (donation.solanaTxHash) {
  // Add explorer URL for easy viewing
  donation.explorerUrl = `https://explorer.solana.com/tx/${donation.solanaTxHash}?cluster=devnet`;
}

// In the response, include this field
return res.json({
  // ... existing fields ...
  explorerUrl: donation.explorerUrl || null
});
```

### 4. Allocation Flow Integration

#### Location
File: `backend/src/routes/admin.ts`
Target: Where disbursement approval happens (around line 40 marked with `// TODO(blockchain-team)`)

#### Implementation
In the disbursement approval route, after updating the disbursement status in the database, add:

```typescript
// BLOCKCHAIN INTEGRATION: Update donation status to ALLOCATED on-chain
try {
  const blockchainService = await getBlockchainService();
  
  // Find associated donation(s) for this disbursement
  const disbursementWithDonations = await prisma.disbursement.findUnique({
    where: { id: disbursementId },
    include: {
      beneficiaryCohort: {
        include: {
          donations: true
        }
      }
    }
  });

  if (disbursementWithDonations?.beneficiaryCohort?.donations) {
    // Update each donation in the cohort to ALLOCATED status
    for (const donation of disbursementWithDonations.beneficiaryCohort.donations) {
      if (donation.solanaTxHash) { // Only update if already recorded on-chain
        const result = await blockchainService.updateDonationStatus(
          donation.id,
          2 // ALLOCATED status
        );

        if (result.success) {
          await writeAuditLog(
            disbursementWithDonations.beneficiaryCohort.ngoId,
            'BLOCKCHAIN_STATUS_UPDATE',
            `Donation ${donation.id} status updated to ALLOCATED on-chain: ${result.txHash}`,
            donation.id
          );
        } else {
          logger.error(`Failed to update donation ${donation.id} status on-chain: ${result.error}`);
          
          // Add to retry queue for status updates
          await addToBlockchainRetryQueue({
            donationId: donation.id,
            error: result.error,
            retryCount: 0,
            type: 'STATUS_UPDATE',
            targetStatus: 2
          });
        }
      }
    }
  }
} catch (error) {
  logger.error('Error in blockchain status update integration:', error);
  // Don't fail the disbursement approval if blockchain integration fails
}
```

You'll need to enhance the `addToBlockchainRetryQueue` function to handle different types of operations (record vs status update).

### 5. Reconciliation Script

Create a standalone script to periodically check for and fix orphaned records:

#### Location
`backend/scripts/reconcile-blockchain-records.ts`

```typescript
#!/usr/bin/env ts-node
import { getBlockchainService } from '../src/services/blockchainInstance';
import { prisma } from '../src/db/prisma';
import { writeAuditLog } from '../src/services/auditLogService';

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

  for (const donation of donationsNeedingRecording) {
    try {
      console.log(`Processing donation ${donation.id}...`);
      
      const donationData = {
        donationId: donation.id,
        donorUserId: donation.donorId,
        ngoId: donation.ngoId,
        campaignId: donation.campaignId,
        amountInr: donation.amount,
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

        await writeAuditLog(
          donation.ngoId,
          'BLOCKCHAIN_RECONCILE_RECORD',
          `Donation ${donation.id} recorded on-chain during reconciliation: ${result.txHash}`,
          donation.id
        );

        console.log(`✓ Successfully recorded donation ${donation.id}: ${result.txHash}`);
      } else {
        console.error(`✗ Failed to record donation ${donation.id}: ${result.error}`);
        
        await writeAuditLog(
          donation.ngoId,
          'BLOCKCHAIN_RECONCILE_FAILED',
          `Failed to record donation ${donation.id} during reconciliation: ${result.error}`,
          donation.id
        );
      }
    } catch (error) {
      console.error(`✗ Unexpected error processing donation ${donation.id}:`, error);
      
      await writeAuditLog(
        donation.ngoId,
        'BLOCKCHAIN_RECONCILE_ERROR',
        `Unexpected error during reconciliation for donation ${donation.id}: ${error.message}`,
        donation.id
      );
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
          await writeAuditLog(
            donation.ngoId,
            'BLOCKCHAIN_RECONCILE_STATUS_SYNC',
            `Donation ${donation.id} status synchronized to ${donation.status} on-chain: ${result.txHash}`,
            donation.id
          );
          
          console.log(`✓ Synchronized donation ${donation.id} status to ${donation.status}`);
        } else {
          console.error(`✗ Failed to synchronize donation ${donation.id} status: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(`✗ Error checking donation ${donation.id} status:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Blockchain reconciliation process completed.');
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

Add to package.json scripts:
```json
"reconcile:blockchain": "ts-node backend/scripts/reconcile-blockchain-records.ts"
```

### 6. Environment Configuration Updates

Ensure `.env` and `.env.test` have all required variables:

#### Required Variables
```env
# Blockchain Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=your_actual_program_id_here
SOLANA_WALLET_KEYPAIR_PATH=/home/aaditya/.config/solana/devnet-traceit.json
BLOCKCHAIN_HMAC_SECRET=your_hmac_secret_here

# Database (already existing)
DATABASE_URL="postgresql://postgres.tubdpzpstranrhbilhpy:TraceIt@2026@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_DATABASE_URL="postgresql://postgres.tubdpzpstranrhbilhpy:TraceIt@2026@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
```

#### For Testing
Update `.env.test` to include:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WALLET_KEYPAIR_PATH=/home/aaditya/.config/solana/devnet-traceit.json
BLOCKCHAIN_HMAC_SECRET=test_hmac_secret_123
```

### 7. Testing Strategy

#### Unit Tests
Create/update test files:

1. **Webhook Integration Test**:
   `backend/tests/webhook-integration.test.ts`
   - Test that successful payment triggers blockchain recording
   - Test that failures are added to retry queue
   - Test idempotency (duplicate calls don't create duplicate records)

2. **Retry Processor Test**:
   `backend/tests/blockchainRetryProcessor.test.ts`
   - Test that failed recordings are queued
   - Test that queued items are processed
   - Test exponential backoff
   - Test max retry limits

3. **Reconciliation Script Test**:
   `backend/tests/reconciliation.test.ts`
   - Test that orphaned records are detected and processed
   - Test that status mismatches are corrected

#### Integration Tests
Run the existing blockchain integration tests to ensure they still pass:
```bash
npm test -- tests/blockchainIntegration.test.ts
```

#### End-to-End Testing
Create a test scenario:
1. Simulate a Razorpay webhook payload
2. Verify donation is recorded in DB with status=SUCCESS
3. Verify blockchain service is called
4. Verify solanaTxHash is populated in DB
5. Verify public API returns explorer link
6. Verify status updates trigger on-chain changes
7. Verify retry queue works for simulated failures

### 8. Deployment Checklist

Before deploying to production/staging:

1. [ ] Phase 1 is fully completed and tested
2. [ ] All backend tests pass (30/30)
3. [ ] Blockchain program is deployed to target network (devnet/testnet/mainnet)
4. [ ] Environment variables are configured correctly
5. [ ] Database migration for retry queue has been run
6. [ ] Webhook integration code has been added and tested
7. [ ] Retry processor is configured to start with the application
8. [ ] Audit logging is properly configured for blockchain operations
9. [ ] Monitoring alerts are set up for blockchain failures
10. [ ] Documentation is updated

### 9. Troubleshooting Guide

#### Common Issues

1. **Transaction Signature Mismatch**
   - Symptom: `solanaTxHash` in DB doesn't match explorer
   - Solution: Verify the transaction was actually submitted and confirmed

2. **Retry Queue Processing Slowly**
   - Symptom: Donations stay in retry queue for extended periods
   - Solution: Check processor logs, verify database connection, check for unhandled exceptions

3. **Idempotency Conflicts**
   - Symptom: "already in use" errors despite checking existence
   - Solution: Verify PDA derivation consistency between check and submission

4. **Insufficient Funds for Transaction Fees**
   - Symptom: Transactions fail with insufficient funds
   - Solution: Ensure service wallet has sufficient SOL for transaction fees

5. **Network Connectivity Issues**
   - Symptom: RPC timeouts or connection errors
   - Solution: Verify RPC endpoint, consider adding fallback RPCs

#### Debugging Commands

```bash
# Check blockchain service health
curl -X GET http://localhost:3000/api/health/blockchain

# View retry queue contents
npx prisma studio --query "select * from BlockchainRetryQueue"

# Check recent audit logs for blockchain operations
npx prisma studio --query "select * from AuditLog where action like 'BLOCKCHAIN%' order by createdAt desc limit 20"

# Test blockchain service directly
node -e "
  require('./backend/src/services/blockchainInstance').getBlockchainService()
    .then(service => service.getWalletBalance())
    .then(balance => console.log('Wallet balance:', balance, 'SOL'))
    .catch(console.error);
"
```

## Summary

Phase 2 implementation focuses on integrating the blockchain service into the actual donation flow through:

1. **Webhook Integration**: Recording confirmed donations on-chain immediately after Razorpay payment confirmation
2. **Reliability**: Implementing retry queue mechanism to handle temporary failures
3. **Observability**: Adding proper logging, audit trails, and monitoring
4. **Consistency**: Ensuring data stays synchronized between PostgreSQL and Solana
5. **Usability**: Enabling public visibility of transaction hashes through existing APIs

The implementation follows the existing code patterns and conventions in the Trace-It codebase, uses dependency injection for testability, and maintains separation of concerns between webhook handling, business logic, and blockchain integration.

All Phase 2 components are designed to be backward compatible and can be deployed incrementally, allowing for rollback if needed.