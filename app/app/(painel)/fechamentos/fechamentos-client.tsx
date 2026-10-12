"use client"

import { AlertTriangle, Calculator, CheckCheck, Download, Loader2, Lock, RefreshCw, Unlock } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { ClosingStatusBadge } from "@/components/ossala/status-badge"
import { generateClosing, transitionClosing } from "@/lib/actions/finance"
import { formatDateBR, formatDateTimeBR, fortnightRange, previousFortnight, todayISO } from "@/lib/dates"
import type { ClosingStatus } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { formatBRL } from "@/lib/money"
import { P } from "@/lib/permissions"
import { buildReportContent } from "@/lib/reports/definitions"
import { buildReportPdf, loadImageAsDataUrl, reportFileName } from "@/lib/reports/pdf"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface Closing {
  id: string
  label: string
  start_date: string
  end_date: string
  status: ClosingStatus
  totals: Record<string, number | Record<string, number>>
  divergences: Array<{ type: string; delivery_id: string; comanda: string; date: string; message: string }>
  corrections: Array<{ comanda: string; reason: string; at: string }>
  generated_at: string | null
  approved_at: string | null
  closed_at: string | null
  reopened_at: string | null
  reopen_reason: string | null
}

interface Item {
  id: string
  motoboy_name: string
  deliveries_count: number
  by_area: Record<string, number>
  repass_base: number
  extras_total: number
  adjustments_total: number
  gross_total: number
  net_total: number
  paid_total: number
  pending_total: number
  divergences_count: number
}

const STEPS: Array<{ key: string; label: string }> = [
  { key: "periodo", label: "Período" },
  { key: "consolidado", label: "Consolidação" },
  { key: "revisao", label: "Revisão e divergências" },
  { key: "aprovado", label: "Aprovação" },
  { key: "encerrado", label: "Encerramento" },
  { key: "exportar", label: "Exportação" },
]

