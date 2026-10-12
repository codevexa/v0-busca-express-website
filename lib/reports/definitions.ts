import type { SupabaseClient } from "@supabase/supabase-js"
import {
  CLOSING_STATUS,
  DELIVERY_STATUS,
  EXTRA_KIND,
  PAYMENT_STATUS,
  type ClosingStatus,
  type DeliveryRow,
  type ExtraKind,
  type PaymentStatus,
} from "@/lib/domain"
import { formatDateBR, formatDateTimeBR, formatTime } from "@/lib/dates"
import { formatBRL, fromCents, sumCents, toCents } from "@/lib/money"
import { fetchAllDeliveries, type DeliveryFilters } from "@/lib/queries/deliveries"
import { groupTotals, totalsOf } from "@/lib/reports/aggregate"
import type { ReportColumn, ReportSection } from "@/lib/reports/pdf"

export const REPORT_TYPES = [
  { key: "geral", label: "Relatório geral de entregas" },
  { key: "motoboy", label: "Relatório por motoboy" },
  { key: "periodo", label: "Relatório por período" },
  { key: "area", label: "Relatório por área" },
  { key: "pagamentos", label: "Relatório de pagamentos" },
  { key: "extras", label: "Relatório de extras" },
  { key: "pendentes", label: "Relatório de entregas pendentes" },
  { key: "concluidas", label: "Relatório de entregas concluídas" },
  { key: "divergencias", label: "Relatório de divergências" },
  { key: "fechamento", label: "Relatório de fechamento quinzenal" },
] as const

export type ReportType = (typeof REPORT_TYPES)[number]["key"]

export interface ReportParams extends DeliveryFilters {
  type: ReportType
  closingId?: string | null
}

export interface ReportContent {
  title: string
  period: string
  orientation: "portrait" | "landscape"
  summary: Array<{ label: string; value: string }>
  sections: ReportSection[]
  truncated: boolean
  rowCount: number
}

const money = (v: number | string | null | undefined) => formatBRL(v)

function deliveryColumns(showMoney: boolean): ReportColumn[] {
  return [
    { key: "comanda", label: "Comanda", width: 18 },
    { key: "data", label: "Data", width: 22 },
    { key: "endereco", label: "Endereço" },
    { key: "bairro", label: "Bairro", width: 30 },
    { key: "area", label: "Área", width: 20 },
    { key: "motoboy", label: "Motoboy", width: 28 },
    { key: "status", label: "Status", width: 20 },
    { key: "pagamento", label: "Pagamento", width: 20 },
    ...(showMoney
      ? ([
          { key: "cobrado", label: "Cobrado", align: "right", width: 20 },
          { key: "repasse", label: "Repasse líq.", align: "right", width: 22 },
        ] as ReportColumn[])
      : []),
  ]
}

function deliveryRow(d: DeliveryRow) {
  return {
    comanda: d.comanda_number,
    data: `${formatDateBR(d.delivery_date)} ${formatTime(d.delivery_time)}`,
    endereco: [d.address, d.address_number, d.complement].filter(Boolean).join(", "),
    bairro: d.neighborhood ?? "—",
    area: d.area_name ?? "Sem área",
    motoboy: d.motoboy_name ?? "Sem motoboy",
    status: DELIVERY_STATUS[d.status].label + (d.has_divergence ? " ⚠" : ""),
    pagamento: PAYMENT_STATUS[d.payment_status].label,
    cobrado: d.status === "cancelada" ? "—" : money(d.charge_total),
    repasse: d.status === "entregue" ? money(d.repass_net) : "—",
  }
}

function deliveriesSection(rows: DeliveryRow[], showMoney: boolean, title?: string): ReportSection {
  const t = totalsOf(rows)
  return {
    title,
    columns: deliveryColumns(showMoney),
    rows: rows.map(deliveryRow),
    totals: {
      comanda: `${rows.length} reg.`,
      endereco: `${t.delivered} concluída(s) · ${t.open} em aberto · ${t.canceled} cancelada(s)`,
      cobrado: money(t.charge),
      repasse: money(t.net),
    },
    note: showMoney
      ? "Cobrado: valor da área + extras (exceto canceladas). Repasse líquido: repasse da área + extras + ajustes/descontos, somente entregas concluídas."
      : undefined,
  }
}

