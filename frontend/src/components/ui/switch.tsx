import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Check } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const switchVariants = cva(
  "inline-flex h-6 w-11 items-center shrink-0 cursor-pointer select-none rounded-full border-2 border-transparent bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "data-[state=checked]:bg-destructive data-[state=unchecked]:border-destructive/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface SwitchProps
  extends React.ComponentPropsWithoutRef<"input">,
    VariantProps<typeof switchVariants> {
  /**
   * Used with asChild to switch between different radial slots
   * @defaultValue "thumb"
   */
  childSlot?: "thumb" | "unchecked" | "checked"
  asChild?: boolean
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, variant, childSlot, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "input"
    return (
      <Comp
        type="checkbox"
        role="switch"
        aria-checked={props.checked}
        className={cn(switchVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Switch.displayName = "Switch"

const SwitchThumb = React.forwardRef(
  ({ className, ...props }: React.PropsWithRef<typeof Check> & { className?: string }) => (
    <Check
      className={cn(
        "h-4 w-4 shrink-0 stroke-current transition-transform",
        "data-[state=checked]:translate-x-4",
        className
      )}
      {...props}
    />
  )
)
SwitchThumb.displayName = "Switch.Thumb"

export { Switch, SwitchThumb }