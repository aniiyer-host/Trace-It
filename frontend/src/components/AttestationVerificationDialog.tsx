import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import type { Donation, Attestation, DonationAnchorStatus } from "@/types";

interface AttestationVerificationDialogProps {
  donation: Donation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOLANA_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function describeAnchorState(anchor: DonationAnchorStatus): string {
  if (
    anchor.status === "ANCHORED" &&
    anchor.batchStatus === "CONFIRMED" &&
    isValidSolanaSignature(anchor.transactionSignature)
  ) {
    return "Anchor batch confirmed (persisted status; not independently rechecked)";
  }
  if (anchor.status === "FAILED") return "Anchoring failed; this event is not confirmed";
  if (anchor.status === "PENDING") return "Waiting to be batched; not confirmed";
  if (anchor.batchStatus === "RETRYABLE") return "Retry scheduled; not confirmed";
  if (
    anchor.batchStatus === "DEAD_LETTER" ||
    anchor.batchStatus === "TERMINAL_FAILURE"
  ) {
    return "Anchoring failed; this event is not confirmed";
  }
  if (anchor.batchStatus === "SUBMITTING") {
    return isValidSolanaSignature(anchor.transactionSignature)
      ? "Transaction submitted; awaiting confirmation"
      : "Transaction submission in progress; not yet confirmed";
  }
  if (anchor.batchStatus === "RECONCILIATION_REQUIRED") {
    return isValidSolanaSignature(anchor.transactionSignature)
      ? "Transaction submitted; confirmation is being reconciled"
      : "Submission is being reconciled; not yet confirmed";
  }
  if (anchor.status === "ANCHORED") {
    return "Backend records an anchored event, but confirmation details are incomplete";
  }
  if (anchor.status === "BATCHED") return "Queued in an anchor batch; not confirmed";
  return "Anchoring status unavailable";
}

function isValidSolanaSignature(signature: string | null): signature is string {
  if (!signature || !/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature)) {
    return false;
  }

  let decoded = 0n;
  for (const character of signature) {
    const value = SOLANA_BASE58_ALPHABET.indexOf(character);
    if (value < 0) return false;
    decoded = decoded * 58n + BigInt(value);
  }

  let byteLength = 0;
  while (decoded > 0n) {
    byteLength += 1;
    decoded >>= 8n;
  }
  const leadingZeroBytes = signature.match(/^1*/)?.[0].length ?? 0;
  return byteLength + leadingZeroBytes === 64;
}

