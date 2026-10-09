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
import { openRazorpayCheckout } from "@/services/razorpayPayments";
import { downloadDonationReceipt } from "@/lib/donationReceipt";
import { formatUSD, shortenHash } from "@/lib/utils";
import type { Campaign, PaymentMethod, Donation } from "@/types";
import axios from "axios";

const PRESET_AMOUNTS = [25, 50, 100, 250];

interface Props {
  campaign: Campaign | null;
  open: boolean;
  onClose: () => void;
  onDonationUpdated?: (donation: Donation) => void;
}

export function DonateDialog({
  campaign,
  open,
  onClose,
  onDonationUpdated,
}: Props) {
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const method: PaymentMethod = "upi";
  const [loading, setLoading] = useState(false);
  const [createdDonation, setCreatedDonation] = useState<Donation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [requiresKyc, setRequiresKyc] = useState(false);
  const [pan, setPan] = useState("");
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [pollingCycle, setPollingCycle] = useState(0);

  const { user } = useAuthStore();
  const donationStore = useDonationStore();
  const setDonations = useDonationStore((state) => state.setDonations);
  const { toast } = useToast();

  const finalAmount = custom ? parseInt(custom, 10) || 0 : amount;

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
        razorpayOrderId: res.razorpayOrderId,
        status: "INITIATED",
        createdAt: new Date().toISOString(),
        walletAddress: "donor_wallet",
        explorerUrl: `https://explorer.solana.com/?cluster=devnet`,
      };
      donationStore.addDonation(newDonation);
      donationStore.addDonation(newDonation);
      setCreatedDonation(newDonation);
      toast({ title: `Donation initiated for ${formatUSD(finalAmount)}!` });

      const checkoutResult = await openRazorpayCheckout({
        key: res.razorpayKeyId,
        amount: res.razorpayAmount,
        currency: res.razorpayCurrency,
        name: "Trace-It",
        description: `Donation to ${campaign.title}`,
        order_id: res.razorpayOrderId,
      });

      console.info("[Razorpay Checkout Debug] Checkout returned to DonateDialog.", {
        outcome: checkoutResult.type,
      });

      if (checkoutResult.type === "dismissed") {
        console.info(
          "[Razorpay Checkout Debug] DonateDialog dismissed branch executed.",
        );
        console.info(
          "[Razorpay Checkout Debug] Requesting polling restart after dismissal.",
        );
        setPollingCycle((cycle) => cycle + 1);
        toast({
          title: "Payment cancelled",
          description: "The donation remains pending and was not marked successful.",
        });
        return;
      }

      if (checkoutResult.type === "payment_failed") {
        console.info(
          "[Razorpay Checkout Debug] DonateDialog payment_failed branch executed.",
        );
        console.info(
          "[Razorpay Checkout Debug] Requesting polling restart after payment_failed.",
        );
        setPollingCycle((cycle) => cycle + 1);
        if (
          checkoutResult.razorpay_payment_id &&
          checkoutResult.razorpay_order_id &&
          checkoutResult.razorpay_order_id === res.razorpayOrderId
        ) {
          try {
            const failed = await apiService.donations.reportPaymentFailure(newDonation.id, {
              razorpay_payment_id: checkoutResult.razorpay_payment_id,
              razorpay_order_id: checkoutResult.razorpay_order_id,
            });
            const failedDonation = {
              ...newDonation,
              status: failed.status,
            };
            setCreatedDonation(failedDonation);
            onDonationUpdated?.(failedDonation);
            const donations = await apiService.donations.getByUser();
            donationStore.setDonations(donations);
          } catch (failureError) {
            console.error(
              "Failed to persist Razorpay payment failure:",
              failureError,
            );
          }
        }
        toast({
          title: "Payment attempt not completed",
          description:
            "Razorpay reported that the payment attempt did not complete. The donation status will update after server confirmation.",
          variant: "destructive",
        });
        return;
      }

      try {
        const verified = await apiService.donations.verifyPayment(
          newDonation.id,
          checkoutResult.response,
        );
        const verifiedDonation = {
          ...newDonation,
          status: verified.status,
          razorpayPaymentId: verified.razorpayPaymentId,
        };
        setDonations(
          useDonationStore.getState().donations.map((donation) =>
            donation.id === verifiedDonation.id ? verifiedDonation : donation,
          ),
        );
        setCreatedDonation((previous) =>
          previous ? { ...previous, status: verified.status } : previous,
        );
        onDonationUpdated?.(verifiedDonation);
        try {
          const donations = await apiService.donations.getByUser();
          donationStore.setDonations(donations);
        } catch (refreshError) {
          console.error("Failed to refresh donation history:", refreshError);
        }
        toast({ title: "Payment confirmed! Donation recorded." });
      } catch (verificationError) {
        console.error("Razorpay verification pending:", verificationError);
        toast({
          title: "Payment submitted",
          description:
            "We could not confirm the payment yet. Your donation status will update after server verification.",
        });
      }
    } catch (_error: unknown) {
      console.error(_error);

      if (
        axios.isAxiosError(_error) &&
        _error.response?.status === 402 &&
        _error.response?.data?.requiresKyc
      ) {
        setRequiresKyc(true);
        toast({
          title: "KYC Verification Required",
          description:
            "Donations over ₹10,000 require KYC verification before an order can be created.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Donation failed", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitKyc = async () => {
    setSubmittingKyc(true);
    try {
      await apiService.auth.submitKyc(pan.trim().toUpperCase());
      setRequiresKyc(false);
      setPan("");
      toast({
        title: "KYC approved",
        description: "You can now retry your donation.",
      });
    } catch (error) {
      console.error("KYC submission failed:", error);
      toast({
        title: "KYC submission failed",
        description: "Check your PAN details and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingKyc(false);
    }
  };

  useEffect(() => {
    console.info("[Razorpay Checkout Debug] Donation polling effect started.", {
      cycle: pollingCycle,
    });

    if (
      !createdDonation ||
      createdDonation.status === "FAILED" ||
      !user?.id
    )
      return;

    let elapsed = 0;
    const intervalId = setInterval(async () => {
      elapsed += 3000;
      if (elapsed > 60000) {
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
        setDonations(userDonations);
        if (currentStatus) {
          setCreatedDonation((previous) =>
            previous &&
            (previous.status !== currentStatus.status ||
              previous.taxReceiptUrl !== currentStatus.taxReceiptUrl)
              ? {
                  ...previous,
                  status: currentStatus.status,
                  taxReceiptUrl: currentStatus.taxReceiptUrl,
                }
              : previous,
          );
          if (currentStatus.status !== createdDonation.status) {
            onDonationUpdated?.(currentStatus);
          }
          if (currentStatus.status === "FAILED") {
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [
    createdDonation,
    onDonationUpdated,
    pollingCycle,
    setDonations,
    user?.id,
  ]);

  const handleDownloadReceipt = () => {
    if (!createdDonation) return;

    try {
      downloadDonationReceipt({
        receiptId:
          createdDonation.orderId ||
          createdDonation.publicId ||
          createdDonation.id,
        donationId: createdDonation.publicId || createdDonation.id,
        donorName: user?.name || "Donor",
        ngoName: campaign?.ngoName || campaign?.ngo || "NGO",
        campaignName: campaign?.title || createdDonation.campaignTitle || "",
        category: campaign?.category,
        paymentMethod: createdDonation.paymentMethod.toUpperCase(),
        date: new Date(createdDonation.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        amount: createdDonation.amount,
      });
      toast({
        title: "Receipt generated successfully. Your receipt has been downloaded.",
      });
    } catch (error) {
      console.error("Receipt download failed:", error);
      toast({
        title: "Unable to generate the receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

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
      setDonations(
        useDonationStore.getState().donations.map((donation) =>
          donation.id === updated.id ? updated : donation,
        ),
      );
      onDonationUpdated?.(updated);
      try {
        const donations = await apiService.donations.getByUser();
        donationStore.setDonations(donations);
      } catch (refreshError) {
        console.error("Failed to refresh donation history:", refreshError);
      }
      toast({ title: "Payment confirmed! Donation recorded." });
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
    setRequiresKyc(false);
    setPan("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border border-border bg-card shadow-sm max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground">
            Donate to Campaign
          </DialogTitle>
          <DialogDescription>{campaign?.title}</DialogDescription>
        </DialogHeader>

        {requiresKyc ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Donations above ₹10,000 require donor KYC. Your donation has not
              been created and no Razorpay order was placed.
            </p>
            <div className="space-y-2">
              <label htmlFor="donor-pan" className="text-sm font-medium">
                PAN
              </label>
              <input
                id="donor-pan"
                value={pan}
                onChange={(event) => setPan(event.target.value.toUpperCase())}
                maxLength={10}
                autoComplete="off"
                placeholder="ABCDE1234F"
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSubmitKyc}
              disabled={submittingKyc || pan.trim().length !== 10}
            >
              {submittingKyc ? "Verifying PAN…" : "Submit KYC"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRequiresKyc(false)}
              disabled={submittingKyc}
            >
              Back to donation
            </Button>
          </div>
        ) : createdDonation ? (
          <div className="text-center space-y-4 py-4">
            {createdDonation.status === "SUCCESS" ? (
              <>
                <p className="flex items-center justify-center gap-2 font-semibold text-trust-green">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-trust-green" />
                  Payment Confirmed
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
            ) : createdDonation.status === "FAILED" ? (
              <>
                <p className="text-4xl">!</p>
                <p className="font-semibold text-destructive">Payment Failed</p>
                <p className="text-xs text-muted-foreground">
                  Razorpay reported that this payment failed. You can close this
                  dialog and try donating again.
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary animate-pulse">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
                <p className="font-semibold text-primary">Payment Initiated</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Waiting for verified payment confirmation. Closing checkout does not mark the donation successful.
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
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={handleDownloadReceipt}
                  >
                    Download Receipt
                  </Button>
                </div>
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
                    variant={amount === a && !custom ? "primary" : "outline"}
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
