/**
 * Agregações dos relatórios. Usam centavos inteiros e as mesmas colunas da
 * visão delivery_financials, para que os totais batam com o banco.
 */
import type { DeliveryRow } from "@/lib/domain"
import { fromCents, toCents } from "@/lib/money"

export interface Totals {
  count: number
  delivered: number
  canceled: number
  open: number
  charge: number
  repassBase: number
  extras: number
  adjustments: number
  gross: number
  net: number
  paid: number
  pending: number
}

function emptyCents() {
  return { count: 0, delivered: 0, canceled: 0, open: 0, charge: 0, repassBase: 0, extras: 0, adjustments: 0, gross: 0, net: 0, paid: 0, pending: 0 }
}

function add(acc: ReturnType<typeof emptyCents>, d: DeliveryRow) {
  acc.count += 1
  if (d.status === "cancelada") {
    acc.canceled += 1
    return
  }
  acc.charge += toCents(d.charge_total)
  if (d.status === "entregue") {
    acc.delivered += 1
    acc.repassBase += toCents(d.repass_amount)
    acc.extras += toCents(d.extras_repass_total)
    acc.adjustments += toCents(d.adjustments_total)
    acc.gross += toCents(d.repass_gross)
    acc.net += toCents(d.repass_net)
    if (d.payment_status === "pago") acc.paid += toCents(d.repass_net)
    else acc.pending += toCents(d.repass_net)
  } else {
    acc.open += 1
  }
}

function finish(acc: ReturnType<typeof emptyCents>): Totals {
  return {
    count: acc.count,
    delivered: acc.delivered,
    canceled: acc.canceled,
    open: acc.open,
    charge: fromCents(acc.charge),
    repassBase: fromCents(acc.repassBase),
    extras: fromCents(acc.extras),
    adjustments: fromCents(acc.adjustments),
    gross: fromCents(acc.gross),
    net: fromCents(acc.net),
    paid: fromCents(acc.paid),
    pending: fromCents(acc.pending),
  }
}

/**
 * Totais gerais. Cobrança considera entregas não canceladas; repasse
 * considera somente entregas concluídas (mesma regra do fechamento).
 */
export function totalsOf(rows: DeliveryRow[]): Totals {
  const acc = emptyCents()
  for (const d of rows) add(acc, d)
  return finish(acc)
}

export function groupTotals(rows: DeliveryRow[], key: (d: DeliveryRow) => string): Array<{ key: string; totals: Totals }> {
  const map = new Map<string, ReturnType<typeof emptyCents>>()
  for (const d of rows) {
    const k = key(d)
    const acc = map.get(k) ?? emptyCents()
    add(acc, d)
    map.set(k, acc)
  }
  return [...map.entries()].map(([k, acc]) => ({ key: k, totals: finish(acc) })).sort((a, b) => a.key.localeCompare(b.key, "pt-BR"))
}
