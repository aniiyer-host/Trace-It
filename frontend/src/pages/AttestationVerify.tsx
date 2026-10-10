// AttestationVerify – Public attestation verification page
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AttestationVerify() {
  const { attestationId } = useParams<{ attestationId: string }>();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary/5 text-primary/50 border-b border-border/20">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold gradient-text">
              Attestation Verification
            </h1>
            <div className="text-sm text-muted-foreground">
              Public Verification • {new Date().getFullYear()}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
        <div className="flex justify-center">
          <Card className="glass max-w-2xl w-full">
            <CardContent className="space-y-6 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Verification unavailable</h2>
                <p className="text-muted-foreground">
                  Trace-It does not currently provide a public server-backed
                  attestation verification endpoint.
                </p>
                {attestationId && (
                  <p className="text-sm text-muted-foreground break-all">
                    Requested attestation ID: {attestationId}
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                No database record, provenance integrity, cryptographic
                signature, or blockchain anchor was verified for this ID.
              </p>
              <Button onClick={() => window.history.back()} variant="outline">
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

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
