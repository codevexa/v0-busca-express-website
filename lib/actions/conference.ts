"use server"

import { assertPermission } from "@/lib/auth"
import { fail, type ActionResult } from "@/lib/errors"
import { compareDelivery, countDivergences } from "@/lib/ocr/compare"
import { OCR_FIELDS, type OcrFields } from "@/lib/ocr/types"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"
import { guarded } from "@/lib/actions/guard"

const DELIVERY_COLUMNS = "id, comanda_number, address, address_number, complement, neighborhood, city, state"

/**
 * Revisão manual obrigatória da conferência: corrige campos identificados,
 * vincula a entrega correta e aprova, rejeita ou solicita nova foto.
 */
export async function reviewConference(input: {
  id: string
  decision: "aprovada" | "rejeitada" | "nova_foto_solicitada" | "salvar"
  corrected_fields?: Partial<Record<(typeof OCR_FIELDS)[number]["key"], string | null>>
  delivery_id?: string | null
  notes?: string | null
}): Promise<ActionResult<{ id: string; divergences: number }>> {
  return guarded(async () => {
    if (input.decision === "salvar") await assertPermission([P.conferenciaCriar, P.conferenciaAprovar])
    else await assertPermission(P.conferenciaAprovar)

    const supabase = await getServerSupabase()
    const { data: conf, error } = await supabase
      .from("delivery_conferences")
      .select("id, status, ocr_fields, delivery_id")
      .eq("id", input.id)
      .maybeSingle()
    if (error) return fail(error)
    if (!conf) return { ok: false, error: "Conferência não encontrada." }
    if (["aprovada", "rejeitada", "nova_foto_solicitada"].includes(conf.status)) {
      return { ok: false, error: "Esta conferência já foi revisada." }
    }

    const deliveryId = input.delivery_id === undefined ? conf.delivery_id : input.delivery_id
    let delivery = null
    if (deliveryId) {
      const { data } = await supabase.from("deliveries").select(DELIVERY_COLUMNS).eq("id", deliveryId).maybeSingle()
      if (!data) return { ok: false, error: "Entrega não encontrada." }
      delivery = data
    }

    // Campos corrigidos manualmente substituem os identificados (confiança 1 = verificado).
    const base = (conf.ocr_fields ?? {}) as Partial<OcrFields>
    const merged: Partial<OcrFields> = { ...base }
    const corrections: Record<string, string | null> = {}
    for (const { key } of OCR_FIELDS) {
      if (input.corrected_fields && key in input.corrected_fields) {
        const v = input.corrected_fields[key]?.trim() || null
        if ((base[key]?.value ?? null) !== v) corrections[key] = v
        merged[key] = { value: v, confidence: 1 }
      }
    }

    const comparison = compareDelivery(delivery, merged)
    const divergences = countDivergences(comparison)
    const notes = input.notes?.trim() || null

    if (input.decision === "aprovada") {
      if (!delivery) return { ok: false, error: "Vincule a conferência a uma entrega antes de aprovar." }
      if (divergences > 0 && (!notes || notes.length < 5)) {
        return { ok: false, error: "Há divergências: descreva nas observações por que a conferência está sendo aprovada." }
      }
    }
    if (input.decision === "rejeitada" && (!notes || notes.length < 5)) {
      return { ok: false, error: "Informe o motivo da rejeição nas observações." }
    }

    const { error: upErr } = await supabase
      .from("delivery_conferences")
      .update({
        status: input.decision === "salvar" ? conf.status : input.decision,
        delivery_id: delivery?.id ?? null,
        corrected_fields: corrections,
        comparison,
        divergence_count: divergences,
        notes,
      })
      .eq("id", input.id)
    if (upErr) return fail(upErr)

    const messages = {
      aprovada: "Conferência aprovada.",
      rejeitada: "Conferência rejeitada. A entrega ficou marcada com divergência.",
      nova_foto_solicitada: "Nova foto solicitada ao responsável.",
      salvar: "Correções salvas.",
    }
    return { ok: true, data: { id: input.id, divergences }, message: messages[input.decision] }
  })
}

/** Conferência manual (sem OCR) a partir de uma entrega. */
export async function createManualConference(deliveryId: string, notes: string): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await assertPermission(P.conferenciaCriar)
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("delivery_conferences")
      .insert({
        delivery_id: deliveryId,
        status: "aguardando_revisao",
        ocr_provider: "manual",
        notes: notes.trim() || null,
      })
      .select("id")
      .single()
    if (error) return fail(error)
    return { ok: true, data: { id: data.id as string }, message: "Conferência manual criada." }
  })
}