export default function AttestationVerificationDialog({
  donation,
  open,
  onOpenChange,
}: AttestationVerificationDialogProps) {
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [anchors, setAnchors] = useState<DonationAnchorStatus[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setAttestations([]);
    setAnchors([]);
    setHasChecked(false);
    setLoadError(null);
  }, [donation.id, open]);

  const verifyAttestation = async () => {
    setVerifying(true);
    setLoadError(null);

    try {
      const [result, anchorResult] = await Promise.all([
        apiService.donations.getAttestation(donation.id),
        apiService.donations.getAnchors(donation.id),
      ]);
      setAttestations(result);
      setAnchors(anchorResult.anchors);
      setHasChecked(true);

      if (result.length === 0 && anchorResult.anchors.length === 0) {
        toast({
          title: "No persisted proof is available",
        });
        return;
      }

      toast({
        title: result.length > 0 ? "Attestation record found" : "Anchor status found",
        description: "These are persisted Trace-It records. This screen does not independently verify blockchain state or the underlying real-world claims.",
      });
    } catch (error) {
      console.error("Failed to verify attestation:", error);
      setLoadError("Could not load the persisted donation and anchor records. Try again.");
      toast({
        title: "Failed to verify attestation",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border border-border bg-card shadow-sm">
        <DialogHeader>
        <DialogTitle className="text-xl">Donation and anchor records</DialogTitle>
          <DialogDescription>
          Load persisted records for this donation. Opening this dialog does not verify integrity or query Solana.
          </DialogDescription>
        </DialogHeader>

        {attestations.length > 0 || anchors.length > 0 ? (
          <div className="space-y-6 p-6">
            {attestations.map((attestation) => (
              <div key={attestation.id} className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-trust-green">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-trust-green"
                      />
                      Attestation Record Found
                    </h3>
                    <p className="text-muted-foreground">
                      This attestation record exists in the Trace-It database.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-medium">Attestation Details:</p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Attestation ID:</strong> {attestation.id}
                      </p>
                      <p>
                        <strong>Type:</strong>{" "}
                        {attestation.type.toUpperCase() === "RECEIPT"
                          ? "Receipt Confirmation"
                          : "Delivery Confirmation"}
                      </p>
                      <p>
                        <strong>Status:</strong> {attestation.status}
                      </p>
                      <p>
                        <strong>Timestamp:</strong>{" "}
                        {new Date(attestation.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium">Attestation Statement:</p>
                    <p className="text-muted-foreground bg-muted/50 p-4 rounded">
                      This record is stored in the Trace-It database.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <p className="font-medium">Verification Information:</p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Database Status:</strong>{" "}
                        <span className="inline-flex items-center gap-2 text-trust-green">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full bg-trust-green"
                          />
                          Record found
                        </span>
                      </p>
                      <p>
                        <strong>Integrity:</strong> This lookup confirms database
                        existence only.
                      </p>
                      <p>
                        <strong>Not verified:</strong> No cryptographic signature
                        or blockchain anchor was checked.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => onOpenChange(false)}
                    className="w-full md:w-auto"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ))}
            <section className="space-y-3 rounded-md border border-border p-4" aria-label="Blockchain anchor status">
              <h3 className="font-semibold">Blockchain anchor status</h3>
              {anchors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chained provenance proof was returned for this donation.
                </p>
              ) : (
                <div className="space-y-4">
                  {anchors.map((anchor, index) => {
                    return (
                      <div className="space-y-1 text-sm" key={`${anchor.eventType}-${anchor.batchId ?? index}`}>
                        <p><strong>Event:</strong> {anchor.eventType}</p>
                        <p className="break-all"><strong>Payload hash:</strong> {anchor.payloadHash}</p>
                        <p className="break-all"><strong>Chain hash:</strong> {anchor.chainHash ?? "Unavailable (legacy event)"}</p>
                        <p><strong>Status:</strong> {describeAnchorState(anchor)}</p>
                        {anchor.anchoredAt && <p><strong>Recorded at:</strong> {new Date(anchor.anchoredAt).toLocaleString()}</p>}
                        {anchor.transactionSignature && isValidSolanaSignature(anchor.transactionSignature) && (
                          <p>
                            <strong>Transaction:</strong>{" "}
                            <a
                              className="break-all text-primary underline underline-offset-2"
                              href={`https://explorer.solana.com/tx/${encodeURIComponent(anchor.transactionSignature)}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {anchor.transactionSignature}
                            </a>
                          </p>
                        )}
                        {anchor.transactionSignature && !isValidSolanaSignature(anchor.transactionSignature) && (
                          <p className="text-destructive">The returned transaction reference is invalid; no Explorer link is shown.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Status comes from Trace-It&apos;s database. An on-chain digest commits to recorded event data; it does not prove the event&apos;s real-world claims.
              </p>
            </section>
            {attestations.length === 0 && (
              <div className="flex justify-end">
                <Button onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {verifying ? (
              <div className="flex items-center justify-center space-x-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Checking the database record...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {loadError ? (
                  <p role="alert" className="text-sm text-destructive">{loadError}</p>
                ) : hasChecked ? (
                  <p className="text-sm text-muted-foreground">
                    No persisted attestation or chained provenance proof was returned for this donation. This does not establish that no other record exists.
                  </p>
                ) : null}
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center bg-yellow-50 text-yellow-500 rounded-full">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{hasChecked ? "Proof unavailable" : "Ready to load records"}</h3>
                    <p className="text-muted-foreground">
                      The action loads database records only; it does not independently verify blockchain state.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium">What is being verified:</p>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Donation ID:</strong>{" "}
                      {donation.id.substring(0, 8)}...
                    </p>
                    <p>
                      <strong>Amount:</strong> ₹
                      {donation.amount.toLocaleString()}
                    </p>
                    <p>
                      <strong>Campaign:</strong> {donation.campaignTitle}
                    </p>
                    <p>
                      <strong>Attestation Type:</strong> Receipt Confirmation
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium">Verification Process:</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>
                      Retrieve the attestation record from the Trace-It database.
                    </li>
                    <li>
                      Confirm that the database returned a matching record.
                    </li>
                    <li>
                      Review the attestation details associated with the record.
                    </li>
                    <li>
                      No cryptographic or blockchain tamper check is performed.
                    </li>
                  </ol>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={verifyAttestation}
                    disabled={verifying}
                    className="w-full md:w-auto"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      hasChecked || loadError ? "Retry record lookup" : "Load records"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
