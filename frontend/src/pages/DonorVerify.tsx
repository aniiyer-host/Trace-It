import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, CircleHelp, Copy, ExternalLink, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { apiService } from "@/utils/apiClient";
import type { Donation, DonationAnchorStatus } from "@/types";

type VerifyData = { anchors: DonationAnchorStatus[] };

function checkDescription(check: string, status: string) {
  if (status === "NOT_APPLICABLE") return "Blockchain verification is not applicable yet because this event has not been assigned to an anchor batch.";
  if (status === "PENDING") return `The ${check} check is awaiting completion.`;
  if (status === "UNAVAILABLE") return `Evidence for the ${check} check could not be retrieved or checked.`;
  if (status === "FAILED") return `The ${check} check failed.`;
  if (status === "PASSED") return `The ${check} check passed.`;
  return `The ${check} check has status ${status}.`;
}

function labelStatus(status: string) {
  const labels: Record<string, string> = {
    INITIATED: "Payment being processed", SUCCESS: "Payment recorded", FAILED: "Payment failed",
    REFUNDED: "Donation refunded", REFUND_PENDING: "Refund being processed",
    REFUND_RECONCILIATION_REQUIRED: "Refund requires attention", ALLOCATED: "Contribution accepted",
    DISBURSED: "Funds disbursed", DELIVERED: "Delivery recorded", PENDING: "Waiting for confirmation",
    BATCHED: "Waiting for blockchain confirmation", ANCHORED: "Blockchain record confirmed",
  };
  return labels[status] ?? status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function CheckLine({ title, text, status }: { title: string; text: string; status: string }) {
  const passed = status === "PASSED";
  const failed = status === "FAILED";
  return <div className="flex items-start gap-3 rounded-lg border border-border p-3">
    {passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : failed ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
    <div><p className="text-sm font-medium">{title}: {passed ? "Verified" : failed ? "Problem detected" : "Not confirmed"}</p><p className="mt-0.5 text-sm text-muted-foreground">{text}</p></div>
  </div>;
}

function Evidence({ evidence }: { evidence: VerifyData }) {
  if (!evidence.anchors.length) return <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No provenance events are available for this donation yet.</p>;
  return <div className="mt-4 space-y-4">{evidence.anchors.map((anchor, index) => {
    const checks = anchor.verification;
    return <div key={`${anchor.eventType}-${index}`} className="space-y-3 rounded-lg bg-muted/50 p-4">
      <h3 className="text-sm font-semibold">{labelStatus(anchor.eventType)}</h3>
      {checks && <div className="grid gap-2 md:grid-cols-2">
        <CheckLine title="Record history" status={checks.provenance.status} text={checks.provenance.reason ?? "The recorded history links correctly to the preceding records."} />
        <CheckLine title="Batch integrity" status={checks.batchRoot.status} text={checks.batchRoot.reason ?? "The stored events match the locally recorded batch root."} />
        <CheckLine title="On-chain record" status={checks.onChainRecord.status} text={checks.onChainRecord.reason ?? checkDescription("on-chain record", checks.onChainRecord.status)} />
        <CheckLine title="Transaction" status={checks.transaction.status} text={checks.transaction.reason ?? checkDescription("transaction", checks.transaction.status)} />
      </div>}
      {anchor.explorerUrl && <a href={anchor.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">View confirmed transaction <ExternalLink className="h-3.5 w-3.5" /></a>}
      <details className="text-sm"><summary className="cursor-pointer font-medium">Technical details</summary>
        <dl className="mt-3 grid gap-2 break-all text-muted-foreground sm:grid-cols-2">
          <div><dt className="font-medium text-foreground">Event</dt><dd>{anchor.eventType}</dd></div>
          <div><dt className="font-medium text-foreground">Batch</dt><dd>{anchor.batchId ?? "Not assigned"}</dd></div>
          <div><dt className="font-medium text-foreground">Payload fingerprint</dt><dd>{anchor.payloadHash}</dd></div>
          <div><dt className="font-medium text-foreground">Chain fingerprint</dt><dd>{anchor.chainHash ?? "Unavailable"}</dd></div>
          {anchor.transactionSignature && <div><dt className="font-medium text-foreground">Transaction reference</dt><dd className="flex items-center gap-2">{anchor.transactionSignature}<button aria-label="Copy transaction reference" onClick={() => void navigator.clipboard.writeText(anchor.transactionSignature!)}><Copy className="h-4 w-4" /></button></dd></div>}
        </dl>
      </details>
    </div>;
  })}</div>;
}

export default function DonorVerify() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, VerifyData>>({});
  const [verifyError, setVerifyError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || user.role !== "DONOR") return;
    apiService.donations.getByUser().then(setDonations).catch(() => setError(true)).finally(() => setLoading(false));
  }, [user]);

  if (!user) return <div className="mx-auto max-w-xl py-20 text-center"><h1 className="text-2xl font-semibold">Sign in to verify your donations</h1><Button className="mt-5" onClick={() => navigate("/login")}>Sign in</Button></div>;
  if (user.role && user.role !== "DONOR") return <Navigate to={user.role === "ADMIN" ? "/admin" : "/ngo"} replace />;

  const verify = async (id: string) => {
    if (activeId) return;
    setActiveId(id); setVerifyError((current) => ({ ...current, [id]: "" }));
    try { const result = await apiService.donations.getAnchors(id); setEvidence((current) => ({ ...current, [id]: result })); }
    catch { setVerifyError((current) => ({ ...current, [id]: "We couldn't complete the check right now. This does not mean a problem was found with your donation." })); }
    finally { setActiveId(null); }
  };

  return <div className="mx-auto max-w-4xl space-y-8 pb-16">
    <header className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">Verify Your Donations</h1><p className="max-w-3xl text-muted-foreground">Your contribution matters. Here, you can check how each donation has been recorded, track its current status, and verify the records that help protect its integrity.</p></header>
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />How does verification work?</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">
        {["Your donation is recorded: the platform saves the payment and its details.", "A verification fingerprint is created: it can help reveal changes to the saved record.", "Records are linked together: changing an earlier record would disrupt those links.", "Blockchain adds a public reference: selected fingerprints are recorded on Solana for an additional integrity check."].map((item, i) => <li key={item} className="flex gap-3 text-sm text-muted-foreground"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{i + 1}</span>{item}</li>)}
      </ol><p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">These checks help confirm the integrity of information recorded by Trace-It. They do not prove a bank transfer independently or show how an NGO spends funds.</p>
      <p className="mt-4 text-center text-xs font-medium text-muted-foreground">Donation → Platform record → Verification fingerprint → Blockchain reference</p>
    </section>
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Your donations</h2><p className="mt-1 text-sm text-muted-foreground">Each status describes a separate part of your donation.</p></div>
      {loading ? <div role="status" className="rounded-xl border p-8 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading your donations…</div>
        : error ? <div role="alert" className="rounded-xl border border-destructive/30 p-6 text-sm">We couldn’t load your donations. Please refresh the page and try again.</div>
          : donations.length === 0 ? <div className="rounded-xl border p-8 text-center text-muted-foreground">No donations found for your account yet.</div>
            : donations.map((donation) => <article key={donation.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="space-y-1"><p className="text-xl font-semibold">{donation.currencyCode ?? "INR"} {Number(donation.amount).toLocaleString()}</p><p className="text-sm text-muted-foreground">{donation.campaignTitle || "General NGO donation"}{donation.ngoName ? ` · ${donation.ngoName}` : ""}</p><p className="text-sm text-muted-foreground">{new Date(donation.createdAt).toLocaleDateString()} · Reference {donation.publicId ?? donation.id}</p><p className="text-sm">{labelStatus(String(donation.status))}</p>{String(donation.status) === "REFUND_RECONCILIATION_REQUIRED" && <p className="text-sm text-destructive">This refund needs attention from our support team.</p>}</div>
                <Button onClick={() => void verify(donation.id)} disabled={activeId !== null}>{activeId === donation.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{activeId === donation.id ? "Checking…" : evidence[donation.id] ? "Check again" : "Verify"}</Button></div>
              {verifyError[donation.id] && <p role="alert" className="mt-4 text-sm text-destructive">{verifyError[donation.id]}</p>}
              {evidence[donation.id] && <Evidence evidence={evidence[donation.id]} />}
            </article>)}
    </section>
  </div>;
}
