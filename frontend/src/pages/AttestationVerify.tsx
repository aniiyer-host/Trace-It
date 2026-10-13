
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AttestationVerify() {
  const { attestationId } = useParams<{ attestationId: string }>();

  return (
    <div className="min-h-screen bg-background">
      {/* Header — preserve the existing Trace-It visual style */}
      <header className="bg-primary/5 text-primary/50 border-b border-border/20">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">
              Attestation Verification
            </h1>
            <div className="text-sm text-muted-foreground">
              Public Verification • {new Date().getFullYear()}
            </div>
          </div>
        </div>
      </header>

      {/* Main content — retain your card-based styling */}
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-8">
          <div className="space-y-4 text-center">
            <h2 className="flex items-center justify-center gap-3 text-3xl font-bold">
              <AlertTriangle
                aria-hidden="true"
                className="h-8 w-8 text-yellow-500"
              />
              Verification Unavailable
            </h2>
            <p className="lg:text-xl text-muted-foreground max-w-2xl mx-auto">
              Trace-It cannot currently verify this attestation through a
              public server-backed verification endpoint.
            </p>
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="flex flex-col space-y-2">
              <CardTitle className="text-xl font-semibold">
                Attestation Details
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Verification status for the requested attestation
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-3 text-sm">
                <p className="font-medium">Attestation Information</p>
                <p className="break-all">
                  <strong>Attestation ID:</strong>{" "}
                  {attestationId || "No attestation ID provided"}
                </p>
              </div>

              <div className="space-y-3">
                <p className="font-medium">Verification Status</p>
                <div className="rounded border border-border bg-muted/50 p-4 space-y-2 text-sm">
                  <p>
                    <strong>Public verification:</strong> Unavailable
                  </p>
                  <p>
                    <strong>Database record:</strong> Not checked
                  </p>
                  <p>
                    <strong>Cryptographic signature:</strong> Not checked
                  </p>
                  <p>
                    <strong>Blockchain anchor:</strong> Not checked
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                No database record, provenance integrity, cryptographic
                signature, or blockchain anchor has been verified for this ID.
                This status does not establish whether the attestation exists
                or does not exist.
              </p>

              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => window.history.back()}
                  variant="outline"
                  className="w-full md:w-auto"
                >
                  Go Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer — preserve your original styling */}
      <footer className="bg-muted/5 text-center text-xs text-muted-foreground py-6 border-t border-border/20">
        <div className="container max-w-4xl mx-auto px-4">
          <p>
            TraceIt © {new Date().getFullYear()} — Built for transparent
            charitable giving
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
            <a href="#" className="hover:text-primary transition-colors">
              About
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              How It Works
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Blog
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
