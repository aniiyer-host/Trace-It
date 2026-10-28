import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, Copy, ExternalLink, HeartHandshake, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Donation } from "@/types";
import { apiService } from "@/utils/apiClient";
import type { DonationAnchorStatus } from "@/types";

interface AttestationDetailsModalProps {
  donation: Donation;
  onClose: () => void;
  onVerifyIntegrity: (donationId: string) => void;
}

type TimelineState = "complete" | "pending" | "failed" | "unavailable";

function TimelineStatus({ state, children }: { state: TimelineState; children: string }) {
  const styles: Record<TimelineState, string> = {
    complete: "border-trust-green/30 bg-trust-green/10 text-trust-green",
    pending: "border-primary/30 bg-primary/10 text-primary",
    failed: "border-destructive/30 bg-destructive/10 text-destructive",
    unavailable: "border-border bg-muted text-muted-foreground",
  };
  const Icon = state === "complete" ? CheckCircle2 : state === "failed" ? AlertCircle : Clock3;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[state]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function formatAmount(value: number, currencyCode = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function paymentStatus(status: Donation["status"]): { state: TimelineState; label: string } {
  if (status === "FAILED" || status === "failed") return { state: "failed", label: "Payment failed" };
  if (status === "REFUNDED") return { state: "unavailable", label: "Refunded" };
  if (["SUCCESS", "ALLOCATED", "DISBURSED", "DELIVERED", "allocated", "disbursed", "delivered"].includes(status)) {
    return { state: "complete", label: "Payment confirmed" };
  }
  if (status === "INITIATED" || status === "pending") return { state: "pending", label: "Awaiting confirmation" };
  return { state: "unavailable", label: "Status unavailable" };
}

function attestationStatus(donation: Donation, type: "RECEIPT" | "DELIVERY") {
  const records = Array.isArray(donation.attestations) ? donation.attestations : [];
  const matching = records.filter((record) => record.type.toUpperCase() === type);
  const approved = matching.some((record) => record.status.toUpperCase() === "APPROVED");
  const pending = matching.some((record) => record.status.toUpperCase() === "PENDING");
  const latest = [...matching].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  return {
    state: approved ? "complete" as const : pending ? "pending" as const : "unavailable" as const,
    label: approved ? "Recorded as approved" : pending ? "Pending NGO action" : "No record yet",
    detail: latest ? `Updated ${formatDate(latest.createdAt)}` : "No matching record was returned.",
  };
}

function receiptErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "MISSING_RECEIPT_DOWNLOAD_URL") {
    return "The receipt service did not return a download link. Please try again.";
  }
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) return "Your session has expired. Sign in again to download this receipt.";
  if (status === 404) return "This donation could not be found for your account.";
  if (status === 400) return "A receipt is available after the payment is confirmed.";
  return "The receipt could not be downloaded. Please try again.";
}

