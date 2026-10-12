import { AlertTriangle, CheckCircle2, CircleHelp, CircleSlash, XCircle } from "lucide-react"
import type { ComparisonRow, ComparisonStatus } from "@/lib/ocr/types"
import { cn } from "@/lib/utils"

const STATUS: Record<ComparisonStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  match: { label: "Corresponde", className: "text-emerald-300", icon: CheckCircle2 },
  divergent: { label: "Divergente", className: "text-red-300", icon: XCircle },
  missing_registered: { label: "Ausente no cadastro", className: "text-amber-200", icon: CircleHelp },
  not_recognized: { label: "Não reconhecido", className: "text-muted-foreground", icon: CircleSlash },
  low_confidence: { label: "Baixa confiança", className: "text-amber-200", icon: AlertTriangle },
}

/** Comparação DADOS CADASTRADOS | DADOS IDENTIFICADOS. */
export function ComparisonTable({
  rows,
  editable,
  values,
  onChange,
}: {
  rows: ComparisonRow[]
  editable?: boolean
  values?: Record<string, string>
  onChange?: (field: string, value: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-[#e8c98e] uppercase">
            <th className="p-2">Campo</th>
            <th className="p-2">Dados cadastrados</th>
            <th className="p-2">Dados identificados</th>
            <th className="p-2">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS[r.status]
            return (
              <tr
                key={r.field}
                className={cn(
                  "border-b border-border last:border-0",
                  r.status === "divergent" && "bg-red-500/10",
                  r.status === "low_confidence" && "bg-amber-500/10",
                )}
              >
                <td className="p-2 text-xs text-muted-foreground">{r.label}</td>
                <td className="p-2">{r.registered ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2">
                  {editable ? (
                    <input
                      className="w-full rounded border border-input bg-input/20 px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      value={values?.[r.field] ?? r.identified ?? ""}
                      onChange={(e) => onChange?.(r.field, e.target.value)}
                      aria-label={`${r.label} identificado`}
                    />
                  ) : (
                    (r.identified ?? <span className="text-muted-foreground">não reconhecido</span>)
                  )}
                  {r.confidence !== null && r.identified && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      confiança {Math.round(r.confidence * 100)}%
                    </span>
                  )}
                </td>
                <td className={cn("p-2 text-xs whitespace-nowrap", s.className)}>
                  <span className="flex items-center gap-1">
                    <s.icon className="size-3.5" /> {s.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
