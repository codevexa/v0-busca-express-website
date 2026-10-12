import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "default",
  loading,
}: {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  hint?: React.ReactNode
  href?: string
  tone?: "default" | "gold" | "danger" | "success" | "warning"
  loading?: boolean
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors",
        href && "hover:border-[#b48a4a]/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {Icon && <Icon className="size-4 text-[#800020]" />}
      </div>
      <span
        className={cn(
          "text-2xl font-bold tabular-nums",
          tone === "gold" && "text-[#d4af37]",
          tone === "danger" && "text-red-300",
          tone === "success" && "text-emerald-300",
          tone === "warning" && "text-amber-200",
          loading && "animate-pulse text-muted-foreground",
        )}
      >
        {loading ? "…" : value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}
