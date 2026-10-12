"use server"

import { assertPermission } from "@/lib/auth"
import { fail, type ActionResult } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"
import { guarded } from "@/lib/actions/guard"
import { areaSchema, extraRuleSchema, firstIssue, motoboySchema, neighborhoodSchema } from "@/lib/validation/schemas"

export async function saveMotoboy(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const parsed = motoboySchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const { id, ...values } = parsed.data
    const ctx = await assertPermission(id ? P.motoboysEditar : P.motoboysCriar)
    const supabase = await getServerSupabase()
    const query = id
      ? supabase.from("motoboys").update(values).eq("id", id).select("id").maybeSingle()
      : supabase.from("motoboys").insert({ ...values, company_id: ctx.company.id }).select("id").single()
    const { data, error } = await query
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Motoboy não encontrado ou sem permissão." }
    return { ok: true, data: { id: data.id as string }, message: id ? "Motoboy atualizado." : "Motoboy cadastrado." }
  })
}

export async function saveArea(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.areasEditar)
    const parsed = areaSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const { id, ...values } = parsed.data
    const supabase = await getServerSupabase()
    const query = id
      ? supabase.from("delivery_areas").update(values).eq("id", id).select("id").maybeSingle()
      : supabase.from("delivery_areas").insert({ ...values, company_id: ctx.company.id }).select("id").single()
    const { data, error } = await query
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Área não encontrada ou sem permissão." }
    return {
      ok: true,
      data: { id: data.id as string },
      message: "Área salva. Os novos valores valem para entregas cadastradas a partir de agora.",
    }
  })
}

export async function saveNeighborhood(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.areasEditar)
    const parsed = neighborhoodSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const { id, ...values } = parsed.data
    const supabase = await getServerSupabase()
    const query = id
      ? supabase.from("neighborhoods").update(values).eq("id", id).select("id").maybeSingle()
      : supabase.from("neighborhoods").insert({ ...values, company_id: ctx.company.id }).select("id").single()
    const { data, error } = await query
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Bairro não encontrado ou sem permissão." }
    return { ok: true, data: { id: data.id as string }, message: "Bairro salvo." }
  })
}

export async function removeNeighborhood(id: string): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await assertPermission(P.areasEditar)
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.from("neighborhoods").delete().eq("id", id).select("id").maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Bairro não encontrado ou sem permissão." }
    return { ok: true, data: { id }, message: "Bairro removido." }
  })
}

export async function saveExtraRule(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.areasEditar)
    const parsed = extraRuleSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const { id, conditions, ...rest } = parsed.data
    const cleanConditions: Record<string, unknown> = {}
    if (conditions.area_ids.length) cleanConditions.area_ids = conditions.area_ids
    if (conditions.neighborhood_ids.length) cleanConditions.neighborhood_ids = conditions.neighborhood_ids
    if (conditions.weekdays.length) cleanConditions.weekdays = conditions.weekdays
    if (conditions.start_time && conditions.end_time) {
      cleanConditions.start_time = conditions.start_time
      cleanConditions.end_time = conditions.end_time
    }
    const values = { ...rest, conditions: cleanConditions }
    const supabase = await getServerSupabase()
    const query = id
      ? supabase.from("extra_rules").update(values).eq("id", id).select("id").maybeSingle()
      : supabase.from("extra_rules").insert({ ...values, company_id: ctx.company.id }).select("id").single()
    const { data, error } = await query
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Regra não encontrada ou sem permissão." }
    return { ok: true, data: { id: data.id as string }, message: "Regra salva." }
  })
}
