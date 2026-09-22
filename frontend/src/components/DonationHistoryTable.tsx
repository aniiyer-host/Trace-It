import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Donation, Attestation } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

interface DonationHistoryTableProps {
  donations: Donation[];
  loading: boolean;
  onRefresh: () => void;
  onViewAttestation: (data: {
    donationId: string;
    attestationStatus: "pending" | "receipt_confirmed" | "delivery_confirmed";
    amount?: number;
    campaignTitle?: string;
    confirmedAt?: string;
    donationDate?: string;
  }) => void;
  onVerifyIntegrity: (donationId: string) => void;
}

export default function DonationHistoryTable({
  donations,
  loading,
  onViewAttestation,
}: DonationHistoryTableProps) {
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-xl h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  if (donations.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <DollarSign className="h-8 w-8 text-primary mx-auto mb-4" />
        <h3 className="font-semibold mb-3">No Donations Yet</h3>
        <p className="text-muted-foreground">
          Start your giving journey by donating to one of our active campaigns.
        </p>
        <button
          onClick={() => {
            // In a real app, we'd use navigate('/')
            alert("Please go to the Home page to see active campaigns");
          }}
          className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded"
        >
          Browse Campaigns
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 overflow-x-auto">
        <table className="w-full">
          <caption className="text-left text-sm font-medium text-muted-foreground mb-2">
            Showing {donations.length} donation
            {donations.length === 1 ? "" : "s"}
          </caption>
          <thead>
            <tr>
              <th className="text-left">Campaign</th>
              <th className="text-center">Amount</th>
              <th className="text-center">Status</th>
              <th className="text-center">Attestation</th>
              <th className="text-center">Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => {
              const hasReceiptConfirmed =
                donation.attestations && Array.isArray(donation.attestations)
                  ? donation.attestations.some(
                      (a: Attestation) =>
                        a.type === "RECEIPT" && a.status === "APPROVED",
                    )
                  : false;

              const hasDeliveryConfirmed =
                donation.attestations && Array.isArray(donation.attestations)
                  ? donation.attestations.some(
                      (a: Attestation) =>
                        a.type === "DELIVERY" && a.status === "APPROVED",
                    )
                  : false;

              const attestationStatus = hasDeliveryConfirmed
                ? "delivery_confirmed"
                : hasReceiptConfirmed
                  ? "receipt_confirmed"
                  : "pending";
              const confirmedAtt = donation.attestations?.find(
                (a: Attestation) =>
                  a.type === (hasDeliveryConfirmed ? "DELIVERY" : "RECEIPT") &&
                  a.status === "APPROVED",
              );

              const attestationData = {
                donationId: donation.id,
                attestationStatus: attestationStatus as
                  | "pending"
                  | "receipt_confirmed"
                  | "delivery_confirmed",
                amount: Number(donation.amount),
                campaignTitle:
                  donation.campaignTitle ||
                  `Campaign ${donation.campaignId?.substring(0, 8)}`,
                confirmedAt: confirmedAtt
                  ? new Date(confirmedAtt.createdAt).toISOString()
                  : undefined,
                donationDate: donation.createdAt,
              };

              return (
                <tr key={donation.id} className="border-t">
                  <td className="font-medium text-left max-w-xs truncate py-4">
                    {donation.campaignTitle ||
                      `Campaign ${donation.campaignId?.substring(0, 8)}`}
                  </td>
                  <td className="text-center font-medium py-4">
                    ₹{Number(donation.amount).toLocaleString()}
                  </td>
                  <td className="text-center py-4">
                    <StatusBadge status={donation.status} size="sm" />
                  </td>
                  <td className="text-center py-4">
                    <button
                      onClick={() => onViewAttestation(attestationData)}
                      className="flex items-center justify-center gap-2 text-xs font-medium w-full hover:opacity-80"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full inline-block",
                          hasDeliveryConfirmed
                            ? "bg-green-500"
                            : hasReceiptConfirmed
                              ? "bg-blue-500"
                              : "bg-yellow-500",
                        )}
                      />
                      {hasDeliveryConfirmed
                        ? "Delivery Confirmed"
                        : hasReceiptConfirmed
                          ? "Receipt Confirmed"
                          : "Pending NGO Confirmation"}
                    </button>
                  </td>
                  <td className="text-center text-xs py-4">
                    {new Date(donation.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-center py-4">
                    <div className="flex items-center gap-3 justify-center">
                      <button
                        onClick={() => onViewAttestation(attestationData)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors bg-transparent border-none p-0 cursor-pointer"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => {
                          toast({
                            title:
                              "Blockchain verification will be available once on-chain recording is active.",
                          });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors bg-transparent border-none p-0 cursor-pointer"
                      >
                        Verify Integrity
                      </button>
                      {donation.explorerUrl && (
                        <a
                          href={donation.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
                        >
                          View on Explorer
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
