export interface DonorReceiptDetails {
  receiptId: string;
  donationId: string;
  donorName: string;
  ngoName: string;
  campaignName: string;
  category?: string;
  paymentMethod: string;
  date: string;
  amount: number;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const amountInWords = (amount: number): string => {
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const scales = ["", "thousand", "lakh", "crore", "arab", "kharab"];
  const twoDigitWords = (value: number) =>
    value < 20
      ? ones[value]
      : `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  const threeDigitWords = (value: number) => {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    return `${hundreds ? `${ones[hundreds]} hundred${remainder ? " " : ""}` : ""}${remainder ? twoDigitWords(remainder) : ""}`;
  };

  const absoluteAmount = Math.abs(amount);
  let rupees = Math.floor(absoluteAmount);
  let paise = Math.round((absoluteAmount - rupees) * 100);
  if (paise === 100) {
    rupees += 1;
    paise = 0;
  }

  let remaining = rupees;
  let groupIndex = 0;
  const groups: string[] = [];
  while (remaining > 0 && groupIndex < scales.length) {
    const groupSize = groupIndex === 0 ? 1000 : 100;
    const group = remaining % groupSize;
    if (group) {
      groups.unshift(`${threeDigitWords(group)}${scales[groupIndex] ? ` ${scales[groupIndex]}` : ""}`);
    }
    remaining = Math.floor(remaining / groupSize);
    groupIndex += 1;
  }

  const rupeeWords = groups.join(" ") || "zero";
  const paiseWords = paise ? ` and ${twoDigitWords(paise)} paise` : "";
  return `${rupeeWords}${paiseWords} only`.replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
};

export const downloadDonationReceipt = (details: DonorReceiptDetails) => {
  const receiptId = escapeHtml(details.receiptId);
  const safeDonationId = escapeHtml(details.donationId);
  const donorName = escapeHtml(details.donorName);
  const ngoName = escapeHtml(details.ngoName);
  const campaignName = escapeHtml(details.campaignName);
  const category = details.category ? escapeHtml(details.category) : "";
  const paymentMethod = escapeHtml(details.paymentMethod);
  const date = escapeHtml(details.date);
  const formattedAmount = escapeHtml(
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
      details.amount,
    ),
  );
  const words = escapeHtml(amountInWords(details.amount));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Donation Receipt - ${receiptId}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #202824; background: #f2f4f3; font-family: Arial, Helvetica, sans-serif; }
    .receipt { width: 100%; max-width: 780px; min-height: 900px; margin: 0 auto; padding: 44px 52px; background: #fff; border: 1px solid #cbd5cf; }
    .organization { text-align: center; }
    .organization-name { margin: 0; font-size: 21px; }
    .title { margin: 36px 0 26px; text-align: center; font-size: 18px; letter-spacing: 1px; }
    .meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 32px; font-size: 14px; }
    .line { margin: 0 0 24px; font-size: 15px; line-height: 1.7; }
    .category { margin-top: -12px; font-weight: 700; }
    .panels { display: grid; grid-template-columns: minmax(180px, 0.85fr) minmax(280px, 1.6fr); gap: 28px; margin-top: 36px; }
    .amount, .approval { min-height: 142px; border: 1px solid #26332c; }
    .amount { display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center; }
    .amount-value { font-size: 22px; font-weight: 700; }
    .approval { padding: 20px; }
    .approval-title { margin: 0; font-size: 14px; font-weight: 700; }
    .signature { display: flex; justify-content: flex-end; margin-top: 100px; }
    .signature-label { width: 230px; text-align: center; font-size: 14px; }
    @media print { body { padding: 0; background: #fff; } .receipt { max-width: none; min-height: 0; padding: 0; border: 0; } }
    @media (max-width: 600px) { body { padding: 12px; } .receipt { min-height: 0; padding: 28px 20px; } .meta { flex-direction: column; gap: 8px; } .panels { grid-template-columns: 1fr; gap: 16px; } .signature { margin-top: 56px; } }
  </style>
</head>
<body>
  <main class="receipt">
    <header class="organization">
      ${ngoName ? `<h1 class="organization-name">${ngoName}</h1>` : ""}
    </header>
    <h2 class="title">RECEIPT</h2>
    <div class="meta">
      <span><strong>No.:</strong> ${receiptId}</span>
      <span><strong>Date:</strong> ${date}</span>
    </div>
    <p class="line"><strong>Donation ID:</strong> ${safeDonationId}</p>
    <p class="line">Received with thanks from&nbsp; <strong>${donorName}</strong></p>
    <p class="line">by ${paymentMethod} __________________ Bank ______________________</p>
    <p class="line">Rupees&nbsp; ${words}</p>
    <p class="line">on account of&nbsp; <strong>${campaignName}</strong></p>
    ${category ? `<p class="line category">${category}</p>` : ""}
    <div class="panels">
      <div class="amount"><span class="amount-value">Rs. ${formattedAmount}/-</span></div>
      <section class="approval">
        <h3 class="approval-title">80G Approval Details</h3>
      </section>
    </div>
    <div class="signature"><div class="signature-label">Authorised Signatory</div></div>
  </main>
</body>
</html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Receipt_${details.receiptId.replace(/[^a-zA-Z0-9_-]/g, "_")}.html`;
  link.click();
  URL.revokeObjectURL(url);
};
