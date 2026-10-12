import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        default: "border-transparent bg-primary text-primary-foreground",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-200",
        danger: "border-red-500/30 bg-red-500/15 text-red-300",
        info: "border-sky-500/30 bg-sky-500/15 text-sky-200",
        muted: "border-border bg-muted text-muted-foreground",
        gold: "border-[#d4af37]/40 bg-[#d4af37]/15 text-[#e8c98e]",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { tone: "default" },
  },
)

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge, badgeVariants }
