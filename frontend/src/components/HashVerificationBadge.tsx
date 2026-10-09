import { cn } from "@/lib/utils";

interface HashVerificationBadgeProps {
  hashStatus: "pending" | "verified" | "failed" | "loading";
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

export default function HashVerificationBadge({
  hashStatus,
  onClick,
}: HashVerificationBadgeProps) {
  const getIconAndColor = () => {
    switch (hashStatus) {
      case "pending":
        return { dot: "bg-primary", text: "Hash Verification Pending" };
      case "verified":
        return { dot: "bg-trust-green", text: "Hash Verified" };
      case "failed":
        return { dot: "bg-destructive", text: "Hash Verification Failed" };
      case "loading":
        return { dot: "bg-muted-foreground", text: "Verifying Hash..." };
    }
  };

  const { dot, text } = getIconAndColor();
  const content = (
    <>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dot)} />
      <span>{text}</span>
    </>
  );
  const className = cn(
    "inline-flex items-center gap-2 text-sm font-medium",
    onClick && "cursor-pointer hover:underline",
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title={text}
    >
      {content}
    </button>
  ) : (
    <span className={className} title={text}>
      {content}
    </span>
  );
}
