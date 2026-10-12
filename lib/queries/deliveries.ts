import type { SupabaseClient } from "@supabase/supabase-js"
import type { DeliveryRow, DeliveryStatus, PaymentStatus } from "@/lib/domain"

export interface DeliveryFilters {
  from?: string
  to?: string
  motoboy?: string | null
  area?: string | null
  status?: DeliveryStatus | "" | null
  payment?: PaymentStatus | "" | null
  search?: string
  divergence?: boolean
  noMotoboy?: boolean
  noArea?: boolean
}

const NUMERIC = [
  "charge_amount",
  "repass_amount",
  "extras_charge_total",
  "extras_repass_total",
  "adjustments_total",
  "charge_total",
  "repass_gross",
  "repass_net",
] as const

export function normalizeDelivery(row: Record<string, unknown>): DeliveryRow {
  const out = { ...row } as Record<string, unknown>
  for (const k of NUMERIC) out[k] = Number(row[k] ?? 0)
  return out as unknown as DeliveryRow
}

/** Aplica os filtros na visão delivery_financials (RLS vale também aqui). */
export function applyDeliveryFilters<Q>(query: Q, f: DeliveryFilters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (f.from) q = q.gte("delivery_date", f.from)
  if (f.to) q = q.lte("delivery_date", f.to)
  if (f.motoboy) q = q.eq("motoboy_id", f.motoboy)
  if (f.area) q = q.eq("area_id", f.area)
  if (f.status) q = q.eq("status", f.status)
  if (f.payment) q = q.eq("payment_status", f.payment)
  if (f.divergence) q = q.eq("has_divergence", true)
  if (f.noMotoboy) q = q.is("motoboy_id", null)
  if (f.noArea) q = q.is("area_id", null)
  const s = f.search?.trim()
  if (s) {
    const safe = s.replace(/[%_,()\\]/g, " ").trim()
    if (safe) q = q.or(`comanda_number.ilike.%${safe}%,address.ilike.%${safe}%,neighborhood.ilike.%${safe}%`)
  }
  return q as Q
}

export async function fetchDeliveries(
  supabase: SupabaseClient,
  f: DeliveryFilters,
  page = 0,
  pageSize = 25,
): Promise<{ rows: DeliveryRow[]; count: number }> {
  let q = supabase.from("delivery_financials").select("*", { count: "exact" })
  q = applyDeliveryFilters(q, f)
  const { data, error, count } = await q
    .order("delivery_date", { ascending: false })
    .order("delivery_time", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []).map(normalizeDelivery), count: count ?? 0 }
}

/** Busca todas as linhas (relatórios), em lotes, até o limite de segurança. */
export async function fetchAllDeliveries(
  supabase: SupabaseClient,
  f: DeliveryFilters,
  limit = 10_000,
): Promise<{ rows: DeliveryRow[]; truncated: boolean }> {
  const rows: DeliveryRow[] = []
  const batch = 1000
  for (let offset = 0; offset < limit; offset += batch) {
    let q = supabase.from("delivery_financials").select("*")
    q = applyDeliveryFilters(q, f)
    const { data, error } = await q
      .order("delivery_date", { ascending: true })
      .order("delivery_time", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + batch - 1)
    if (error) throw error
    rows.push(...(data ?? []).map(normalizeDelivery))
    if (!data || data.length < batch) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}
