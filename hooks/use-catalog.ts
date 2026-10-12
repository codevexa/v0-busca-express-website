"use client"

import { useCallback, useEffect, useState } from "react"
import type { Area, Motoboy, Neighborhood } from "@/lib/domain"
import { getBrowserSupabase } from "@/lib/supabase/client"

export interface Catalog {
  motoboys: Motoboy[]
  areas: Area[]
  neighborhoods: Neighborhood[]
}

let cached: { at: number; value: Catalog } | null = null

/** Motoboys, áreas e bairros da empresa (cache curto no navegador). */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog>(cached?.value ?? { motoboys: [], areas: [], neighborhoods: [] })
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force && cached && Date.now() - cached.at < 60_000) {
      setCatalog(cached.value)
      setLoading(false)
      return
    }
    setLoading(true)
    const supabase = getBrowserSupabase()
    const [m, a, n] = await Promise.all([
      supabase.from("motoboys").select("*").order("name"),
      supabase.from("delivery_areas").select("*").order("sort_order").order("name"),
      supabase.from("neighborhoods").select("id, name, city, area_id, active").order("name"),
    ])
    const err = m.error ?? a.error ?? n.error
    if (err) {
      setError("Não foi possível carregar motoboys e áreas.")
    } else {
      const value = {
        motoboys: (m.data ?? []) as Motoboy[],
        areas: ((a.data ?? []) as Area[]).map((x) => ({
          ...x,
          charge_amount: Number(x.charge_amount),
          repass_amount: Number(x.repass_amount),
        })),
        neighborhoods: (n.data ?? []) as Neighborhood[],
      }
      cached = { at: Date.now(), value }
      setCatalog(value)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...catalog, loading, error, reload: () => load(true) }
}

export function invalidateCatalog() {
  cached = null
}
