import { useState } from "react";
import {
  Loader2,
  Plus,
  Target,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import type { Campaign } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (campaign: Campaign) => void;
}

const CATEGORIES = [
  { id: "education", label: "Education" },
  { id: "health", label: "Health" },
  { id: "disaster", label: "Disaster Relief" },
  { id: "environment", label: "Environment" },
];

export function CreateCampaignDialog({ open, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [category, setCategory] = useState("education");
  const [loading, setLoading] = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryDescription, setBeneficiaryDescription] = useState("");
  const [beneficiaryPan, setBeneficiaryPan] = useState("");
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Campaign title is required", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    if (!beneficiaryName.trim() || !beneficiaryDescription.trim() || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(beneficiaryPan.trim().toUpperCase())) {
      toast({ title: "Enter the beneficiary's name, reason for assistance, and a valid PAN", variant: "destructive" });
      return;
    }
    const amountNum = parseFloat(targetAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Enter a valid target amount (INR)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create campaign in DRAFT status
      const draftPayload = {
        title: title.trim(),
        description: description.trim(),
        targetAmount: amountNum,
        category,
        currencyCode: "INR",
        beneficiaryName: beneficiaryName.trim(),
        beneficiaryDescription: beneficiaryDescription.trim(),
        beneficiaryPan: beneficiaryPan.trim().toUpperCase(),
      };
      const draftCampaign = await apiService.campaigns.create(draftPayload);

      // Step 2: Submit campaign for admin approval (transitions DRAFT -> PENDING_APPROVAL)
      let submittedCampaign = draftCampaign;
      if (draftCampaign?.id) {
        try {
          submittedCampaign = await apiService.campaigns.submit(
            draftCampaign.id,
          );
        } catch (submitErr: unknown) {
          console.warn(
            "Auto-submit after draft failed; remaining in draft:",
            submitErr,
          );
          throw submitErr;
        }
      }

      toast({
        title: "Campaign created and submitted!",
        description:
          "Your campaign has been sent to the Admin queue for verification & approval.",
      });

      onSuccess(submittedCampaign || draftCampaign);
      handleClose();
    } catch (err: unknown) {
      // console.error('Create campaign error:', err)
      // toast({
      //   title: 'Failed to create campaign',
      //   description: (err as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error || (err as { message?: string }).message,
      //   variant: 'destructive',
      // })
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";

      toast({
        title: "Failed to create campaign",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setTargetAmount("");
    setCategory("education");
    setBeneficiaryName("");
    setBeneficiaryDescription("");
    setBeneficiaryPan("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border border-border/20 max-w-lg bg-background max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2 font-semibold text-foreground">
                <Plus className="h-5 w-5 text-primary" /> Create New Campaign
              </DialogTitle>
              <DialogDescription>
                Draft your campaign and submit it for admin verification.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Campaign Title
                </label>
                <Input
                  placeholder="e.g., Clean Drinking Water Project - Phase 1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" /> Target Amount (INR ₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g., 500000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  disabled={loading}
                  min="1"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat.id}
                      type="button"
                      size="sm"
                      variant={category === cat.id ? "primary" : "outline"}
                      onClick={() => setCategory(cat.id)}
                      className="text-xs justify-start"
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description & Objectives
                </label>
                <Textarea
                  placeholder="Detail the beneficiaries, scope of work, and expected impact metrics..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5 rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Beneficiary information is restricted to the NGO workflow and is not shown on public campaign pages.</p>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary name</label>
                <Input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} disabled={loading} required maxLength={160} />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason for needing assistance</label>
                <Textarea value={beneficiaryDescription} onChange={(e) => setBeneficiaryDescription(e.target.value)} disabled={loading} required maxLength={2000} rows={3} />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PAN</label>
                <Input value={beneficiaryPan} onChange={(e) => setBeneficiaryPan(e.target.value.toUpperCase())} disabled={loading} required maxLength={10} autoComplete="off" />
                <p className="text-xs text-muted-foreground">PAN is used to generate a stable private beneficiary ID and is not stored.</p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  variant="primary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating
                      & Submitting…
                    </>
                  ) : (
                    "Create & Submit Campaign"
                  )}
                </Button>
              </div>
            </form>
      </DialogContent>
    </Dialog>
  );
}