export function FechamentosClient() {
  const can = useCan()
  const { settings, session, logoUrl } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const split = settings?.closing_split_day ?? 15
  const today = todayISO()
  const current = fortnightRange(today, split)
  const prev = previousFortnight(today, split)
  const [from, setFrom] = useState(prev.from)
  const [to, setTo] = useState(prev.to)
  const [list, setList] = useState<Closing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const selectedId = params.get("id")
  const [selected, setSelected] = useState<Closing | null>(null)
  const [items, setItems] = useState<Item[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    const { data, error } = await supabase.from("closing_periods").select("*").order("start_date", { ascending: false }).limit(60)
    if (error) setError(friendlyError(error))
    else {
      setList((data ?? []) as Closing[])
      setError(null)
    }
    setLoading(false)
  }, [])

  const loadSelected = useCallback(async () => {
    if (!selectedId) {
      setSelected(null)
      setItems([])
      return
    }
    const supabase = getBrowserSupabase()
    const [{ data: c }, { data: its }] = await Promise.all([
      supabase.from("closing_periods").select("*").eq("id", selectedId).maybeSingle(),
      supabase.from("closing_items").select("*").eq("closing_id", selectedId).order("motoboy_name"),
    ])
    setSelected((c as Closing) ?? null)
    setItems(((its ?? []) as Item[]).map((i) => ({ ...i })))
  }, [selectedId])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadSelected()
  }, [loadSelected])

  const select = (id: string) => router.replace(`?id=${id}`, { scroll: false })

  async function generate(start = from, end = to) {
    if (generating) return false
    setGenerating(true)
    const r = await generateClosing(start, end)
    setGenerating(false)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Consolidado.")
    await load()
    select(r.data.id)
    await loadSelected()
  }

  async function transition(to: "aprovado" | "encerrado" | "reaberto", reason?: string) {
    if (!selected) return false
    const r = await transitionClosing(selected.id, to, reason)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Atualizado.")
    await load()
    await loadSelected()
  }

  async function exportPdf() {
    if (!selected) return
    try {
      const c = await buildReportContent(getBrowserSupabase(), { type: "fechamento", closingId: selected.id }, { showMoney: true, periodLabel: selected.label })
      const logo = logoUrl ? await loadImageAsDataUrl(logoUrl) : null
      const doc = buildReportPdf({
        companyName: session.company.name,
        reportTitle: settings?.report_title ?? "OSSALA - BUSCAR EXPRESS",
        title: c.title,
        period: c.period,
        filters: [`Fechamento: ${selected.label}`],
        generatedBy: `${session.nome} (matrícula ${session.matricula})`,
        generatedAt: new Date(),
        logoDataUrl: logo,
        orientation: "landscape",
        summary: c.summary,
        sections: c.sections,
      })
      doc.save(reportFileName("fechamento", selected.label))
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const t = selected?.totals ?? {}
  const step =
    !selected ? 0 : selected.status === "consolidado" || selected.status === "reaberto" ? 2 : selected.status === "aprovado" ? 3 : selected.status === "encerrado" ? 5 : 1

  return (
    <>
      <PageHeader
        title="Fechamentos"
        description={`Quinzenas de 1 a ${split} e de ${split + 1} ao último dia do mês. Após o encerramento, alterações comuns ficam bloqueadas.`}
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
        }
      />

      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1",
              i <= step ? "border-[#d4af37]/50 text-[#e8c98e]" : "border-border text-muted-foreground",
            )}
          >
            <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px]", i <= step ? "bg-[#800020] text-[#d4af37]" : "bg-muted")}>
              {i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      {can(P.fechamentosCriar) && (
        <section className="mb-4 rounded-xl border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold text-[#e8c98e]">1. Selecione o período e gere a consolidação</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => (setFrom(prev.from), setTo(prev.to))}>
              Quinzena anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={() => (setFrom(current.from), setTo(current.to))}>
              Quinzena atual
            </Button>
            <ConfirmButton
              title="Gerar consolidação?"
              description={`Período de ${formatDateBR(from)} a ${formatDateBR(to)}. Se já existir uma consolidação deste período (não aprovada), ela será recalculada.`}
              confirmLabel="Gerar"
              disabled={generating}
              onConfirm={() => generate()}
            >
              <Calculator /> Gerar consolidação
            </ConfirmButton>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <section className="rounded-xl border border-border bg-card p-2">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : list.length === 0 && !loading ? (
            <EmptyState title="Nenhum fechamento" className="border-0" />
          ) : (
            <ul className="space-y-1">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => select(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                      selectedId === c.id && "bg-muted",
                    )}
                  >
                    <span>
                      <span className="block font-medium">{c.label}</span>
                      <span className="text-xs text-muted-foreground">{formatBRL((c.totals?.net_total as number) ?? 0)}</span>
                    </span>
                    <ClosingStatusBadge status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          {!selected ? (
            <EmptyState icon={Calculator} title="Selecione um fechamento" description="Ou gere a consolidação de um novo período." />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-[#e8c98e]">{selected.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(selected.start_date)} a {formatDateBR(selected.end_date)}
                      {selected.generated_at && ` · consolidado ${formatDateTimeBR(selected.generated_at)}`}
                      {selected.approved_at && ` · aprovado ${formatDateTimeBR(selected.approved_at)}`}
                      {selected.closed_at && ` · encerrado ${formatDateTimeBR(selected.closed_at)}`}
                    </p>
                    {selected.reopen_reason && (
                      <p className="text-xs text-amber-200">
                        Reaberto em {formatDateTimeBR(selected.reopened_at)}: {selected.reopen_reason}
                      </p>
                    )}
                  </div>
                  <ClosingStatusBadge status={selected.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Motoboys", String(t.motoboys ?? 0)],
                    ["Entregas", String(t.deliveries_count ?? 0)],
                    ["Total cobrado", formatBRL(t.charge_total as number)],
                    ["Repasse bruto", formatBRL(t.gross_total as number)],
                    ["Ajustes", formatBRL(t.adjustments_total as number)],
                    ["Total líquido", formatBRL(t.net_total as number)],
                    ["Pago", formatBRL(t.paid_total as number)],
                    ["Pendente", formatBRL(t.pending_total as number)],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-md border border-border p-2">
                      <div className="text-[11px] text-muted-foreground uppercase">{l}</div>
                      <div className="font-bold text-[#d4af37] tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Por área:{" "}
                  {Object.entries((t.by_area as Record<string, number>) ?? {})
                    .map(([a, n]) => `${a}: ${n}`)
                    .join(" · ") || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <h3 className="mb-2 font-semibold text-[#e8c98e]">Consolidação por motoboy</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motoboy</TableHead>
                      <TableHead className="text-right">Entregas</TableHead>
                      <TableHead className="text-right">Repasse área</TableHead>
                      <TableHead className="text-right">Extras</TableHead>
                      <TableHead className="text-right">Ajustes</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead className="text-right">Pendente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          {i.motoboy_name}
                          {i.divergences_count > 0 && <AlertTriangle className="ml-1 inline size-3.5 text-red-300" />}
                          <div className="text-[11px] text-muted-foreground">
                            {Object.entries(i.by_area ?? {})
                              .map(([a, n]) => `${a}: ${n}`)
                              .join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.deliveries_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(i.repass_base)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(i.extras_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(i.adjustments_total)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatBRL(i.net_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(i.paid_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(i.pending_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total geral</TableCell>
                      <TableCell className="text-right">{String(t.deliveries_count ?? 0)}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.repass_base as number)}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.extras_total as number)}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.adjustments_total as number)}</TableCell>
                      <TableCell className="text-right text-[#d4af37]">{formatBRL(t.net_total as number)}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.paid_total as number)}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.pending_total as number)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-[#e8c98e]">
                  <AlertTriangle className="size-4" /> Divergências ({selected.divergences?.length ?? 0})
                </h3>
                {!selected.divergences?.length ? (
                  <p className="text-sm text-emerald-300">Nenhuma divergência identificada.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {selected.divergences.map((d, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                        <span>
                          <strong>{d.comanda}</strong> · {formatDateBR(d.date)} — {d.message}
                        </span>
                        <Link className="text-xs text-[#d4af37] underline" href={`/app/entregas?id=${d.delivery_id}&de=${d.date}&ate=${d.date}`}>
                          Abrir
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.corrections?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3 text-sm">
                  <h3 className="mb-2 font-semibold text-[#e8c98e]">Correções pós-fechamento</h3>
                  <ul className="space-y-1">
                    {selected.corrections.map((c, i) => (
                      <li key={i}>
                        {formatDateTimeBR(c.at)} — comanda {c.comanda}: {c.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(selected.status === "consolidado" || selected.status === "reaberto" || selected.status === "aberto") && can(P.fechamentosCriar) && (
                  <Button variant="outline" onClick={() => generate(selected.start_date, selected.end_date)} disabled={generating}>
                    {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar novamente
                  </Button>
                )}
                {selected.status === "consolidado" && can(P.fechamentosAprovar) && (
                  <ConfirmButton
                    title="Aprovar fechamento?"
                    description={
                      selected.divergences?.length
                        ? `Há ${selected.divergences.length} divergência(s) listada(s). Confirme que foram revisadas.`
                        : "Os valores consolidados serão aprovados."
                    }
                    onConfirm={() => transition("aprovado")}
                  >
                    <CheckCheck /> Aprovar
                  </ConfirmButton>
                )}
                {selected.status === "aprovado" && can(P.fechamentosEncerrar) && (
                  <ConfirmButton
                    className="bg-ossala-gradient"
                    title="Encerrar o período?"
                    description="Entregas e extras deste período ficarão bloqueados para alterações comuns."
                    confirmLabel="Encerrar período"
                    onConfirm={() => transition("encerrado")}
                  >
                    <Lock /> Encerrar período
                  </ConfirmButton>
                )}
                {(selected.status === "aprovado" || selected.status === "encerrado") && can(P.fechamentosReabrir) && (
                  <ConfirmButton
                    variant="outline"
                    title="Reabrir período?"
                    description="A reabertura fica registrada na auditoria."
                    reasonLabel="Justificativa"
                    reasonMinLength={10}
                    onConfirm={(reason) => transition("reaberto", reason)}
                  >
                    <Unlock /> Reabrir
                  </ConfirmButton>
                )}
                {can(P.relatoriosExportar) && (
                  <Button variant="secondary" onClick={exportPdf}>
                    <Download /> Exportar PDF
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}
