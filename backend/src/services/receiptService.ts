/**
 * receiptService.ts
 * 80G Tax Receipt generation service.
 *
 * Flow:
 *   1. Fetch donation + donor + NGO data from DB
 *   2. Generate an HTML receipt string
 *   3. Convert to Buffer and upload to the "tax-receipts" B2 bucket via StorageService
 *   4. Store the signed URL in donations.tax_receipt_url
 *   5. Mark tax_receipt_emailed = true (stub — real SendGrid call goes here)
 *
 * The receipt HTML is kept deliberately minimal so it can be replaced with a
 * PDF renderer (pdfkit / puppeteer) in Phase 5 without changing the public API.
 */

import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { StorageService } from './storageService';

const taxReceiptStorage = new StorageService('tax-receipts');

// Signed URL TTL returned to the donor (15 min)
const RECEIPT_URL_TTL_SECONDS = 15 * 60;

// Internal TTL for the stored path (used when we generate a fresh URL on demand)
// The file lives permanently in the bucket; we just regenerate signed URLs.

/**
 * Generate the 80G HTML receipt string for a donation.
 */
function buildReceiptHtml(params: {
  publicId: string;
  donorName: string;
  ngoName: string;
  registrationNo: string;
  amountInr: string;
  paymentMethod: string;
  createdAt: Date;
  receiptNo: string;
}): string {
  const dateStr = params.createdAt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>80G Tax Receipt — TraceIt</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p  { margin: 4px 0; font-size: 13px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    td { padding: 8px 12px; border: 1px solid #ddd; font-size: 14px; }
    td:first-child { font-weight: bold; width: 40%; background: #f8f8f8; }
    .footer { margin-top: 40px; font-size: 12px; color: #888; text-align: center; }
    .seal { margin-top: 24px; text-align: right; font-style: italic; color: #333; }
  </style>
</head>
<body>
  <div class="header">
    <h1>TraceIt — 80G Donation Receipt</h1>
    <p>This receipt is valid for claiming tax deductions under Section 80G of the Income Tax Act, 1961.</p>
  </div>

  <table>
    <tr><td>Receipt No.</td><td>${params.receiptNo}</td></tr>
    <tr><td>Donation Reference</td><td>${params.publicId}</td></tr>
    <tr><td>Donor Name</td><td>${params.donorName}</td></tr>
    <tr><td>Received By (NGO)</td><td>${params.ngoName}</td></tr>
    <tr><td>NGO Registration No.</td><td>${params.registrationNo}</td></tr>
    <tr><td>Amount (INR)</td><td>₹${params.amountInr}</td></tr>
    <tr><td>Payment Method</td><td>${params.paymentMethod}</td></tr>
    <tr><td>Date of Donation</td><td>${dateStr}</td></tr>
    <tr><td>Mode of Receipt</td><td>Online via TraceIt Platform</td></tr>
  </table>

  <div class="seal">
    <p>Authorised Signatory — TraceIt</p>
    <p>Generated on: ${new Date().toISOString()}</p>
  </div>

  <div class="footer">
    <p>This is a computer-generated receipt and does not require a physical signature.</p>
    <p>For queries, contact support@traceit.in</p>
  </div>
</body>
</html>`;
}

/**
 * Generate and store an 80G receipt for the given donation.
 * Called after a payment SUCCESS (triggered from webhook or on-demand).
 *
 * @param donationId - The internal UUID of the donation row.
 * @returns The signed URL for the generated receipt (15-min TTL), or null on failure.
 */
export const generateAndStoreReceipt = async (donationId: string): Promise<string | null> => {
  try {
    // 1. Fetch donation with related donor and NGO data
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: {
        id: true,
        publicId: true,
        amount: true,
        paymentMethod: true,
        taxReceiptUrl: true,
        createdAt: true,
        donor: {
          select: {
            fullName: true,
          },
        },
        ngo: {
          select: {
            organisationName: true,
            registrationNo: true,
          },
        },
      },
    });

    if (!donation) {
      console.error(`[ReceiptService] Donation not found: ${donationId}`);
      return null;
    }

    // 2. Generate a unique receipt number
    const receiptNo = `TI-${donation.publicId.toUpperCase().slice(0, 8)}-${Date.now()}`;
    const storagePath = `receipts/${donation.id}/${receiptNo}.html`;

    // 3. Build HTML receipt
    const html = buildReceiptHtml({
      publicId: donation.publicId,
      donorName: donation.donor?.fullName ?? 'Donor',
      ngoName: donation.ngo?.organisationName ?? 'NGO',
      registrationNo: donation.ngo?.registrationNo ?? 'N/A',
      amountInr: Number(donation.amount).toFixed(2),
      paymentMethod: donation.paymentMethod,
      createdAt: donation.createdAt,
      receiptNo,
    });

    const buffer = Buffer.from(html, 'utf-8');

    // 4. Upload to B2 tax-receipts bucket
    await taxReceiptStorage.uploadFile(buffer, storagePath, 'text/html; charset=utf-8');

    // 5. Get a signed URL (15-min TTL for immediate return; we store the path not the URL)
    const signedUrl = await taxReceiptStorage.getSignedUrl(storagePath, RECEIPT_URL_TTL_SECONDS);

    // 6. Persist storage path as the receipt URL + mark emailed (stub)
    await prisma.donation.update({
      where: { id: donationId },
      data: {
        taxReceiptUrl: storagePath,   // store path; fresh signed URLs are generated on demand
        taxReceiptEmailed: true,       // TODO(Phase 5): replace stub with actual SendGrid send
      },
    });

    console.log(`[ReceiptService] Receipt generated for donation ${donationId}: ${storagePath}`);

    return signedUrl;
  } catch (err) {
    console.error(`[ReceiptService] Failed to generate receipt for donation ${donationId}`, err);
    return null;
  }
};

/**
 * Get (or regenerate) a fresh 15-min signed URL for an existing receipt.
 *
 * @param storagePath - The path stored in donations.tax_receipt_url.
 * @returns A fresh signed URL with 15-min TTL.
 */
export const getReceiptSignedUrl = async (storagePath: string): Promise<string> => {
  return taxReceiptStorage.getSignedUrl(storagePath, RECEIPT_URL_TTL_SECONDS);
};
