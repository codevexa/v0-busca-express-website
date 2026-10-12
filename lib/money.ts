/**
 * Valores monetários. O banco armazena numeric(12,2); no TypeScript os cálculos
 * são feitos em centavos inteiros para evitar erros de ponto flutuante.
 * As fórmulas espelham a visão public.delivery_financials.
 */

export type Cents = number

export function toCents(value: number | string | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function fromCents(cents: Cents): number {
  return Math.round(cents) / 100
}

export function sumCents(values: Array<number | string | null | undefined>): Cents {
  return values.reduce<number>((acc, v) => acc + toCents(v), 0)
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatBRL(value: number | string | null | undefined): string {
  return brl.format(fromCents(toCents(value)))
}

/** Converte "12,50" / "12.50" / "R$ 1.234,56" para número com 2 casas. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").trim()
  if (!cleaned) return null
  let normalized = cleaned
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return fromCents(Math.round(n * 100))
}

export interface DeliveryAmounts {
  charge_amount: number | string
  repass_amount: number | string
  extras_charge_total: number | string
  extras_repass_total: number | string
  adjustments_total: number | string
}

/** Mesma fórmula da visão delivery_financials (fonte única dos cálculos). */
export function computeDeliveryTotals(d: DeliveryAmounts) {
  const charge = toCents(d.charge_amount) + toCents(d.extras_charge_total)
  const repassGross = toCents(d.repass_amount) + toCents(d.extras_repass_total)
  const repassNet = repassGross + toCents(d.adjustments_total)
  return {
    chargeTotal: fromCents(charge),
    repassGross: fromCents(repassGross),
    repassNet: fromCents(repassNet),
  }
}

export interface ExtraAmounts {
  kind: "automatico" | "manual" | "ajuste" | "desconto"
  charge_amount: number | string
  repass_amount: number | string
  canceled_at?: string | null
}

/** Mesma regra de app.recalc_delivery_totals. */
export function computeExtrasTotals(extras: ExtraAmounts[]) {
  const active = extras.filter((e) => !e.canceled_at)
  return {
    extras_charge_total: fromCents(sumCents(active.map((e) => e.charge_amount))),
    extras_repass_total: fromCents(
      sumCents(active.filter((e) => e.kind === "automatico" || e.kind === "manual").map((e) => e.repass_amount)),
    ),
    adjustments_total: fromCents(
      sumCents(active.filter((e) => e.kind === "ajuste" || e.kind === "desconto").map((e) => e.repass_amount)),
    ),
  }
}
