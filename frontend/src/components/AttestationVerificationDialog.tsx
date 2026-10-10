import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import type { Donation, Attestation } from "@/types";

interface AttestationVerificationDialogProps {
  donation: Donation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AttestationVerificationDialog({
  donation,
  open,
  onOpenChange,
}: AttestationVerificationDialogProps) {
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [verifying, setVerifying] = useState(false);
  const { toast } = useToast();

  const verifyAttestation = async () => {
    setVerifying(true);
    try {
      // const result = await getAttestationByDonationId(donation.id, 'receipt')
      const result = await apiService.donations.getAttestation(donation.id);
      setAttestations(result);
      if (result.length === 0) {
        toast({
          title: "No attestation record found",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Attestation record found",
        description:
          "A matching attestation record was found in the Trace-It database. This does not verify a cryptographic signature or blockchain anchor.",
      });
    } catch (error) {
      console.error("Failed to verify attestation:", error);
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
      <DialogContent className="glass max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Verify Attestation</DialogTitle>
          <DialogDescription>
            Check whether an NGO attestation record exists for this donation.
          </DialogDescription>
        </DialogHeader>
        {attestations.length > 0 ? (
          <div className="space-y-6 p-6">
            {attestations.map((attestation) => (
            <div key={attestation.id} className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center bg-emerald-50 text-emerald-500 rounded-full">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Attestation record found</h3>
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
                      <span className="text-emerald-600">Record found</span>
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
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center bg-yellow-50 text-yellow-500 rounded-full">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Ready to Verify</h3>
                    <p className="text-muted-foreground">
                      Click verify to check whether an attestation record exists
                      in the Trace-It database.
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
                      Confirm the attestation matches the donation details.
                    </li>
                    <li>
                      No cryptographic or blockchain tamper check is performed.
                    </li>
                  </ol>
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
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
                      "Verify Attestation"
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