function moneySummary(rows: DeliveryRow[], showMoney: boolean) {
  const t = totalsOf(rows)
  const base = [
    { label: "Entregas", value: String(t.count) },
    { label: "Concluídas", value: String(t.delivered) },
    { label: "Em aberto", value: String(t.open) },
    { label: "Canceladas", value: String(t.canceled) },
  ]
  if (!showMoney) return base
  return [
    ...base,
    { label: "Total cobrado", value: money(t.charge) },
    { label: "Repasse bruto", value: money(t.gross) },
    { label: "Ajustes/descontos", value: money(t.adjustments) },
    { label: "Repasse líquido", value: money(t.net) },
    { label: "Pago", value: money(t.paid) },
    { label: "Pendente", value: money(t.pending) },
  ]
}

function groupedSection(
  rows: DeliveryRow[],
  key: (d: DeliveryRow) => string,
  label: string,
  showMoney: boolean,
): ReportSection {
  const groups = groupTotals(rows, key)
  const all = totalsOf(rows)
  const columns: ReportColumn[] = [
    { key: "grupo", label },
    { key: "total", label: "Entregas", align: "right" },
    { key: "concluidas", label: "Concluídas", align: "right" },
    { key: "abertas", label: "Em aberto", align: "right" },
    { key: "canceladas", label: "Canceladas", align: "right" },
    ...(showMoney
      ? ([
          { key: "cobrado", label: "Cobrado", align: "right" },
          { key: "base", label: "Repasse área", align: "right" },
          { key: "extras", label: "Extras", align: "right" },
          { key: "ajustes", label: "Ajustes", align: "right" },
          { key: "liquido", label: "Líquido", align: "right" },
          { key: "pago", label: "Pago", align: "right" },
          { key: "pendente", label: "Pendente", align: "right" },
        ] as ReportColumn[])
      : []),
  ]
  const toRow = (grupo: string, t: ReturnType<typeof totalsOf>) => ({
    grupo,
    total: t.count,
    concluidas: t.delivered,
    abertas: t.open,
    canceladas: t.canceled,
    cobrado: money(t.charge),
    base: money(t.repassBase),
    extras: money(t.extras),
    ajustes: money(t.adjustments),
    liquido: money(t.net),
    pago: money(t.paid),
    pendente: money(t.pending),
  })
  return {
    columns,
    rows: groups.map((g) => toRow(g.key, g.totals)),
    totals: toRow("Total geral", all),
  }
}

