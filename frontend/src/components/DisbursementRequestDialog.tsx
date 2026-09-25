import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import type { Campaign } from "@/types";

interface DisbursementRequestDialogProps {
  campaign: Campaign;
  cohortId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisbursementRequested: () => void;
}

export default function DisbursementRequestDialog({
  campaign,
  cohortId,
  open,
  onOpenChange,
  onDisbursementRequested,
}: DisbursementRequestDialogProps) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("PROOF_OF_NEED");
  const [selectedCohort, setSelectedCohort] = useState(
    cohortId || (campaign as any).cohortId || (campaign as any).cohorts?.[0]?.id || ""
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const availableAmount = Math.max(
    0,
    Number(campaign.raisedAmount || 0) -
      (campaign.milestones || []).reduce(
        (sum, milestone) => sum + Number(milestone.targetAmount || 0),
        0,
      ),
  );

  const cohorts = (campaign as any).cohorts || [];

  const handleRequestDisbursement = async () => {
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Enter a valid amount",
        description: "The disbursement amount must be greater than ₹0.",
        variant: "destructive",
      });
      return;
    }

    if (parsedAmount > Number(campaign.raisedAmount || 0)) {
      toast({
        title: "Amount exceeds funds raised",
        description: `This campaign has raised ₹${Number(campaign.raisedAmount || 0).toLocaleString()}.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await apiService.charity.createDisbursement({
        campaignId: campaign.id,
        cohortId: selectedCohort || undefined,
        disbursementType: type,
        amountInr: parsedAmount,
      } as any);

      toast({
        title: "Disbursement requested",
        description: `₹${parsedAmount.toLocaleString()} is now awaiting proof submission.`,
      });
      setAmount("");
      onOpenChange(false);
      onDisbursementRequested();
    } catch (error) {
      console.error("Failed to request disbursement:", error);
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      toast({
        title: "Failed to request disbursement",
        description:
          err.response?.data?.error || err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Request Disbursement</DialogTitle>
          <DialogDescription>
            Create a disbursement request for this campaign. After the request
            is created, upload the supporting field proof so an admin can review
            it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <p className="font-semibold">{campaign.title}</p>
            <p className="text-sm text-muted-foreground">
              Raised: ₹{Number(campaign.raisedAmount || 0).toLocaleString()}
            </p>
            {availableAmount > 0 && (
              <p className="text-sm text-muted-foreground">
                Approx. unrequested funds: ₹{availableAmount.toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Disbursement Type</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={loading}
            >
              <option value="PROOF_OF_NEED">Proof of Need</option>
              <option value="PROOF_OF_WORK">Proof of Work</option>
            </select>
          </div>

          {cohorts.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Cohort</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value)}
                disabled={loading}
              >
                <option value="">None (General Campaign Funds)</option>
                {cohorts.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="disbursement-amount"
              className="text-sm font-medium"
            >
              Amount (INR)
            </label>
            <Input
              id="disbursement-amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Enter amount to request"
              disabled={loading}
            />
          </div>

          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Next steps</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Create the disbursement request.</li>
              <li>
                Upload the field report/proof from the campaign workspace.
              </li>
              <li>
                Admin reviews the proof and approves or rejects the request.
              </li>
            </ol>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRequestDisbursement()}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Banknote className="mr-2 h-4 w-4" />
                  Request Disbursement
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
