import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Loader2, Shield } from "lucide-react";
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
    return "Anchor batch confirmed (Trace-It persisted status)";
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

function HelpText({ children }: { children: string }) {
  return <details className="relative inline-block align-middle"><summary aria-label="Explain this term" className="ml-1 inline-flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-border text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">i</summary><span className="absolute left-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-3rem)] rounded-md border border-border bg-popover p-3 text-xs font-normal text-popover-foreground shadow-md">{children}</span></details>;
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return <div className="flex min-w-0 items-start gap-2"><span className="min-w-0 break-all">{value}</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); toast({ title: `${label} copied` }); } catch { toast({ title: "Could not copy value", variant: "destructive" }); } }}><Copy className="h-3.5 w-3.5" /></Button></div>;
}

function checkLabel(status?: string): string {
  switch (status) {
    case "PASSED": return "Passed";
    case "FAILED": return "Failed";
    case "PENDING": return "Pending";
    case "NOT_APPLICABLE": return "Not applicable";
    default: return "Unavailable";
  }
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
        description: "Persisted records are shown with separate integrity checks where evidence is available. No underlying real-world claim is verified.",
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden border border-border bg-card p-0 shadow-sm">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
        <DialogTitle className="text-xl">Donation and anchor records</DialogTitle>
          <DialogDescription>
          Load persisted records for this donation. Opening this dialog does not verify integrity or query Solana.
          </DialogDescription>
        </DialogHeader>

        {attestations.length > 0 || anchors.length > 0 ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            <section className="rounded-md border border-border bg-muted/20 p-4" aria-label="Verification status">
              <h3 className="font-semibold">Persisted records found <HelpText>Trace-It returned database records. This does not independently verify a signature, blockchain state, or real-world claim.</HelpText></h3>
              <p className="mt-1 text-sm text-muted-foreground">The records were found in Trace-It. Checks below report local hash consistency and, when configured evidence is available, an independent Devnet account and transaction check. Attestation signatures and real-world claims are not verified.</p>
            </section>
            <section className="space-y-3" aria-label="Attestation records">
              <h3 className="font-semibold">Attestations <HelpText>An attestation is a stored confirmation associated with a donation workflow stage; the record itself is not independent verification.</HelpText></h3>
              <div className="grid gap-3 sm:grid-cols-2">
              {attestations.map((attestation) => (
                <article key={attestation.id} className="min-w-0 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{attestation.type.toUpperCase() === "RECEIPT" ? "Receipt confirmation" : "Delivery confirmation"}</h4><span className="rounded border border-border px-2 py-0.5 text-xs">{attestation.status}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">Record found · {new Date(attestation.createdAt).toLocaleString()}</p>
                  <details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Technical details</summary><div className="mt-2 space-y-2"><p className="font-medium">Attestation ID</p><CopyValue label="Attestation ID" value={attestation.id} /></div></details>
                </article>
              ))}
              </div>
            </section>
            <section className="space-y-3 rounded-md border border-border p-4" aria-label="Blockchain anchor status">
              <h3 className="font-semibold">Blockchain anchor records <HelpText>An anchor submits a cryptographic value to the configured blockchain; this screen displays persisted status and does not recheck the chain.</HelpText></h3>
              {anchors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chained provenance proof was returned for this donation.
                </p>
              ) : (
                <div className="space-y-4">
                  {anchors.map((anchor, index) => {
                    return (
                      <div className="min-w-0 rounded-md bg-muted/30 p-3 text-sm" key={`${anchor.eventType}-${anchor.batchId ?? index}`}>
                        <p><strong>Event:</strong> {anchor.eventType}</p>
                        <p><strong>Status:</strong> {describeAnchorState(anchor)}</p>
                        {anchor.anchoredAt && <p><strong>Recorded at:</strong> {new Date(anchor.anchoredAt).toLocaleString()}</p>}
                        {anchor.verification && <div className="mt-2 rounded border border-border bg-card p-3"><p className="font-medium">Independent checks <HelpText>These checks validate stored hashes and query configured blockchain data. They do not prove an underlying real-world claim.</HelpText></p><dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2"><div><dt>Provenance hashes</dt><dd>{checkLabel(anchor.verification.provenance.status)}</dd></div><div><dt>Batch root</dt><dd>{checkLabel(anchor.verification.batchRoot.status)}</dd></div><div><dt>On-chain anchor record</dt><dd>{checkLabel(anchor.verification.onChainRecord.status)}</dd></div><div><dt>Transaction</dt><dd>{checkLabel(anchor.verification.transaction.status)}</dd></div><div><dt>Attestation signature</dt><dd>{checkLabel(anchor.verification.attestationSignature.status)}</dd></div></dl>{[anchor.verification.provenance, anchor.verification.batchRoot, anchor.verification.onChainRecord, anchor.verification.transaction, anchor.verification.attestationSignature].filter((check) => check.reason).map((check, reasonIndex) => <p key={reasonIndex} className="mt-1 text-xs text-muted-foreground">{check.reason}</p>)}</div>}
                        <details className="mt-2"><summary className="cursor-pointer">Hashes and transaction details</summary><div className="mt-2 space-y-2"><div><p className="font-medium">Payload hash <HelpText>Fingerprint of the canonical provenance event representation; it does not establish that the event is true.</HelpText></p><CopyValue label="Payload hash" value={anchor.payloadHash} /></div><div><p className="font-medium">Chain hash <HelpText>SHA-512 of this event payload hash and the preceding chain hash.</HelpText></p><CopyValue label="Chain hash" value={anchor.chainHash ?? "Unavailable (legacy event)"} /></div>
                        {anchor.transactionSignature && isValidSolanaSignature(anchor.transactionSignature) && (
                          <div>
                            <p className="font-medium">Transaction signature <HelpText>Identifier used to locate this transaction in the blockchain explorer; it does not verify associated application data.</HelpText></p><a
                              className="break-all text-primary underline underline-offset-2"
                              href={`https://explorer.solana.com/tx/${encodeURIComponent(anchor.transactionSignature)}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="break-all">{anchor.transactionSignature}</span>
                            </a><CopyValue label="Transaction signature" value={anchor.transactionSignature} />
                          </div>
                        )}</div></details>
                        {anchor.transactionSignature && !isValidSolanaSignature(anchor.transactionSignature) && (
                          <p className="text-destructive">The returned transaction reference is invalid; no Explorer link is shown.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Anchor lifecycle status is persisted by Trace-It. The separate checks above query Devnet when the batch and RPC evidence are available; they do not establish that the underlying event occurred.</p>
            </section>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
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

              </div>
            )}
          </div>
        )}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-3">
          {(attestations.length > 0 || anchors.length > 0) ? <Button onClick={() => onOpenChange(false)}>Close</Button> : <>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button onClick={verifyAttestation} disabled={verifying}>
                    {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : hasChecked || loadError ? "Retry record lookup" : "Load records"}
                  </Button>
                </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
