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
import { prisma } from '../db/prisma.js';
import { StorageService } from './storageService.js';

const taxReceiptStorage = new StorageService('tax-receipts');

// Signed URL TTL returned to the donor (15 min)
const RECEIPT_URL_TTL_SECONDS = 15 * 60;

// Internal TTL for the stored path (used when we generate a fresh URL on demand)
// The file lives permanently in the bucket; we just regenerate signed URLs.

function amountToWords(amount: string): string {
  const ones = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'lakh', 'crore', 'arab', 'kharab'];

  const twoDigitWords = (value: number): string => {
    if (value < 20) return ones[value];
    return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`;
  };
  const threeDigitWords = (value: number): string => {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    return `${hundreds ? `${ones[hundreds]} hundred${remainder ? ' ' : ''}` : ''}${remainder ? twoDigitWords(remainder) : ''}`;
  };

  const [rupees, paise = '00'] = amount.split('.');
  let remaining = BigInt(rupees);
  const groups: string[] = [];
  let groupIndex = 0;

  while (remaining > 0n) {
    const groupSize = groupIndex === 0 ? 1000n : 100n;
    const group = Number(remaining % groupSize);
    if (group) {
      const scale = scales[groupIndex];
      groups.unshift(`${threeDigitWords(group)}${scale ? ` ${scale}` : ''}`);
    }
    remaining /= groupSize;
    groupIndex += 1;
  }

  const rupeeWords = groups.join(' ') || 'zero';
  const paiseValue = Number(paise);
  const paiseWords = paiseValue ? ` and ${twoDigitWords(paiseValue)} paise` : '';
  return `${rupeeWords}${paiseWords} only`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  purpose: string;
  campaignCategory: string;
}): string {
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  const safe = {
    publicId: escapeHtml(params.publicId),
    donorName: escapeHtml(params.donorName),
    ngoName: escapeHtml(params.ngoName),
    registrationNo: escapeHtml(params.registrationNo),
    amountInr: escapeHtml(params.amountInr),
    paymentMethod: escapeHtml(params.paymentMethod),
    receiptNo: escapeHtml(params.receiptNo),
    purpose: escapeHtml(params.purpose),
    campaignCategory: escapeHtml(params.campaignCategory),
  };
  const amountInWords = amountToWords(params.amountInr);
  const dateStr = params.createdAt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Donation Receipt — ${safe.ngoName}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background: #f2f4f3; color: #202824; font-family: Arial, sans-serif; }
    .receipt { max-width: 780px; min-height: 900px; margin: 0 auto; padding: 40px 48px; background: #fff; border: 1px solid #d7dfda; }
    .org-header { text-align: center; }
    .org-name { margin: 0; color: #202824; font-size: 20px; font-weight: 700; }
    .org-meta { margin: 7px 0 0; color: #202824; font-size: 13px; line-height: 1.5; }
    .receipt-title { margin: 32px 0 22px; text-align: center; font-size: 17px; font-weight: 700; letter-spacing: 1px; }
    .receipt-meta { display: flex; justify-content: space-between; gap: 20px; margin: 0 0 26px; font-size: 14px; }
    .acknowledgement { margin: 0 0 20px; font-size: 15px; }
    .payment-line { margin: 0 0 22px; font-size: 14px; line-height: 2; }
    .amount-words { margin: 0 0 22px; font-size: 14px; }
    .purpose { margin: 22px 0 10px; font-size: 14px; }
    .category { margin: 0 0 30px; font-size: 14px; font-weight: 700; }
    .receipt-panels { display: grid; grid-template-columns: minmax(180px, 0.85fr) minmax(280px, 1.6fr); gap: 30px; align-items: stretch; }
    .amount, .approval { min-height: 130px; padding: 20px; border: 1px solid #202824; }
    .amount { display: flex; align-items: center; justify-content: center; text-align: center; }
    .amount-value { font-size: 21px; font-weight: 700; }
    .approval-title { margin: 0; font-size: 14px; font-weight: 700; }
    .signature { display: flex; justify-content: flex-end; margin-top: 90px; }
    .signature-block { width: 230px; min-height: 80px; padding-top: 10px; text-align: left; font-size: 13px; line-height: 1.6; }
    @media print { body { padding: 0; background: #fff; } .receipt { max-width: none; min-height: 0; padding: 0; border: 0; } }
    @media (max-width: 600px) { body { padding: 12px; } .receipt { min-height: 0; padding: 24px 18px; } .receipt-meta { flex-direction: column; gap: 8px; } .receipt-panels { grid-template-columns: 1fr; gap: 14px; } .signature { margin-top: 50px; } }
  </style>
</head>
<body>
  <main class="receipt">
    <header class="org-header">
      ${safe.ngoName !== 'NGO' ? `<h1 class="org-name">${safe.ngoName}</h1>` : ''}
      ${safe.registrationNo !== 'N/A' ? `<p class="org-meta">Regn. No.: ${safe.registrationNo}</p>` : ''}
    </header>

    <div class="receipt-title">RECEIPT</div>

    <div class="receipt-meta">
      <span><strong>No.:</strong> ${safe.receiptNo}</span>
      <span><strong>Date:</strong> ${dateStr}</span>
    </div>

    <p class="acknowledgement">Received with thanks from&nbsp; ${safe.donorName !== 'Donor' ? `<strong>${safe.donorName}</strong>` : ''}
    </p>
    <p class="payment-line">by ${safe.paymentMethod} __________________ Bank ______________________</p>
    <p class="amount-words">Rupees ${amountInWords}</p>
    ${safe.purpose !== 'General donation' ? `<p class="purpose">on account of&nbsp; <strong>${safe.purpose}</strong></p>` : ''}
    ${safe.campaignCategory !== 'Not provided' ? `<p class="category">${safe.campaignCategory}</p>` : ''}

    <div class="receipt-panels">
      <div class="amount">
        <span class="amount-value">Rs. ${safe.amountInr}/-</span>
      </div>
      <div class="approval">
        <p class="approval-title">80G Approval Details</p>
      </div>
    </div>

    <div class="signature">
      <div class="signature-block">
        <strong>Authorised Signatory</strong>
      </div>
    </div>
  </main>
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
        project: {
          select: {
            title: true,
            category: true,
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
      purpose: donation.project?.title ?? 'General donation',
      campaignCategory: donation.project?.category ?? 'Not provided',
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

    if (process.env.NODE_ENV !== "test") {
      console.log(`[ReceiptService] Receipt generated for donation ${donationId}: ${storagePath}`);
    }

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
