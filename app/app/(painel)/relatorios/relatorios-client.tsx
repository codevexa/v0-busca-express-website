"use client"

import { Download, Eye, FileBarChart2, Loader2, Printer } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/ossala/empty-state"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { useCatalog } from "@/hooks/use-catalog"
import { formatDateBR, todayISO } from "@/lib/dates"
import { DELIVERY_STATUS, PAYMENT_STATUS } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { P } from "@/lib/permissions"
import type { DeliveryFilters } from "@/lib/queries/deliveries"
import { buildReportContent, REPORT_TYPES, type ReportContent, type ReportType } from "@/lib/reports/definitions"
import { buildReportPdf, loadImageAsDataUrl, reportFileName } from "@/lib/reports/pdf"
import { getBrowserSupabase } from "@/lib/supabase/client"

export function RelatoriosClient() {
  const can = useCan()
  const { session, settings, logoUrl } = useSession()
  const { motoboys, areas } = useCatalog()
  const today = todayISO()
  const [type, setType] = useState<ReportType>("geral")
  const [filters, setFilters] = useState<DeliveryFilters>({ from: today, to: today })
  const [closingId, setClosingId] = useState("")
  const [closings, setClosings] = useState<Array<{ id: string; label: string; status: string }>>([])
  const [content, setContent] = useState<ReportContent | null>(null)
  const [appliedFilters, setAppliedFilters] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const showMoney = can(P.financeiroVer)
  const canExport = can(P.relatoriosExportar)

  useEffect(() => {
    if (type !== "fechamento" || !can(P.fechamentosVer)) return
    getBrowserSupabase()
      .from("closing_periods")
      .select("id, label, status")
      .order("start_date", { ascending: false })
      .limit(48)
      .then(({ data }) => setClosings(data ?? []))
  }, [type, can])

  useEffect(() => setContent(null), [type, filters, closingId])

  function describeFilters(): string[] {
    if (type === "fechamento") return [`Fechamento: ${closings.find((c) => c.id === closingId)?.label ?? "—"}`]
    const out: string[] = []
    if (filters.from || filters.to) out.push(`Período: ${formatDateBR(filters.from ?? "")} a ${formatDateBR(filters.to ?? "")}`)
    if (filters.motoboy) out.push(`Motoboy: ${motoboys.find((m) => m.id === filters.motoboy)?.name ?? "?"}`)
    if (filters.area) out.push(`Área: ${areas.find((a) => a.id === filters.area)?.name ?? "?"}`)
    if (filters.status) out.push(`Status: ${DELIVERY_STATUS[filters.status].label}`)
    if (filters.payment) out.push(`Pagamento: ${PAYMENT_STATUS[filters.payment].label}`)
    if (filters.search) out.push(`Pesquisa: "${filters.search}"`)
    return out
  }

  async function generate(): Promise<ReportContent | null> {
    if (pending) return null
    if (type === "fechamento" && !closingId) {
      toast.error("Selecione o fechamento.")
      return null
    }
    if (type !== "fechamento" && (!filters.from || !filters.to)) {
      toast.error("Informe a data inicial e a data final.")
      return null
    }
    setPending(true)
    try {
      const periodLabel = `${formatDateBR(filters.from ?? "")} a ${formatDateBR(filters.to ?? "")}`
      const c = await buildReportContent(getBrowserSupabase(), { ...filters, type, closingId }, { showMoney, periodLabel })
      setContent(c)
      setAppliedFilters(describeFilters())
      if (c.truncated) toast.warning("O relatório atingiu o limite de registros. Reduza o período para ver todos os dados.")
      return c
    } catch (e) {
      toast.error(friendlyError(e))
      return null
    } finally {
      setPending(false)
    }
  }

  async function exportPdf(mode: "download" | "print") {
    const c = content ?? (await generate())
    if (!c) return
    const logo = logoUrl ? await loadImageAsDataUrl(logoUrl) : null
    const doc = buildReportPdf({
      companyName: session.company.name,
      reportTitle: settings?.report_title ?? "OSSALA - BUSCAR EXPRESS",
      title: c.title,
      period: c.period,
      filters: appliedFilters.length ? appliedFilters : describeFilters(),
      generatedBy: `${session.nome} (matrícula ${session.matricula})`,
      generatedAt: new Date(),
      logoDataUrl: logo,
      orientation: c.orientation,
      summary: c.summary,
      sections: c.sections,
    })
    if (mode === "download") {
      doc.save(reportFileName(c.title, c.period))
    } else {
      doc.autoPrint()
      const url = doc.output("bloburl")
      const win = window.open(url, "_blank")
      if (!win) toast.error("Permita pop-ups para imprimir ou use Baixar PDF.")
    }
  }

  return (
    <>
      <PageHeader title="Relatórios" description="Visualize, imprima ou salve em PDF. Os totais são calculados a partir dos registros filtrados." />

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="rep-type">Relatório</Label>
          <NativeSelect id="rep-type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {REPORT_TYPES.filter((r) => (r.key === "pagamentos" ? can(P.pagamentosVer) : r.key === "fechamento" ? can(P.fechamentosVer) : true)).map(
              (r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ),
            )}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Eye />} Visualizar
          </Button>
          {canExport && (
            <>
              <Button onClick={() => exportPdf("download")} disabled={pending}>
                <Download /> Baixar PDF
              </Button>
              <Button variant="secondary" onClick={() => exportPdf("print")} disabled={pending}>
                <Printer /> Imprimir
              </Button>
            </>
          )}
        </div>
      </div>

      {type === "fechamento" ? (
        <div className="mb-4 rounded-xl border border-border bg-card p-3">
          <Label htmlFor="rep-closing">Fechamento</Label>
          <NativeSelect id="rep-closing" value={closingId} onChange={(e) => setClosingId(e.target.value)} className="mt-1.5">
            <option value="">Selecione</option>
            {closings.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.status})
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <FiltersBar
          value={filters}
          onChange={setFilters}
          motoboys={motoboys}
          areas={areas}
          show={{
            status: !["concluidas", "pagamentos"].includes(type),
            area: type !== "pagamentos",
            search: !["pagamentos", "extras"].includes(type),
            payment: !["extras"].includes(type),
          }}
        />
      )}

      {!content ? (
        <EmptyState icon={FileBarChart2} title="Escolha o relatório e os filtros" description="Clique em Visualizar para conferir os dados antes de exportar." />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold text-[#e8c98e]">{content.title}</h2>
            <p className="text-sm text-muted-foreground">
              {content.period} · {content.rowCount} registro(s)
            </p>
            {appliedFilters.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Filtros: {appliedFilters.join(" · ")}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {content.summary.map((s) => (
                <div key={s.label} className="rounded-md border border-border p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">{s.label}</div>
                  <div className="font-bold text-[#d4af37] tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
          {content.sections.map((section, i) => (
            <section key={i} className="rounded-xl border border-border bg-card p-3">
              {section.title && <h3 className="mb-2 font-semibold text-[#e8c98e]">{section.title}</h3>}
              <Table>
                <TableHeader>
                  <TableRow>
                    {section.columns.map((c) => (
                      <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={section.columns.length} className="py-6 text-center text-muted-foreground">
                        Nenhum registro encontrado para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    section.rows.slice(0, 500).map((row, j) => (
                      <TableRow key={j}>
                        {section.columns.map((c) => (
                          <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                            {String(row[c.key] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {section.totals && (
                  <TableFooter>
                    <TableRow>
                      {section.columns.map((c) => (
                        <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                          {String(section.totals?.[c.key] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
              {section.rows.length > 500 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Exibindo 500 de {section.rows.length} linhas na tela. O PDF contém todas as linhas.
                </p>
              )}
              {section.note && <p className="mt-2 text-xs text-muted-foreground italic">{section.note}</p>}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
