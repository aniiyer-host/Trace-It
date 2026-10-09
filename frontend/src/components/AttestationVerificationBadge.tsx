import { cn } from "@/lib/utils";

interface AttestationVerificationBadgeProps {
  attestationStatus:
    | "pending"
    | "receipt_confirmed"
    | "delivery_confirmed"
    | "loading";
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

export default function AttestationVerificationBadge({
  attestationStatus,
  onClick,
}: AttestationVerificationBadgeProps) {
  const getIconAndColor = () => {
    switch (attestationStatus) {
      case "pending":
        return { dot: "bg-primary", text: "Pending NGO Confirmation" };
      case "receipt_confirmed":
        return { dot: "bg-trust-green", text: "NGO Confirmed Receipt" };
      case "delivery_confirmed":
        return { dot: "bg-trust-green", text: "Delivery Confirmed" };
      case "loading":
        return { dot: "bg-muted-foreground", text: "Verifying..." };
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
