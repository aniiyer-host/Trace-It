// DonateDialog – Modal for making a UPI or SOL donation to a campaign
import { useState, useEffect } from "react";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";
import { useDonationStore } from "@/store/donationStore";
import { apiService } from "@/utils/apiClient";
import { initiateUpiPayment } from "@/services/mockPayments";
import { formatUSD, shortenHash } from "@/lib/utils";
import type { Campaign, PaymentMethod, Donation } from "@/types";
import axios from "axios";

const PRESET_AMOUNTS = [25, 50, 100, 250];

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

interface Props {
  campaign: Campaign | null;
  open: boolean;
  onClose: () => void;
}

export function DonateDialog({ campaign, open, onClose }: Props) {
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const method: PaymentMethod = "upi";
  const [loading, setLoading] = useState(false);
  const [createdDonation, setCreatedDonation] = useState<Donation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const { user } = useAuthStore();
  const donationStore = useDonationStore();
  const { toast } = useToast();

  const finalAmount = custom ? parseInt(custom, 10) || 0 : amount;

  /* --- OLD DONATE LOGIC (preserved/commented) ---
    const handleDonateOld = async () => {
        if (!campaign) {
            toast({ title: 'Select a campaign', variant: 'destructive' })
            return
        }
        if (!user) {
            toast({ title: 'Sign in to donate', variant: 'destructive' })
            return
        }
        if (finalAmount < 1) {
            toast({ title: 'Enter a valid amount', variant: 'destructive' })
            return
        }
        setLoading(true)
        try {
            await initiateUpiPayment(finalAmount)
            const payload = {
                campaignId: campaign.id,
                ngoId: campaign.ngoId,
                amount: finalAmount,
                paymentMethod: method.toUpperCase(),
            }
            const donation = await apiService.donations.create(payload) as Donation
            donationStore.addDonation(donation)
            toast({ title: `${formatUSD(finalAmount)} donation successful! 🎉` })
        } catch (_error) {
            console.error(_error)
            toast({ title: 'Donation failed', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }
    ------------------------------------------------ */

  const handleDonate = async () => {
    if (!campaign) {
      toast({ title: "Select a campaign", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Sign in to donate", variant: "destructive" });
      return;
    }
    if (finalAmount < 1) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await initiateUpiPayment(finalAmount);

      const payload = {
        campaignId: campaign.id,
        ngoId: campaign.ngoId,
        amount: finalAmount,
        paymentMethod: method.toUpperCase(),
      };
      //Removed as any after it
      const res = await apiService.donations.create(payload);

      const newDonation: Donation = {
        id: res.id || `don-${Date.now()}`,
        publicId: res.publicId,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        amount: finalAmount,
        paymentMethod: method,
        orderId: res.razorpayOrderId || `order_${Date.now()}`,
        status: "INITIATED",
        createdAt: new Date().toISOString(),
        walletAddress: "donor_wallet",
        explorerUrl: `https://explorer.solana.com/?cluster=devnet`,
      };

      donationStore.addDonation(newDonation);
      setCreatedDonation(newDonation);
      toast({ title: `Donation initiated for ${formatUSD(finalAmount)}!` });
      // } catch (_error: any) {
      //   console.error(_error);
      //   if (
      //     _error?.response?.status === 402 &&
      //     _error?.response?.data?.requiresKyc
      //   ) {
      //     toast({
      //       title: "KYC Verification Required",
      //       description:
      //         "Donations over ₹10,000 require KYC verification. Please complete your KYC before donating this amount.",
      //       variant: "destructive",
      //     });
      //   } else {
      //     toast({ title: "Donation failed", variant: "destructive" });
      //   }
      // }
    } catch (_error: unknown) {
      console.error(_error);

      if (
        axios.isAxiosError(_error) &&
        _error.response?.status === 402 &&
        _error.response?.data?.requiresKyc
      ) {
        toast({
          title: "KYC Verification Required",
          description:
            "Donations over ₹10,000 require KYC verification. Please complete your KYC before donating this amount.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Donation failed", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!createdDonation || createdDonation.status === "SUCCESS" || !user?.id)
      return;

    let elapsed = 0;
    const intervalId = setInterval(async () => {
      elapsed += 3000;
      if (elapsed > 30000) {
        clearInterval(intervalId);
        return;
      }
      try {
        //remove param for LINT error
        //Since backend takes from token no need of param . It was removed in method as well so remove user.id
        const userDonations = await apiService.donations.getByUser();
        const currentStatus = userDonations.find(
          (d) => d.id === createdDonation.id,
        );
        //Cause of LINT error removed setCreatedDonation(currentStatus) as it was giving error of possibly null
        // if (currentStatus && currentStatus.status === "SUCCESS") {
        //   setCreatedDonation(currentStatus);
        //   clearInterval(intervalId);
        // }
        if (currentStatus && currentStatus.status === "SUCCESS") {
          setCreatedDonation((prev) =>
            prev ? { ...prev, status: currentStatus.status } : prev,
          );
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [createdDonation, user?.id]);

  const handleSimulatePayment = async () => {
    if (!createdDonation) return;
    setIsSimulating(true);
    try {
      await apiService.webhooks.simulateSuccess(createdDonation.id);
      const updated: Donation = {
        ...createdDonation,
        status: "SUCCESS",
        txHash: `sim_tx_${createdDonation.id.slice(0, 8)}`,
      };
      setCreatedDonation(updated);
      toast({ title: "Payment confirmed & attestation generated! 🎉" });
    } catch (err) {
      console.error("Simulation error:", err);
      toast({ title: "Simulation failed", variant: "destructive" });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleClose = () => {
    setCreatedDonation(null);
    setCustom("");
    setAmount(50);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass border-border/60 max-w-md">
        <DialogHeader>
          <DialogTitle className="gradient-text text-xl">
            Donate to Campaign
          </DialogTitle>
          <DialogDescription>{campaign?.title}</DialogDescription>
        </DialogHeader>

        {createdDonation ? (
          <div className="text-center space-y-4 py-4">
            {createdDonation.status === "SUCCESS" ? (
              <>
                <p className="text-4xl">🎉</p>
                <p className="font-semibold text-emerald-400">
                  Payment Confirmed!
                </p>
                <p className="text-sm text-muted-foreground">
                  Tx:{" "}
                  {createdDonation.txHash
                    ? shortenHash(createdDonation.txHash)
                    : "Recorded on Solana devnet"}
                </p>
                {createdDonation.txHash && (
                  <a
                    href={`https://explorer.solana.com/tx/${createdDonation.txHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> View on Solana Explorer
                  </a>
                )}
              </>
            ) : (
              <>
                <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary animate-pulse">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
                <p className="font-semibold text-primary">Payment Initiated</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Awaiting gateway webhook confirmation (~15 seconds).
                </p>
                {import.meta.env.DEV && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSimulating}
                    onClick={handleSimulatePayment}
                    className="text-xs bg-muted/40 hover:bg-primary/20 border-primary/40 text-primary"
                  >
                    {isSimulating ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    ⚡ Dev: Instant Simulate Payment
                  </Button>
                )}
              </>
            )}

            <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 text-left space-y-2 text-sm">
              <h3 className="font-semibold border-b border-border/50 pb-2 mb-2">
                {createdDonation.status === "SUCCESS"
                  ? "Donation Receipt"
                  : "Order Details"}
              </h3>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>{" "}
                <span>
                  {new Date(createdDonation.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>{" "}
                <span className="font-mono text-xs">
                  {createdDonation.orderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign:</span>{" "}
                <span className="truncate ml-4">
                  {campaign?.title || createdDonation.campaignTitle}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold">
                  {formatUSD(createdDonation.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>{" "}
                <span className="font-medium uppercase">
                  {createdDonation.status}
                </span>
              </div>

              {createdDonation.status === "SUCCESS" && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => {
                    const receiptId =
                      createdDonation.orderId ||
                      createdDonation.publicId ||
                      createdDonation.id;
                    const safeReceiptId = escapeHtml(receiptId);
                    const donorName = user?.name ? escapeHtml(user.name) : "";
                    const ngoName = campaign?.ngoName || campaign?.ngo || "";
                    const safeNgoName = ngoName ? escapeHtml(ngoName) : "";
                    const campaignName =
                      campaign?.title || createdDonation.campaignTitle || "";
                    const safeCampaignName = campaignName
                      ? escapeHtml(campaignName)
                      : "";
                    const category = campaign?.category
                      ? escapeHtml(campaign.category)
                      : "";
                    const paymentMethod = escapeHtml(
                      createdDonation.paymentMethod.toUpperCase(),
                    );
                    const date = escapeHtml(
                      new Date(createdDonation.createdAt).toLocaleDateString(
                        "en-IN",
                        { day: "2-digit", month: "long", year: "numeric" },
                      ),
                    );
                    const formattedAmount = escapeHtml(
                      new Intl.NumberFormat("en-IN", {
                        maximumFractionDigits: 2,
                      }).format(createdDonation.amount),
                    );
                    const words = escapeHtml(
                      amountInWords(createdDonation.amount),
                    );
                    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Donation Receipt - ${safeReceiptId}</title>
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
      ${safeNgoName ? `<h1 class="organization-name">${safeNgoName}</h1>` : ""}
    </header>
    <h2 class="title">RECEIPT</h2>
    <div class="meta">
      <span><strong>No.:</strong> ${safeReceiptId}</span>
      <span><strong>Date:</strong> ${date}</span>
    </div>
    <p class="line">Received with thanks from&nbsp; <strong>${donorName}</strong></p>
    <p class="line">by ${paymentMethod} __________________ Bank ______________________</p>
    <p class="line">Rupees&nbsp; ${words}</p>
    <p class="line">on account of&nbsp; <strong>${safeCampaignName}</strong></p>
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
                    const blob = new Blob([html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Receipt_${receiptId.replace(/[^a-zA-Z0-9_-]/g, "_")}.html`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download Receipt
                </Button>
              )}
            </div>

            <Button className="w-full" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Amount selector */}
            <div>
              <p className="text-sm font-medium mb-2">Amount (INR)</p>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {PRESET_AMOUNTS.map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={amount === a && !custom ? "default" : "outline"}
                    onClick={() => {
                      setAmount(a);
                      setCustom("");
                    }}
                  >
                    ₹{a}
                  </Button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Custom amount…"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Payment method */}
            <div className="flex flex-col gap-2 p-3 border border-border/50 rounded-lg bg-muted/20">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">UPI Payment</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Powered by Razorpay. Your fiat payment will be recorded on-chain
                via ZK attestations.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handleDonate}
              disabled={loading || !user}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…
                </>
              ) : (
                `Donate ${formatUSD(finalAmount)}`
              )}
            </Button>
            {!user && (
              <p className="text-xs text-center text-destructive">
                Sign in first to donate
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
