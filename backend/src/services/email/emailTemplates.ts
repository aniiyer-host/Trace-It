const escapeHtml = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const buildDonationSuccessEmail = ({
  donationRef,
  amount,
  currency,
  ngoName,
  occurredAt,
  donationLink,
}: {
  donationRef: string;
  amount: number | string;
  currency: string;
  ngoName?: string | null;
  occurredAt: Date | string;
  donationLink?: string;
}) => {
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount);
  const safeDate = new Date(occurredAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const safeLink = donationLink ?? '';
  const safeNgoName = escapeHtml(ngoName || 'the NGO');
  const subject = `Donation confirmed — ${escapeHtml(donationRef)}`;
  const text = [
    'Donation successful',
    `Donation reference: ${donationRef}`,
    `Amount: ${safeAmount} ${currency}`,
    `NGO: ${ngoName || 'the NGO'}`,
    `Confirmation time: ${safeDate}`,
    safeLink ? `View your donations: ${safeLink}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">
      <h2 style="margin-bottom:12px;">Donation successful</h2>
      <p>Thank you for your generosity.</p>
      <p><strong>Donation reference:</strong> ${escapeHtml(donationRef)}</p>
      <p><strong>Amount:</strong> ${escapeHtml(safeAmount)} ${escapeHtml(currency)}</p>
      <p><strong>NGO:</strong> ${safeNgoName}</p>
      <p><strong>Confirmation date:</strong> ${escapeHtml(safeDate)}</p>
      ${safeLink ? `<p><a href="${escapeHtml(safeLink)}">View your donations</a></p>` : ''}
    </div>
  `;

  return { subject, text, html };
};

export const buildDonationExcessRefundEmail = ({
  donationRef,
  amount,
  currency,
  occurredAt,
  donationLink,
}: {
  donationRef: string;
  amount: number | string;
  currency: string;
  occurredAt: Date | string;
  donationLink?: string;
}) => {
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount);
  const safeDate = new Date(occurredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const safeLink = donationLink ?? '';
  const subject = `Refund in progress — ${escapeHtml(donationRef)}`;
  const text = [
    'Your donation could not be applied to the campaign because it is no longer accepting this contribution.',
    `Donation reference: ${donationRef}`,
    `Amount: ${safeAmount} ${currency}`,
    `Payment confirmation time: ${safeDate}`,
    'A full refund has been requested. The refund status will be updated after the payment provider confirms it.',
    safeLink ? `View your donations: ${safeLink}` : undefined,
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">
      <h2 style="margin-bottom:12px;">Refund in progress</h2>
      <p>Your donation could not be applied to the campaign because it is no longer accepting this contribution.</p>
      <p><strong>Donation reference:</strong> ${escapeHtml(donationRef)}</p>
      <p><strong>Amount:</strong> ${escapeHtml(safeAmount)} ${escapeHtml(currency)}</p>
      <p>A full refund has been requested. We will update the refund status after the payment provider confirms it.</p>
      <p><strong>Payment confirmation time:</strong> ${escapeHtml(safeDate)}</p>
      ${safeLink ? `<p><a href="${escapeHtml(safeLink)}">View your donations</a></p>` : ''}
    </div>
  `;
  return { subject, text, html };
};

export const buildFundsAllocatedEmail = ({
  donationRef,
  disbursementRef,
  amount,
  currency,
  ngoName,
  firstAttestationStatus,
  firstAttestationAt,
  donationLink,
}: {
  donationRef: string;
  disbursementRef?: string | null;
  amount: number | string;
  currency: string;
  ngoName?: string | null;
  firstAttestationStatus?: string | null;
  firstAttestationAt?: Date | string | null;
  donationLink?: string;
}) => {
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount);
  const safeDate = firstAttestationAt ? new Date(firstAttestationAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
  const safeLink = donationLink ?? '';
  const subject = `Funds allocated to ${escapeHtml(ngoName || 'the NGO')}`;
  const text = [
    'Funds allocated to the NGO',
    `Donation reference: ${donationRef}`,
    disbursementRef ? `Disbursement reference: ${disbursementRef}` : undefined,
    `NGO: ${ngoName || 'the NGO'}`,
    `Allocated amount: ${safeAmount} ${currency}`,
    `First attestation status: ${firstAttestationStatus || 'APPROVED'}`,
    `Completion time: ${safeDate}`,
    safeLink ? `View your donations: ${safeLink}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">
      <h2 style="margin-bottom:12px;">Funds allocated to the NGO</h2>
      <p>Your donation has been allocated to ${escapeHtml(ngoName || 'the NGO')}.</p>
      <p><strong>Donation reference:</strong> ${escapeHtml(donationRef)}</p>
      ${disbursementRef ? `<p><strong>Disbursement reference:</strong> ${escapeHtml(disbursementRef)}</p>` : ''}
      <p><strong>Allocated amount:</strong> ${escapeHtml(safeAmount)} ${escapeHtml(currency)}</p>
      <p><strong>First attestation status:</strong> ${escapeHtml(firstAttestationStatus || 'APPROVED')}</p>
      <p><strong>Completion time:</strong> ${escapeHtml(safeDate)}</p>
      ${safeLink ? `<p><a href="${escapeHtml(safeLink)}">View your donations</a></p>` : ''}
    </div>
  `;

  return { subject, text, html };
};

export const buildBeneficiaryTransferReviewedEmail = ({
  donationRef,
  ngoName,
  amount,
  currency,
  transferDate,
  reviewedAt,
  donationLink,
}: {
  donationRef: string;
  ngoName?: string | null;
  amount: number | string;
  currency: string;
  transferDate: Date | string;
  reviewedAt: Date | string;
  donationLink?: string;
}) => {
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount);
  const safeTransferDate = new Date(transferDate).toLocaleDateString('en-IN', {
    dateStyle: 'medium',
  });
  const safeReviewedDate = new Date(reviewedAt).toLocaleDateString('en-IN', {
    dateStyle: 'medium',
  });
  const safeNgoName = escapeHtml(ngoName || 'the NGO');
  const safeLink = donationLink ?? '';
  const subject = 'An NGO-reported transfer has been reviewed';
  const text = [
    'An NGO-reported beneficiary transfer has been reviewed.',
    `Donation reference: ${donationRef}`,
    `Reporting NGO: ${ngoName || 'the NGO'}`,
    `Reported amount: ${safeAmount} ${currency}`,
    `Reported transfer date: ${safeTransferDate}`,
    `Supporting evidence reviewed and approved by an administrator: ${safeReviewedDate}`,
    'This review does not independently verify bank settlement or confirm beneficiary receipt.',
    safeLink ? `View your donations: ${safeLink}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">
      <h2 style="margin-bottom:12px;">Transfer evidence reviewed</h2>
      <p>${safeNgoName} reported a beneficiary transfer. An administrator reviewed and approved its supporting evidence.</p>
      <p><strong>Donation reference:</strong> ${escapeHtml(donationRef)}</p>
      <p><strong>Reported amount:</strong> ${escapeHtml(safeAmount)} ${escapeHtml(currency)}</p>
      <p><strong>Reported transfer date:</strong> ${escapeHtml(safeTransferDate)}</p>
      <p><strong>Evidence review date:</strong> ${escapeHtml(safeReviewedDate)}</p>
      <p>This review does not independently verify bank settlement or confirm beneficiary receipt.</p>
      ${safeLink ? `<p><a href="${escapeHtml(safeLink)}">View your donations</a></p>` : ''}
    </div>
  `;

  return { subject, text, html };
};
