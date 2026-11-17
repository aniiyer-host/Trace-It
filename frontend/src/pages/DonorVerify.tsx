import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, CircleHelp, Copy, ExternalLink, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { apiService } from "@/utils/apiClient";
import type { DonationAnchorStatus } from "@/types";
type VerifyDonation = { id: string; publicId?: string; amount: number | string; currencyCode?: string; status: string; createdAt: string; campaignTitle?: string | null; ngoName?: string | null };
type IntegrityAlert = { id: string; donationId: string; eventId: string | null; batchId: string | null; failureType: string; source: string; severity: string; details: unknown; detectedAt: string; resolvedAt: string | null };

type AdminForensicAnchor = {
  eventId: string; sequence: string; entityType: string; entityId: string; eventType: string; occurredAt: string;
  scope: string; severity: string; explanation: string;
  payloadHash: { status: string; observed: string; expected: string | null };
  canonicalPayload: { status: string; fieldDifferences: Array<{ field: string; observed: unknown; expected: unknown }> };
  previousHash: { status: string; observed: string | null };
  chainHash: { status: string; observed: string | null; expected: string | null };
  verification: Record<string, { status: string; reason?: string }>;
  batch: null | { id: string; key: string; expectedKey: string | null; auditRoot: string; expectedAuditRoot: string | null; nonce: string | null; sequenceStart: string; sequenceEnd: string; eventCount: number; status: string; pda: string | null; transactionSignature: string | null; anchoredAt: string | null };
};
type VerifyData = { anchors: DonationAnchorStatus[] } | { anchors: AdminForensicAnchor[]; generatedAt: string; source: string; chain: { status: string; checkedEvents: number; legacyEvents: number; errors: Array<{ eventId: string; reason: string }> }; limitations: string[] };

function checkDescription(check: string, status: string) {
  if (status === "NOT_APPLICABLE") return "Blockchain verification is not applicable yet because this event has not been assigned to an anchor batch.";
  if (status === "PENDING") return `The ${check} check is awaiting completion.`;
  if (status === "UNAVAILABLE") return `Evidence for the ${check} check could not be retrieved or checked.`;
  if (status === "FAILED") return "We detected an inconsistency in the recorded donation history. Our team has been notified.";
  if (status === "PASSED") return `The ${check} check passed.`;
  return `The ${check} check has status ${status}.`;
}

