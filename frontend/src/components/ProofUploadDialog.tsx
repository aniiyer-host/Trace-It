import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import { formatUSD } from "@/lib/utils";
import type { Milestone, Campaign } from "@/types";

interface ProofUploadData {
  milestone: Milestone;
  campaign: Campaign | null;
}

interface Props {
  data: ProofUploadData | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (ms: Milestone) => void;
}

export function ProofUploadDialog({ data, open, onClose, onSuccess }: Props) {
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [geotagFile, setGeotagFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  if (!data) return null;

  const milestone = data.milestone;
  const campaign = data.campaign;

  const handleUpload = async () => {
    if (!milestone) return;
    if (!description.trim()) {
      toast({ title: "Add a proof description", variant: "destructive" });
      return;
    }
    if (selectedFiles.length === 0) {
      toast({
        title: "Select proof files",
        description: "Upload one or more PDF, PNG, or JPEG field reports.",
        variant: "destructive",
      });
      return;
    }

    // Strict combined size validation
    const mainFilesSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    const geotagSize = geotagFile ? geotagFile.size : 0;
    if (mainFilesSize + geotagSize > 10 * 1024 * 1024) {
      toast({ 
        title: "Size limit exceeded", 
        description: "The combined size of all files (including geotag) must be under 10 MB.", 
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      // Complete progress
      setUploadProgress(100);
      setTimeout(() => {
        clearInterval(progressInterval);
      }, 500);

      await apiService.milestones.uploadProof(milestone.id, selectedFiles, geotagFile || undefined);

      // Proof submission does not mean the disbursement was approved or
      // the beneficiary received the funds. Keep it actionable until Admin review.
      const updatedMilestone: Milestone = {
        ...milestone,
        status: "allocated",
        proofSubmittedAt: new Date().toISOString(),
      };

      onSuccess(updatedMilestone);
      toast({
        title: "Proof uploaded successfully!",
        description: "The disbursement is now awaiting admin review.",
      });
      setDescription("");
      setSelectedFiles([]);
      onClose();
    } catch (error) {
      console.error(error);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass border-border/60 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="gradient-text text-xl">
            Upload Disbursement Proof
          </DialogTitle>
          <DialogDescription className="text-muted-foreground flex items-center gap-2">
            <span>{milestone?.title} • {campaign?.ngo || campaign?.ngoName}</span>
            <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-xs font-semibold">
              {milestone?.disbursementType === "PROOF_OF_WORK" ? "Proof of Work" : "Proof of Need"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Milestone Info Card */}
          <div className="glass rounded-lg p-5 border border-border/40">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{milestone?.title}</h3>
                <StatusBadge
                  status={milestone?.status ?? "pending"}
                  className="ml-auto"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {milestone?.description}
              </p>
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Target Amount:</span>
                  <span className="ml-2">
                    {formatUSD(milestone?.targetAmount ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Campaign:</span>
                  <span className="ml-2">{campaign?.title}</span>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <span className="ml-2 capitalize">{milestone?.status}</span>
                </div>
                <div>
                  <span className="font-medium">Type:</span>
                  <span className="ml-2 font-bold text-foreground">
                    {milestone?.disbursementType === "PROOF_OF_WORK" ? "Proof of Work" : "Proof of Need"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Section */}
          <div className="space-y-4">
            {/* File drop zone (enhanced visual) */}
            <div 
              className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground hover:border-primary/50 transition-colors relative overflow-hidden"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const filesArray = Array.from(e.dataTransfer.files);
                  if (filesArray.length > 10) {
                    toast({ title: "Limit exceeded", description: "Max 10 files allowed.", variant: "destructive" });
                    return;
                  }
                  
                  const currentGeotagSize = geotagFile ? geotagFile.size : 0;
                  const newMainFilesSize = filesArray.reduce((sum, f) => sum + f.size, 0);
                  if (newMainFilesSize + currentGeotagSize > 10 * 1024 * 1024) {
                    toast({ title: "Size limit exceeded", description: "Combined size of all files must be under 10 MB.", variant: "destructive" });
                    return;
                  }

                  setSelectedFiles(filesArray);
                  toast({
                    title: `${filesArray.length} file${filesArray.length === 1 ? '' : 's'} selected`,
                  });
                }
              }}
            >
              <div className="absolute inset-0 -z-10">
                <div className="w-full h-full bg-gradient-to-r from-primary/5 to-teal/5" />
              </div>
              <Upload className="h-10 w-10 mx-auto mb-4 opacity-60" />
              <div className="text-sm font-medium mb-2">
                {selectedFiles.length > 0 ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-primary font-semibold">Selected {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}:</span>
                    <ul className="text-xs text-muted-foreground max-h-24 overflow-y-auto space-y-1">
                      {selectedFiles.map((f, i) => (
                        <li key={i} className="truncate max-w-[300px] bg-foreground/5 px-2 py-1 rounded">{f.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  "Drag & drop files here or click to browse"
                )}
              </div>
              <p className="text-xs mt-1 opacity-70">
                PDF, PNG, JPEG supported • Max 10 files (up to 10MB combined)
              </p>
              {/* Optional file input */}
              <label className="mt-4 flex items-center justify-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer max-w-xs mx-auto">
                {selectedFiles.length > 0 ? "Add/Change Files" : "Browse Files"}
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const filesArray = Array.from(e.target.files);
                      if (filesArray.length > 10) {
                        toast({ title: "Limit exceeded", description: "Max 10 files allowed.", variant: "destructive" });
                        return;
                      }

                      const currentGeotagSize = geotagFile ? geotagFile.size : 0;
                      const newMainFilesSize = filesArray.reduce((sum, f) => sum + f.size, 0);
                      if (newMainFilesSize + currentGeotagSize > 10 * 1024 * 1024) {
                        toast({ title: "Size limit exceeded", description: "Combined size of all files must be under 10 MB.", variant: "destructive" });
                        return;
                      }

                      setSelectedFiles(filesArray);
                      toast({
                        title: `${filesArray.length} file${filesArray.length === 1 ? '' : 's'} selected`,
                      });
                    }
                  }}
                />
              </label>
            </div>
            {milestone.disbursementType === "PROOF_OF_WORK" && (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground hover:border-primary/50 transition-colors relative overflow-hidden mt-4">
                <p className="text-sm font-medium">
                  {geotagFile
                    ? `Geotag Selected: ${geotagFile.name}`
                    : "Secondary Proof: Geotagged Image (Optional)"}
                </p>
                <label className="mt-3 flex items-center justify-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer">
                  {geotagFile ? "Change Image" : "Browse Images"}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const file = e.target.files[0];
                        
                        const mainFilesSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                        if (mainFilesSize + file.size > 10 * 1024 * 1024) {
                          toast({ title: "Size limit exceeded", description: "Combined size of all files must be under 10 MB.", variant: "destructive" });
                          return;
                        }

                        setGeotagFile(file);
                        toast({ title: `Geotag selected: ${file.name}` });
                      }
                    }}
                  />
                </label>
              </div>
            )}

            {/* Upload Progress */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="space-y-2">
                <div className="w-full bg-muted/5 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-full transition_all duration-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right mt-1">
                  {`${uploadProgress}%`}
                </p>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium block">
                Proof Description
              </label>
              <textarea
                rows={4}
                placeholder="Describe what was achieved, how funds were used, and any relevant details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {description.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {description.length}/500 characters
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={loading || !description.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Uploading...
                </>
              ) : (
                "Submit Proof to Blockchain"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
