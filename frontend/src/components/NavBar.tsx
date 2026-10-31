// NavBar.tsx – Professional navigation header with attestation focus
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, Bell, CircleHelp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ModeToggle";
import { useAuthStore } from "@/store/authStore";
import { useNGOStore } from "@/store/ngoStore";
import { apiService } from "@/utils/apiClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GLOSSARY = [
  ["Beneficiary ID", "A campaign-scoped identifier derived from a beneficiary’s PAN with a server-side keyed hash. It is not the PAN itself."],
  ["Beneficiary Hash", "A separate keyed verifier stored internally to compare a submitted Beneficiary ID for its campaign. It is distinct from the ID shown to authorized users and is not returned in public responses."],
  ["Chain Hash", "A SHA-512 value calculated from an event payload hash and the preceding chain hash. It links Trace-It provenance events; a hash alone cannot prove a real-world event occurred."],
  ["Payload Hash", "A SHA-512 fingerprint of the canonical representation of a provenance event. It identifies that representation, not every private detail or the truth of the event."],
  ["Attestation", "A database record confirming an action or stage in the donation workflow. A record’s existence alone is not independent cryptographic or blockchain verification."],
  ["Blockchain Anchor", "A cryptographic value submitted to the configured blockchain. An anchor can show that value was recorded on-chain, but cannot by itself prove a donation, delivery, or beneficiary claim."],
  ["Transaction Signature", "The identifier used to locate a transaction in the relevant blockchain explorer. A successful transaction does not verify every linked application record or real-world claim."],
  ["Verification Status", "These are separate checks: a database record may be found; Trace-It may store an anchor status; a transaction may be confirmed on-chain; and application data may be independently checked. This interface reports stored records and statuses and does not itself recheck the chain."],
];

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/campaigns", label: "Explore", end: false },
  { to: "/donor", label: "Donor", end: false },
  { to: "/verify", label: "Verify", end: false },
  { to: "/ngo", label: "NGO", end: false },
  { to: "/admin", label: "Admin", end: false },
  { to: "/login", label: "Login", end: true },
  { to: "/profile", label: "Profile", end: false },
];

export function NavBar() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { pendingAttestations } = useNGOStore();
  const location = useLocation();
  const isNGOPage = location.pathname.startsWith("/ngo");
  const pendingCount = Object.keys(pendingAttestations).length;

  const handleLogout = async () => {
    try {
      await apiService.auth.logout();
    } catch {
      // Clear the local session even when server-side logout is unavailable.
    } finally {
      logout();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90">
        <div className="container max-w-6xl mx-auto flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <NavLink to="/" className="flex items-center">
            <img
              src="/TraceIt.jpeg"
              alt=""
              aria-hidden="true"
              className="h-9 w-9 rounded-md object-cover"
            />
            <span className="ml-2 text-lg font-semibold tracking-tight text-foreground">
              TraceIt
            </span>
          </NavLink>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.filter((link) => {
              if (link.to === "/login") return !user;
              if (link.to === "/admin") return user?.role === "ADMIN";
              if (link.to === "/donor")
                return !user || user.role === "DONOR" || !user.role;
              if (link.to === "/verify") return user?.role === "DONOR";
              if (link.to === "/ngo") return user?.role !== "ADMIN"; // Hides it for ADMIN. Non-charities will have it mapped to /ngos below.

              return true;
            }).map(({ to, label, end }) => {
              let finalTo = to;
              if (to === "/ngo") {
                const isCharityOrAdmin =
                  user && (user.role === "CHARITY" || user.role === "ADMIN");
                finalTo = isCharityOrAdmin ? "/ngo" : "/ngos";
              }
              return (
                <NavLink
                  key={finalTo}
                  to={finalTo}
                  end={end}
                  className={({ isActive }) =>
                    `border-b-2 px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "border-primary text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    }`
                  }
                >
                  {label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-2">
                  {user.email}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            )}
            {/* Attestation badge for NGO - shows pending count */}
            {isNGOPage && pendingCount > 0 && (
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                  {pendingCount}
                </span>
              </div>
            )}
            <ModeToggle />
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setHelpOpen(true)} aria-label="Blockchain terminology help">
              <CircleHelp className="h-4 w-4" /> <span className="hidden sm:inline">Help</span>
            </Button>
          </div>
        </div>
      </header>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-card p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Blockchain and verification terms</DialogTitle>
            <DialogDescription>Plain-language explanations of the terms used in Trace-It.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
            {GLOSSARY.map(([term, explanation]) => <section key={term}><h3 className="text-sm font-semibold">{term}</h3><p className="mt-1 text-sm text-muted-foreground">{explanation}</p></section>)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
