"use server"

import { revalidatePath } from "next/cache"
import { assertPermission } from "@/lib/auth"
import { guarded as guard } from "@/lib/actions/guard"
import type { DeliveryRow } from "@/lib/domain"
import { fail, type ActionResult } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"
import { deliverySchema, extraSchema, firstIssue, type DeliveryInput } from "@/lib/validation/schemas"

function payload(data: ReturnType<typeof deliverySchema.parse>) {
  return {
    comanda_number: data.comanda_number,
    delivery_date: data.delivery_date,
    delivery_time: data.delivery_time,
    address: data.address,
    address_number: data.address_number,
    complement: data.complement,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    geocode_source: data.latitude != null ? (data.geocode_source ?? "manual") : null,
    motoboy_id: data.motoboy_id,
    area_id: data.area_id,
    notes: data.notes,
  }
}

export async function createDelivery(input: DeliveryInput): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission(P.entregasCriar)
    const parsed = deliverySchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.from("deliveries").insert(payload(parsed.data)).select("id").single()
    if (error) {
      await supabase.rpc("report_app_event", {
        p_category: "erro_salvar",
        p_title: "Erro ao salvar entrega",
        p_message: `Comanda ${parsed.data.comanda_number}: ${error.message}`,
        p_link: "/app/entregas",
      })
      return fail(error)
    }
    revalidatePath("/app")
    return { ok: true, data: { id: data.id as string }, message: "Entrega cadastrada." }
  })
}

export async function updateDelivery(id: string, input: DeliveryInput): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission(P.entregasEditar)
    const parsed = deliverySchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("deliveries")
      .update(payload(parsed.data))
      .eq("id", id)
      .select("id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Entrega não encontrada ou sem permissão para editar." }
    return { ok: true, data: { id }, message: "Entrega atualizada." }
  })
}

export async function setDeliveryStatus(
  id: string,
  status: "pendente" | "em_andamento" | "entregue" | "cancelada",
  reason?: string,
): Promise<ActionResult<DeliveryRow>> {
  return guard(async () => {
    const supabase = await getServerSupabase()
    if (status === "cancelada") {
      await assertPermission(P.entregasExcluir)
      if (!reason || reason.trim().length < 3) return { ok: false, error: "Informe o motivo do cancelamento." }
      const { data, error } = await supabase
        .from("deliveries")
        .update({ status, cancel_reason: reason.trim() })
        .eq("id", id)
        .select("*")
        .maybeSingle()
      if (error) return fail(error)
      if (!data) return { ok: false, error: "Entrega não encontrada ou sem permissão." }
      return { ok: true, data: data as DeliveryRow, message: "Entrega cancelada." }
    }
    // Reativação de cancelada
    const { data: current } = await supabase.from("deliveries").select("status").eq("id", id).maybeSingle()
    if (current?.status === "cancelada") {
      await assertPermission(P.entregasExcluir)
      const { data, error } = await supabase.from("deliveries").update({ status }).eq("id", id).select("*").maybeSingle()
      if (error) return fail(error)
      return { ok: true, data: data as DeliveryRow, message: "Entrega reativada." }
    }
    if (current?.status === "entregue") {
      await assertPermission(P.entregasCorrigir)
      if (status === "pendente" || status === "em_andamento") {
        const { data, error } = await supabase.rpc("correct_delivery_confirmation", {
          p_delivery_id: id,
          p_status: status,
          p_reason: reason ?? "",
        })
        if (error) return fail(error)
        return { ok: true, data: data as DeliveryRow, message: "Confirmação corrigida." }
      }
    }
    const { data, error } = await supabase.rpc("set_my_delivery_status", {
      p_delivery_id: id,
      p_status: status,
      p_note: reason ?? null,
    })
    if (error) return fail(error)
    return { ok: true, data: data as DeliveryRow, message: "Status atualizado." }
  })
}

/** "Pedido entregue" / "Iniciar entrega" do aplicativo do motoboy. */
export async function confirmMyDelivery(
  id: string,
  status: "em_andamento" | "entregue",
): Promise<ActionResult<DeliveryRow>> {
  return guard(async () => {
    await assertPermission([P.entregasConfirmar, P.entregasEditar])
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.rpc("set_my_delivery_status", {
      p_delivery_id: id,
      p_status: status,
      p_note: null,
    })
    if (error) return fail(error)
    return {
      ok: true,
      data: data as DeliveryRow,
      message: status === "entregue" ? "Entrega confirmada." : "Entrega iniciada.",
    }
  })
}

export async function assignDelivery(id: string, motoboyId: string | null): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission(P.entregasAtribuir)
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("deliveries")
      .update({ motoboy_id: motoboyId })
      .eq("id", id)
      .select("id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Entrega não encontrada ou sem permissão." }
    return { ok: true, data: { id }, message: motoboyId ? "Motoboy atribuído." : "Atribuição removida." }
  })
}

export async function updateDeliveryPosition(
  id: string,
  latitude: number,
  longitude: number,
  source: "mapa" | "nominatim" | "manual" = "mapa",
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission([P.mapaEditar, P.entregasEditar])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, error: "Coordenadas inválidas." }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("deliveries")
      .update({ latitude, longitude, geocode_source: source })
      .eq("id", id)
      .select("id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Entrega não encontrada ou sem permissão." }
    return { ok: true, data: { id }, message: "Posição atualizada." }
  })
}

export async function addExtra(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = extraSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    await assertPermission(parsed.data.kind === "manual" ? P.extrasCriar : P.financeiroAjustar)
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.from("delivery_extras").insert(parsed.data).select("id").single()
    if (error) return fail(error)
    return { ok: true, data: { id: data.id as string }, message: "Lançamento registrado." }
  })
}

export async function cancelExtra(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission(P.extrasEditar)
    if (reason.trim().length < 3) return { ok: false, error: "Informe o motivo." }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("delivery_extras")
      .update({ canceled_at: new Date().toISOString(), cancel_reason: reason.trim() })
      .eq("id", id)
      .select("id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Lançamento não encontrado ou sem permissão." }
    return { ok: true, data: { id }, message: "Lançamento cancelado." }
  })
}

export async function correctClosedDelivery(
  id: string,
  changes: Record<string, unknown>,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await assertPermission(P.fechamentosCorrigir)
    const supabase = await getServerSupabase()
    const { error } = await supabase.rpc("correct_closed_delivery", {
      p_delivery_id: id,
      p_changes: changes,
      p_reason: reason,
    })
    if (error) return fail(error)
    return { ok: true, data: { id }, message: "Correção registrada com justificativa." }
  })
}

export async function findDuplicates(input: {
  comanda: string
  date: string
  address: string
  number?: string | null
  exclude?: string | null
}): Promise<ActionResult<Array<{ id: string; comanda_number: string; delivery_date: string; address: string; reason: string }>>> {
  return guard(async () => {
    await assertPermission([P.entregasCriar, P.entregasEditar])
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.rpc("find_delivery_duplicates", {
      p_comanda: input.comanda,
      p_date: input.date,
      p_address: input.address,
      p_number: input.number ?? null,
      p_exclude: input.exclude ?? null,
    })
    if (error) return fail(error)
    return { ok: true, data: data ?? [] }
  })
}
