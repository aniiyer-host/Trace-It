// Footer.tsx – Professional footer with links and info
import { GitBranch } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-border/30 py-4 text-center text-xs text-muted-foreground">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex flex-col items-center md:flex-row">
            <GitBranch className="h-4 w-4 text-primary mr-2" />
            <span className="font-medium text-primary">TraceIt</span>
          </div>
          <div className="flex flex-col items-center md:flex-row gap-2 md:gap-4">
            <a
              href="https://explorer.solana.com/?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Solana Devnet
            </a>
            <span className="text-muted-foreground mx-2">•</span>
            <a href="#" className="hover:text-primary transition-colors">
              Terms of Service
            </a>
            <span className="text-muted-foreground mx-2">•</span>
            <a href="#" className="hover:text-primary transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          TraceIt © {new Date().getFullYear()} — All data is simulated for demo purposes
        </div>
      </div>
    </footer>
  )
}