export default function AttestationDetailsModal({ donation, onClose, onVerifyIntegrity }: AttestationDetailsModalProps) {
  const { toast } = useToast();
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [anchorResult, setAnchorResult] = useState<{ donationId: string; anchors: DonationAnchorStatus[] } | null>(null);
  const receiptRequestVersion = useRef(0);
  const activeDonationId = useRef(donation.id);
  activeDonationId.current = donation.id;

  useEffect(() => {
    receiptRequestVersion.current += 1;
    setReceiptLoading(false);
    setAnchorResult(null);
    const donationId = donation.id;
    let active = true;
    void apiService.donations.getAnchors(donationId)
      .then(({ anchors }) => {
        if (active && activeDonationId.current === donationId) setAnchorResult({ donationId, anchors });
      })
      .catch(() => {
        if (active && activeDonationId.current === donationId) setAnchorResult({ donationId, anchors: [] });
      });
    return () => {
      active = false;
      receiptRequestVersion.current += 1;
    };
  }, [donation.id]);

  const status = paymentStatus(donation.status);
  const currencyCode = donation.currencyCode || "INR";
  const allocatedAmount = Number(donation.allocatedAmount ?? 0);
  const receiptEligible = ["SUCCESS", "ALLOCATED", "DISBURSED", "DELIVERED"].includes(donation.status.toUpperCase());
  const receiptUnavailableMessage = donation.status.toUpperCase() === "FAILED"
    ? "A receipt is unavailable because this payment failed."
    : "A receipt is available after payment confirmation.";
  const receiptConfirmation = attestationStatus(donation, "RECEIPT");
  const deliveryConfirmation = attestationStatus(donation, "DELIVERY");
  const verifiedDonationAnchor = (anchorResult?.donationId === donation.id ? anchorResult.anchors : []).find((anchor) =>
    anchor.eventType === "DONATION_SUCCESS" &&
    anchor.network === "devnet" &&
    Boolean(anchor.transactionSignature && anchor.explorerUrl) &&
    anchor.verification?.provenance.status === "PASSED" &&
    anchor.verification.batchRoot.status === "PASSED" &&
    anchor.verification.onChainRecord.status === "PASSED" &&
    anchor.verification.transaction.status === "PASSED"
  );
  const publicReceiptNumber = donation.publicId
    ? `TI-${donation.publicId.toUpperCase()}`
    : null;

  const handleDownloadReceipt = async () => {
    if (!receiptEligible) return;
    const donationId = donation.id;
    const requestVersion = ++receiptRequestVersion.current;
    setReceiptLoading(true);
    try {
      const { receiptUrl } = await apiService.donations.getReceipt(donationId);
      if (requestVersion !== receiptRequestVersion.current || activeDonationId.current !== donationId) return;
      if (typeof receiptUrl !== "string" || !receiptUrl.trim()) {
        throw new Error("MISSING_RECEIPT_DOWNLOAD_URL");
      }
      // The authenticated endpoint signs the object with Content-Disposition: attachment.
      // Navigating to it saves the generated HTML receipt instead of opening a missing local file.
      window.location.assign(receiptUrl);
    } catch (error) {
      if (requestVersion === receiptRequestVersion.current && activeDonationId.current === donationId) {
        toast({ title: "Receipt unavailable", description: receiptErrorMessage(error), variant: "destructive" });
      }
    } finally {
      if (requestVersion === receiptRequestVersion.current && activeDonationId.current === donationId) {
        setReceiptLoading(false);
      }
    }
  };

  const handleVerifyIntegrity = () => {
    onClose();
    onVerifyIntegrity(donation.id);
  };

  const allocationState: TimelineState = allocatedAmount > 0 || donation.status.toUpperCase() === "ALLOCATED"
    ? "complete"
    : "unavailable";
  const allocationLabel = allocatedAmount > 0
    ? `${formatAmount(allocatedAmount, currencyCode)} allocated`
    : donation.status.toUpperCase() === "ALLOCATED"
      ? "Allocation recorded"
      : "No allocation recorded";
  const disbursementDetail = ["DISBURSED", "DELIVERED"].includes(donation.status.toUpperCase())
    ? `Donation workflow status: ${donation.status}`
    : "A disbursement is not recorded in this donation status.";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden border border-border bg-card p-0 shadow-sm">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-xl">Donation details</DialogTitle>
          <DialogDescription className="mt-1">{donation.campaignTitle || "Donation"}{donation.ngoName ? ` · ${donation.ngoName}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          <Card className="border-border bg-muted/20 shadow-none">
            <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Donation amount</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{formatAmount(donation.amount, currencyCode)}</p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Campaign:</span> {donation.campaignTitle || "Unavailable"}</p>
                <p className="mt-1"><span className="font-medium text-foreground">Date:</span> {formatDate(donation.createdAt)}</p>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-3" aria-labelledby="donation-timeline-title">
            <div>
              <h3 id="donation-timeline-title" className="font-semibold">Donation timeline</h3>
              <p className="text-sm text-muted-foreground">A summary of the payment and confirmations recorded for this donation.</p>
            </div>
            <Card className="shadow-none">
              <CardContent className="divide-y divide-border p-0">
                <TimelineRow
                  title="Payment"
                  detail={`${donation.paymentMethod ? donation.paymentMethod.toUpperCase() : "Payment method unavailable"} · ${formatDate(donation.createdAt)}`}
                  state={status.state}
                  label={status.label}
                />
                <TimelineRow
                  title="Allocation and disbursement"
                  detail={`${allocationLabel}. ${disbursementDetail} Disbursement status does not independently confirm bank settlement.`}
                  state={allocationState}
                  label={allocationState === "complete" ? "Allocation recorded" : "Not recorded"}
                  icon={<Wallet className="h-4 w-4" />}
                />
                <TimelineRow
                  title="NGO receipt confirmation"
                  detail={`${receiptConfirmation.detail} This is the NGO workflow record.`}
                  state={receiptConfirmation.state}
                  label={receiptConfirmation.label}
                  icon={<HeartHandshake className="h-4 w-4" />}
                />
                <TimelineRow
                  title="Beneficiary delivery evidence"
                  detail={`${deliveryConfirmation.detail} An approved record is not independent proof of an outcome.`}
                  state={deliveryConfirmation.state}
                  label={deliveryConfirmation.label}
                  icon={<HeartHandshake className="h-4 w-4" />}
                />
              </CardContent>
            </Card>
          </section>

          <details className="rounded-md border border-border bg-muted/10">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Payment &amp; technical references</summary>
            <div className="space-y-3 border-t border-border px-4 py-4 text-sm">
              <ReferenceRow label="Internal Donation ID (internal reference)" value={donation.id} />
              <ReferenceRow label="Razorpay Order ID" value={donation.razorpayOrderId} />
              <ReferenceRow label="Razorpay Payment ID" value={donation.razorpayPaymentId} />
              <ReferenceRow label="Public receipt number" value={publicReceiptNumber ?? undefined} />
              <div>
                <p className="font-medium">Solana transaction signature</p>
                {verifiedDonationAnchor?.transactionSignature && verifiedDonationAnchor.explorerUrl ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <a className="min-w-0 break-all text-primary underline underline-offset-2" href={verifiedDonationAnchor.explorerUrl} target="_blank" rel="noreferrer">
                      {verifiedDonationAnchor.transactionSignature}
                      <ExternalLink className="ml-1 inline h-3 w-3" aria-label="Open Devnet Explorer" />
                    </a>
                    <CopyReference label="Solana transaction signature" value={verifiedDonationAnchor.transactionSignature} />
                  </div>
                ) : <p className="text-muted-foreground">Unavailable</p>}
              </div>
            </div>
          </details>

          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Blockchain integrity</p>
              <p className="text-xs text-muted-foreground">Detailed checks and technical evidence are available separately.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleVerifyIntegrity}>Open Verify Integrity</Button>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-between gap-2 border-t border-border bg-card px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {receiptEligible ? (
            <Button type="button" onClick={handleDownloadReceipt} disabled={receiptLoading}>
              {receiptLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Preparing download…</> : "Download Receipt"}
            </Button>
          ) : <p className="self-center text-xs text-muted-foreground">{receiptUnavailableMessage}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="font-medium">{label}</p>
      {value ? <CopyReference label={label} value={value} /> : <p className="text-muted-foreground">Unavailable</p>}
    </div>
  );
}

function CopyReference({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="min-w-0 break-all text-muted-foreground">{value}</span>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Copy ${label}`} onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast({ title: `${label} copied` });
        } catch {
          toast({ title: "Could not copy value", variant: "destructive" });
        }
      }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function TimelineRow({
  title,
  detail,
  state,
  label,
  icon,
}: {
  title: string;
  detail: string;
  state: TimelineState;
  label: string;
  icon?: ReactNode;
}) {
  const StatusIcon = state === "complete" ? CheckCircle2 : state === "failed" ? AlertCircle : Clock3;

  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon ?? <StatusIcon className="h-4 w-4" />}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <TimelineStatus state={state}>{label}</TimelineStatus>
    </div>
  );
}