export async function buildReportContent(
  supabase: SupabaseClient,
  params: ReportParams,
  opts: { showMoney: boolean; periodLabel: string },
): Promise<ReportContent> {
  const def = REPORT_TYPES.find((r) => r.key === params.type)!
  const { showMoney } = opts

  if (params.type === "pagamentos") return paymentsReport(supabase, params, opts, def.label)
  if (params.type === "extras") return extrasReport(supabase, params, opts, def.label)
  if (params.type === "fechamento") return closingReport(supabase, params, opts, def.label)

  const filters: DeliveryFilters = { ...params }
  if (params.type === "pendentes") filters.status = filters.status || null
  if (params.type === "concluidas") filters.status = "entregue"
  if (params.type === "divergencias") filters.divergence = true

  const { rows: all, truncated } = await fetchAllDeliveries(supabase, filters)
  const rows =
    params.type === "pendentes"
      ? all.filter((d) => d.status === "pendente" || d.status === "em_andamento")
      : all

  const base = {
    title: def.label,
    period: opts.periodLabel,
    truncated,
    rowCount: rows.length,
    summary: moneySummary(rows, showMoney),
  }

  switch (params.type) {
    case "motoboy": {
      const sections: ReportSection[] = [groupedSection(rows, (d) => d.motoboy_name ?? "Sem motoboy", "Motoboy", showMoney)]
      const byMotoboy = new Map<string, DeliveryRow[]>()
      for (const d of rows) {
        const k = d.motoboy_name ?? "Sem motoboy"
        byMotoboy.set(k, [...(byMotoboy.get(k) ?? []), d])
      }
      for (const [name, list] of [...byMotoboy.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
        sections.push(deliveriesSection(list, showMoney, `Detalhamento — ${name}`))
      }
      return { ...base, orientation: "landscape", sections }
    }
    case "periodo":
      return {
        ...base,
        orientation: "landscape",
        sections: [groupedSection(rows, (d) => d.delivery_date, "Data", showMoney)].map((s) => ({
          ...s,
          rows: s.rows.map((r) => ({ ...r, grupo: formatDateBR(String(r.grupo)) })),
        })),
      }
    case "area":
      return {
        ...base,
        orientation: "landscape",
        sections: [groupedSection(rows, (d) => d.area_name ?? "Sem área", "Área", showMoney)],
      }
    default:
      return { ...base, orientation: "landscape", sections: [deliveriesSection(rows, showMoney)] }
  }
}

async function paymentsReport(
  supabase: SupabaseClient,
  params: ReportParams,
  opts: { showMoney: boolean; periodLabel: string },
  title: string,
): Promise<ReportContent> {
  let q = supabase
    .from("payments")
    .select("id, created_at, paid_at, status, method, reference, amount, description, motoboy_id, motoboys(name), payment_items(count)")
    .order("created_at", { ascending: true })
    .limit(5000)
  if (params.from) q = q.gte("created_at", `${params.from}T00:00:00-03:00`)
  if (params.to) q = q.lte("created_at", `${params.to}T23:59:59-03:00`)
  if (params.motoboy) q = q.eq("motoboy_id", params.motoboy)
  if (params.payment) q = q.eq("status", params.payment)
  const { data, error } = await q
  if (error) throw error
  type Row = {
    created_at: string
    paid_at: string | null
    status: PaymentStatus
    method: string | null
    reference: string | null
    amount: number
    description: string | null
    motoboys: { name: string } | null
    payment_items: Array<{ count: number }>
  }
  const rows = (data ?? []) as unknown as Row[]
  const active = rows.filter((r) => r.status !== "cancelado")
  const paid = rows.filter((r) => r.status === "pago")
  return {
    title,
    period: opts.periodLabel,
    orientation: "landscape",
    truncated: rows.length >= 5000,
    rowCount: rows.length,
    summary: [
      { label: "Pagamentos", value: String(rows.length) },
      { label: "Valor (não cancelados)", value: money(fromCents(sumCents(active.map((r) => r.amount)))) },
      { label: "Pago", value: money(fromCents(sumCents(paid.map((r) => r.amount)))) },
      {
        label: "Em aberto",
        value: money(fromCents(sumCents(active.filter((r) => r.status !== "pago").map((r) => r.amount)))),
      },
    ],
    sections: [
      {
        columns: [
          { key: "criado", label: "Gerado em", width: 28 },
          { key: "motoboy", label: "Motoboy" },
          { key: "entregas", label: "Entregas", align: "right", width: 18 },
          { key: "status", label: "Situação", width: 24 },
          { key: "metodo", label: "Método", width: 22 },
          { key: "referencia", label: "Referência" },
          { key: "pago_em", label: "Pago em", width: 28 },
          { key: "valor", label: "Valor", align: "right", width: 24 },
        ],
        rows: rows.map((r) => ({
          criado: formatDateTimeBR(r.created_at),
          motoboy: r.motoboys?.name ?? "—",
          entregas: r.payment_items?.[0]?.count ?? 0,
          status: PAYMENT_STATUS[r.status].label,
          metodo: r.method ?? "—",
          referencia: r.reference ?? "—",
          pago_em: r.paid_at ? formatDateTimeBR(r.paid_at) : "—",
          valor: money(r.amount),
        })),
        totals: {
          criado: `${rows.length} pagamento(s)`,
          valor: money(fromCents(sumCents(active.map((r) => r.amount)))),
        },
        note: "O total desconsidera pagamentos cancelados.",
      },
    ],
  }
}

async function extrasReport(
  supabase: SupabaseClient,
  params: ReportParams,
  opts: { showMoney: boolean; periodLabel: string },
  title: string,
): Promise<ReportContent> {
  let q = supabase
    .from("delivery_extras")
    .select(
      "kind, description, charge_amount, repass_amount, created_at, canceled_at, cancel_reason, deliveries!inner(comanda_number, delivery_date, motoboy_id, area_id, status)",
    )
    .order("created_at", { ascending: true })
    .limit(10000)
  if (params.from) q = q.gte("deliveries.delivery_date", params.from)
  if (params.to) q = q.lte("deliveries.delivery_date", params.to)
  if (params.motoboy) q = q.eq("deliveries.motoboy_id", params.motoboy)
  if (params.area) q = q.eq("deliveries.area_id", params.area)
  if (params.status) q = q.eq("deliveries.status", params.status)
  const { data, error } = await q
  if (error) throw error
  type Row = {
    kind: ExtraKind
    description: string
    charge_amount: number
    repass_amount: number
    created_at: string
    canceled_at: string | null
    cancel_reason: string | null
    deliveries: { comanda_number: string; delivery_date: string }
  }
  const rows = (data ?? []) as unknown as Row[]
  const active = rows.filter((r) => !r.canceled_at)
  const byKind = (k: ExtraKind[]) => active.filter((r) => k.includes(r.kind))
  return {
    title,
    period: opts.periodLabel,
    orientation: "landscape",
    truncated: rows.length >= 10000,
    rowCount: rows.length,
    summary: [
      { label: "Lançamentos ativos", value: String(active.length) },
      { label: "Cancelados", value: String(rows.length - active.length) },
      ...(opts.showMoney
        ? [
            { label: "Extras cobrados", value: money(fromCents(sumCents(active.map((r) => r.charge_amount)))) },
            { label: "Extras de repasse", value: money(fromCents(sumCents(byKind(["automatico", "manual"]).map((r) => r.repass_amount)))) },
            { label: "Ajustes/descontos", value: money(fromCents(sumCents(byKind(["ajuste", "desconto"]).map((r) => r.repass_amount)))) },
          ]
        : []),
    ],
    sections: [
      {
        columns: [
          { key: "comanda", label: "Comanda", width: 20 },
          { key: "data", label: "Data entrega", width: 22 },
          { key: "tipo", label: "Tipo", width: 28 },
          { key: "descricao", label: "Descrição" },
          { key: "lancado", label: "Lançado em", width: 28 },
          { key: "situacao", label: "Situação", width: 30 },
          ...(opts.showMoney
            ? ([
                { key: "cobrado", label: "Cobrado", align: "right", width: 20 },
                { key: "repasse", label: "Repasse", align: "right", width: 20 },
              ] as ReportColumn[])
            : []),
        ],
        rows: rows.map((r) => ({
          comanda: r.deliveries.comanda_number,
          data: formatDateBR(r.deliveries.delivery_date),
          tipo: EXTRA_KIND[r.kind],
          descricao: r.description,
          lancado: formatDateTimeBR(r.created_at),
          situacao: r.canceled_at ? `Cancelado: ${r.cancel_reason ?? ""}` : "Ativo",
          cobrado: money(r.charge_amount),
          repasse: money(r.repass_amount),
        })),
        totals: {
          comanda: `${active.length} ativo(s)`,
          cobrado: money(fromCents(sumCents(active.map((r) => r.charge_amount)))),
          repasse: money(fromCents(sumCents(active.map((r) => r.repass_amount)))),
        },
        note: "Totais consideram apenas lançamentos ativos (não cancelados).",
      },
    ],
  }
}

async function closingReport(
  supabase: SupabaseClient,
  params: ReportParams,
  opts: { showMoney: boolean; periodLabel: string },
  title: string,
): Promise<ReportContent> {
  if (!params.closingId) throw new Error("Selecione o fechamento.")
  const [{ data: closing, error }, { data: items, error: e2 }] = await Promise.all([
    supabase.from("closing_periods").select("*").eq("id", params.closingId).maybeSingle(),
    supabase.from("closing_items").select("*").eq("closing_id", params.closingId).order("motoboy_name"),
  ])
  if (error || e2) throw error ?? e2
  if (!closing) throw new Error("Fechamento não encontrado.")
  const t = closing.totals as Record<string, number | Record<string, number>>
  type Item = {
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
  const list = (items ?? []) as Item[]
  const divergences = (closing.divergences ?? []) as Array<{ type: string; comanda: string; date: string; message: string }>
  const status = closing.status as ClosingStatus
  return {
    title,
    period: `${closing.label} (${formatDateBR(closing.start_date)} a ${formatDateBR(closing.end_date)}) · ${CLOSING_STATUS[status].label}`,
    orientation: "landscape",
    truncated: false,
    rowCount: list.length,
    summary: [
      { label: "Motoboys", value: String(t.motoboys ?? 0) },
      { label: "Entregas", value: String(t.deliveries_count ?? 0) },
      { label: "Total cobrado", value: money(t.charge_total as number) },
      { label: "Repasse bruto", value: money(t.gross_total as number) },
      { label: "Ajustes", value: money(t.adjustments_total as number) },
      { label: "Total líquido", value: money(t.net_total as number) },
      { label: "Pago", value: money(t.paid_total as number) },
      { label: "Pendente", value: money(t.pending_total as number) },
    ],
    sections: [
      {
        title: "Consolidação por motoboy",
        columns: [
          { key: "motoboy", label: "Motoboy" },
          { key: "entregas", label: "Entregas", align: "right" },
          { key: "areas", label: "Por área" },
          { key: "base", label: "Repasse área", align: "right" },
          { key: "extras", label: "Extras", align: "right" },
          { key: "ajustes", label: "Ajustes", align: "right" },
          { key: "bruto", label: "Bruto", align: "right" },
          { key: "liquido", label: "Líquido", align: "right" },
          { key: "pago", label: "Pago", align: "right" },
          { key: "pendente", label: "Pendente", align: "right" },
          { key: "diverg", label: "Diverg.", align: "right" },
        ],
        rows: list.map((i) => ({
          motoboy: i.motoboy_name,
          entregas: i.deliveries_count,
          areas: Object.entries(i.by_area ?? {})
            .map(([a, n]) => `${a}: ${n}`)
            .join(" · "),
          base: money(i.repass_base),
          extras: money(i.extras_total),
          ajustes: money(i.adjustments_total),
          bruto: money(i.gross_total),
          liquido: money(i.net_total),
          pago: money(i.paid_total),
          pendente: money(i.pending_total),
          diverg: i.divergences_count,
        })),
        totals: {
          motoboy: "Total geral",
          entregas: String(t.deliveries_count ?? 0),
          areas: Object.entries((t.by_area as Record<string, number>) ?? {})
            .map(([a, n]) => `${a}: ${n}`)
            .join(" · "),
          base: money(t.repass_base as number),
          extras: money(t.extras_total as number),
          ajustes: money(t.adjustments_total as number),
          bruto: money(t.gross_total as number),
          liquido: money(t.net_total as number),
          pago: money(t.paid_total as number),
          pendente: money(t.pending_total as number),
        },
        note: [
          closing.generated_at ? `Consolidado em ${formatDateTimeBR(closing.generated_at)}.` : "",
          closing.approved_at ? `Aprovado em ${formatDateTimeBR(closing.approved_at)}.` : "",
          closing.closed_at ? `Encerrado em ${formatDateTimeBR(closing.closed_at)}.` : "",
          "Valores pagos/pendentes refletem a situação no momento da última consolidação.",
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        title: `Divergências identificadas (${divergences.length})`,
        columns: [
          { key: "data", label: "Data", width: 24 },
          { key: "comanda", label: "Comanda", width: 24 },
          { key: "mensagem", label: "Descrição" },
        ],
        rows: divergences.map((d) => ({ data: formatDateBR(d.date), comanda: d.comanda, mensagem: d.message })),
      },
    ],
  }
}

/** Verificação usada nos testes: soma das linhas = total geral. */
export function sumColumn(rows: Array<Record<string, string | number>>, key: string): number {
  return fromCents(
    rows.reduce((acc, r) => acc + toCents(String(r[key]).replace(/[^\d,-]/g, "").replace(",", ".")), 0),
  )
}