function audienceDescription(status: string, reason: string | undefined, userRole?: string) {
  if (userRole === "DONOR") {
    if (status === "FAILED") return "We detected an inconsistency in the recorded donation history. Our team has been notified.";
    if (status === "UNAVAILABLE") return "Blockchain verification is temporarily unavailable. We could not confirm this result.";
    if (status === "PENDING") return "Verification is currently pending.";
  }
  return reason ?? "No additional details are available.";
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
    {passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : failed ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> : <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
    <div><p className={`text-sm font-medium ${failed ? "text-amber-800 dark:text-amber-300" : ""}`}>{title}: {passed ? "Verified" : failed ? "Integrity concern" : status === "PENDING" ? "Pending" : status === "UNAVAILABLE" ? "Temporarily unavailable" : "Not confirmed"}</p><p className="mt-0.5 text-sm text-muted-foreground">{text}</p></div>
  </div>;
}

function Evidence({ evidence, userRole }: { evidence: { anchors: DonationAnchorStatus[] }; userRole?: string }) {
  if (!evidence.anchors.length) return <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No provenance events are available for this donation yet.</p>;
  return <div className="mt-4 space-y-4">{evidence.anchors.map((anchor, index) => {
    const checks = anchor.verification;
    return <div key={`${anchor.eventType}-${index}`} className="space-y-3 rounded-lg bg-muted/50 p-4">
      <h3 className="text-sm font-semibold">{labelStatus(anchor.eventType)}</h3>
      {checks && <div className="grid gap-2 md:grid-cols-2">
        <CheckLine title="Record history" status={checks.provenance.status} text={audienceDescription(checks.provenance.status, checks.provenance.reason ?? "The recorded history links correctly to the preceding records.", userRole)} />
        <CheckLine title="Batch integrity" status={checks.batchRoot.status} text={audienceDescription(checks.batchRoot.status, checks.batchRoot.reason ?? "The stored events match the locally recorded batch root.", userRole)} />
        <CheckLine title="On-chain record" status={checks.onChainRecord.status} text={audienceDescription(checks.onChainRecord.status, checks.onChainRecord.reason ?? checkDescription("on-chain record", checks.onChainRecord.status), userRole)} />
        <CheckLine title="Transaction" status={checks.transaction.status} text={audienceDescription(checks.transaction.status, checks.transaction.reason ?? (checks.transaction.status === "NOT_APPLICABLE" && anchor.batchId
          ? checks.onChainRecord.status === "UNAVAILABLE"
            ? "The transaction check could not run because the on-chain record could not be retrieved."
            : "The transaction check could not run because the on-chain record did not match this batch."
          : checkDescription("transaction", checks.transaction.status)), userRole)} />
      </div>}
      {anchor.explorerUrl && <a href={anchor.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">View confirmed transaction <ExternalLink className="h-3.5 w-3.5" /></a>}
      {userRole !== "DONOR" && <details className="text-sm"><summary className="cursor-pointer font-medium">Technical details</summary>
        <dl className="mt-3 grid gap-2 break-all text-muted-foreground sm:grid-cols-2">
          <div><dt className="font-medium text-foreground">Event</dt><dd>{anchor.eventType}</dd></div>
          <div><dt className="font-medium text-foreground">Batch</dt><dd>{anchor.batchId ?? "Not assigned"}</dd></div>
          <div><dt className="font-medium text-foreground">Payload fingerprint</dt><dd>{anchor.payloadHash}</dd></div>
          <div><dt className="font-medium text-foreground">Chain fingerprint</dt><dd>{anchor.chainHash ?? "Unavailable"}</dd></div>
          {anchor.transactionSignature && <div><dt className="font-medium text-foreground">Transaction reference</dt><dd className="flex items-center gap-2">{anchor.transactionSignature}<button aria-label="Copy transaction reference" onClick={() => void navigator.clipboard.writeText(anchor.transactionSignature!)}><Copy className="h-4 w-4" /></button></dd></div>}
        </dl>
      </details>}
    </div>;
  })}</div>;
}

function AdminEvidence({ evidence }: { evidence: Extract<VerifyData, { generatedAt: string }> }) {
  if (!evidence.anchors.length) return <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">No provenance events are available for this donation.</p>;
  return <div className="mt-4 space-y-4">
    <div className={`rounded-lg border p-4 ${evidence.chain.status === "FAILED" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}>
      <p className="font-semibold">On-demand chain check: {evidence.chain.status === "FAILED" ? "Inconsistency found" : "Passed"}</p>
      <p className="mt-1 text-sm text-muted-foreground">Checked {evidence.chain.checkedEvents} chained events · {evidence.chain.legacyEvents} legacy events without chain hashes · {new Date(evidence.generatedAt).toLocaleString()}</p>
      {evidence.chain.errors.map((error, index) => <p key={`${error.eventId}-${index}`} className="mt-2 text-sm">Event {error.eventId}: {error.reason}</p>)}
    </div>
    {evidence.anchors.map((event) => <article key={event.eventId} className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{event.severity} · {event.scope === "NONE" ? "No inconsistency" : `${event.scope.toLowerCase()} scope`}</p><p className="text-sm text-muted-foreground">Event {event.eventId} · sequence {event.sequence} · {event.eventType} · {new Date(event.occurredAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">{event.entityType} {event.entityId}</p></div><span className="rounded bg-muted px-2 py-1 text-xs">{event.scope === "NONE" ? "CHECKED" : event.scope === "BATCH" ? "BATCH REVIEW" : event.scope === "CHAIN" ? "CHAIN REVIEW" : "EVENT REVIEW"}</span></div>
      <p className="text-sm">{event.explanation}</p>
      <div className="grid gap-2 sm:grid-cols-2">{Object.entries(event.verification).map(([name, check]) => <div key={name} className="rounded border p-2 text-sm"><p className="font-medium">{name.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}: {check.status}</p>{check.reason && <p className="mt-1 text-xs text-muted-foreground">{check.reason}</p>}</div>)}</div>
      {event.canonicalPayload.fieldDifferences.length > 0 && <div className="rounded border border-destructive/30 p-3 text-sm"><p className="font-medium">Stored canonical payload differs from the current event columns</p><p className="text-xs text-muted-foreground">This identifies the differing value, but the current database alone cannot establish which copy is original.</p>{event.canonicalPayload.fieldDifferences.map((difference) => <p key={difference.field} className="mt-1 break-all text-xs">{difference.field}: payload {JSON.stringify(difference.observed)} · event column {JSON.stringify(difference.expected)}</p>)}</div>}
      <details><summary className="cursor-pointer text-sm font-medium">Hash evidence and batch details</summary><dl className="mt-3 grid gap-2 break-all text-xs sm:grid-cols-2"><div><dt className="font-medium">Payload hash</dt><dd>{event.payloadHash.status} · observed {event.payloadHash.observed} · expected {event.payloadHash.expected ?? "unavailable"}</dd></div><div><dt className="font-medium">Previous hash</dt><dd>{event.previousHash.status} · {event.previousHash.observed ?? "genesis/null"}</dd></div><div><dt className="font-medium">Chain hash</dt><dd>{event.chainHash.status} · observed {event.chainHash.observed ?? "unavailable"} · expected {event.chainHash.expected ?? "unavailable"}</dd></div>
        {event.batch && <><div><dt className="font-medium">Batch</dt><dd>{event.batch.id} · sequences {event.batch.sequenceStart}–{event.batch.sequenceEnd} · {event.batch.eventCount} events · {event.batch.status}</dd></div><div><dt className="font-medium">Batch key</dt><dd>observed {event.batch.key} · recomputed {event.batch.expectedKey ?? "unavailable"}</dd></div><div><dt className="font-medium">Audit root</dt><dd>observed {event.batch.auditRoot} · recomputed {event.batch.expectedAuditRoot ?? "unavailable"}</dd></div><div><dt className="font-medium">Nonce / PDA</dt><dd>{event.batch.nonce ?? "unavailable"} / {event.batch.pda ?? "unavailable"}</dd></div><div><dt className="font-medium">Transaction</dt><dd>{event.batch.transactionSignature ?? "unavailable"}</dd></div></>}
      </dl></details>
    </article>)}
    <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Evidence limits</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{evidence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>
  </div>;
}

export default function DonorVerify() {
  const { user } = useAuthStore();
  const userRole = user?.role;
  const navigate = useNavigate();
  const [donations, setDonations] = useState<VerifyDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, VerifyData>>({});
  const [verifyError, setVerifyError] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([]);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!user) return;
    const load = user.role === "DONOR" ? apiService.donations.getByUser() : user.role === "CHARITY" ? apiService.charity.getVerificationQueue().then((r) => r.donations) : user.role === "ADMIN" ? apiService.admin.getVerificationQueue().then((r) => r.donations) : Promise.resolve([]);
    load.then(setDonations).catch(() => setError(true)).finally(() => setLoading(false));
    if (user.role === "CHARITY") apiService.charity.getIntegrityAlerts().then((r) => setAlerts(r.alerts)).catch(() => undefined);
    if (user.role === "ADMIN") apiService.admin.getIntegrityAlerts().then((r) => setAlerts(r.alerts)).catch(() => undefined);
  }, [user]);

  const verify = useCallback(async (id: string) => {
    if (activeId || !user) return;
    setActiveId(id); setVerifyError((current) => ({ ...current, [id]: "" }));
    try { const result = user.role === "DONOR" ? await apiService.donations.getAnchors(id) : user.role === "CHARITY" ? await apiService.charity.getDonationVerification(id) : await apiService.admin.getDonationVerification(id); setEvidence((current) => ({ ...current, [id]: result })); if (user.role === "ADMIN") void apiService.admin.getIntegrityAlerts().then((response) => setAlerts(response.alerts)).catch(() => undefined); }
    catch { setVerifyError((current) => ({ ...current, [id]: "We couldn't complete the check right now. This does not mean a problem was found with your donation." })); }
    finally { setActiveId(null); }
  }, [activeId, user]);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("donationId");
    if (user?.role !== "ADMIN" || !target || autoOpened.current || !donations.some((donation) => donation.id === target)) return;
    autoOpened.current = true;
    void verify(target);
  }, [user, donations, verify]);

  if (!user) return <div className="mx-auto max-w-xl py-20 text-center"><h1 className="text-2xl font-semibold">Sign in to verify your donations</h1><Button className="mt-5" onClick={() => navigate("/login")}>Sign in</Button></div>;
  if (user.role && !["DONOR", "CHARITY", "ADMIN"].includes(user.role)) return <Navigate to="/" replace />;

  return <div className="mx-auto max-w-4xl space-y-8 pb-16">
    <header className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">{userRole === "DONOR" ? "Verify Your Donations" : "Donation Verification"}</h1><p className="max-w-3xl text-muted-foreground">{userRole === "DONOR" ? "Your contribution matters. Here, you can check how each donation has been recorded, track its current status, and verify the records that help protect its integrity." : "Run an on-demand integrity check for donations you are authorized to review. Failures are recorded as alerts for follow-up."}</p></header>
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />How does verification work?</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">
        {["Your donation is recorded: the platform saves the payment and its details.", "A verification fingerprint is created: it can help reveal changes to the saved record.", "Records are linked together: changing an earlier record would disrupt those links.", "Blockchain adds a public reference: selected fingerprints are recorded on Solana for an additional integrity check."].map((item, i) => <li key={item} className="flex gap-3 text-sm text-muted-foreground"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{i + 1}</span>{item}</li>)}
      </ol><p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">These checks help confirm the integrity of information recorded by Trace-It. They do not prove a bank transfer independently or show how an NGO spends funds.</p>
      <p className="mt-4 text-center text-xs font-medium text-muted-foreground">Donation → Platform record → Verification fingerprint → Blockchain reference</p>
    </section>
    {userRole === "ADMIN" && <section className="space-y-3"><h2 className="text-xl font-semibold">Integrity alerts</h2>{alerts.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No unresolved integrity alerts. A complete successful on-demand check clears alerts for that donation.</p> : alerts.map((alert) => <article key={alert.id} className={`rounded-lg border p-4 ${alert.severity === "CRITICAL" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{alert.severity === "CRITICAL" ? "Critical" : alert.severity === "OPERATIONAL" ? "Operational" : "Warning"} · {alert.failureType.replaceAll("_", " ")} · Unresolved</p><p className="mt-1 text-sm text-muted-foreground">Donation {alert.donationId} · Event {alert.eventId ?? "not individually attributed"} · Batch {alert.batchId ?? "unknown"}</p><p className="mt-1 text-xs text-muted-foreground">First detected {new Date(alert.detectedAt).toLocaleString()} · {alert.source === "ON_DEMAND" ? "On-demand verification" : "Recorded source: " + alert.source}</p></div><Button variant="outline" size="sm" onClick={() => void verify(alert.donationId)}>Recheck and inspect</Button></div></article>)}</section>}
    {userRole === "CHARITY" && <section className="space-y-3"><h2 className="text-xl font-semibold">Integrity alerts</h2>{alerts.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No recorded integrity failures.</p> : alerts.map((alert) => <article key={alert.id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"><p className="font-medium text-destructive">{alert.failureType.replaceAll("_", " ")} · {alert.resolvedAt ? "Investigated" : "Unresolved"}</p><p className="mt-1 text-sm text-muted-foreground">Donation {alert.donationId} · Event {alert.eventId ?? "unknown"} · Batch {alert.batchId ?? "unknown"}</p><p className="mt-1 text-xs text-muted-foreground">Detected {new Date(alert.detectedAt).toLocaleString()} · {alert.source === "ON_DEMAND" ? "Detected during an on-demand check" : "Background check"}</p></article>)}</section>}
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">{userRole === "ADMIN" ? "Donation records" : "Your donations"}</h2><p className="mt-1 text-sm text-muted-foreground">{userRole === "ADMIN" ? "Run an on-demand forensic verification for a donation." : "Each status describes a separate part of your donation."}</p></div>
      {loading ? <div role="status" className="rounded-xl border p-8 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading your donations…</div>
        : error ? <div role="alert" className="rounded-xl border border-destructive/30 p-6 text-sm">We couldn’t load your donations. Please refresh the page and try again.</div>
          : donations.length === 0 ? <div className="rounded-xl border p-8 text-center text-muted-foreground">No donations found for your account yet.</div>
            : donations.map((donation) => <article key={donation.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="space-y-1"><p className="text-xl font-semibold">{donation.currencyCode ?? "INR"} {Number(donation.amount).toLocaleString()}</p><p className="text-sm text-muted-foreground">{donation.campaignTitle || "General NGO donation"}{donation.ngoName ? ` · ${donation.ngoName}` : ""}</p><p className="text-sm text-muted-foreground">{new Date(donation.createdAt).toLocaleDateString()} · Reference {donation.publicId ?? donation.id}</p><p className="text-sm">{labelStatus(String(donation.status))}</p>{String(donation.status) === "REFUND_RECONCILIATION_REQUIRED" && <p className="text-sm text-destructive">This refund needs attention from our support team.</p>}</div>
                <Button onClick={() => void verify(donation.id)} disabled={activeId !== null}>{activeId === donation.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{activeId === donation.id ? "Checking…" : evidence[donation.id] ? "Check again" : "Verify"}</Button></div>
              {verifyError[donation.id] && <p role="alert" className="mt-4 text-sm text-destructive">{verifyError[donation.id]}</p>}
              {evidence[donation.id] && (userRole === "ADMIN" && "generatedAt" in evidence[donation.id]
                ? <AdminEvidence evidence={evidence[donation.id] as Extract<VerifyData, { generatedAt: string }>} />
                : <Evidence evidence={evidence[donation.id] as { anchors: DonationAnchorStatus[] }} userRole={userRole} />)}
            </article>)}
    </section>
  </div>;
}
