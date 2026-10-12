"use server"

import { assertPermission } from "@/lib/auth"
import type { ClosingStatus } from "@/lib/domain"
import { fail, type ActionResult } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"
import { guarded } from "@/lib/actions/guard"
import { isValidISODate } from "@/lib/dates"

export async function createPayment(input: {
  motoboy_id: string
  delivery_ids: string[]
  idempotency_key: string
  description?: string
  method?: string
  reference?: string
  notes?: string
}): Promise<ActionResult<{ id: string; amount: number }>> {
  return guarded(async () => {
    await assertPermission(P.pagamentosCriar)
    if (!input.delivery_ids?.length) return { ok: false, error: "Selecione ao menos uma entrega." }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .rpc("create_payment", {
        p_motoboy_id: input.motoboy_id,
        p_delivery_ids: input.delivery_ids,
        p_idempotency_key: input.idempotency_key,
        p_description: input.description ?? null,
        p_method: input.method ?? null,
        p_reference: input.reference ?? null,
        p_notes: input.notes ?? null,
      })
      .single()
    if (error) return fail(error)
    const row = data as { id: string; amount: number }
    return { ok: true, data: { id: row.id, amount: Number(row.amount) }, message: "Pagamento gerado." }
  })
}

export async function setPaymentStatus(input: {
  id: string
  status: "pendente" | "em_conferencia" | "aprovado" | "pago" | "cancelado"
  paid_at?: string | null
  method?: string | null
  reference?: string | null
  reason?: string | null
}): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const perm =
      input.status === "aprovado"
        ? P.pagamentosAprovar
        : input.status === "pago"
          ? P.pagamentosConfirmar
          : input.status === "cancelado"
            ? P.pagamentosExcluir
            : P.pagamentosCriar
    await assertPermission(perm)
    const supabase = await getServerSupabase()
    const { error } = await supabase.rpc("set_payment_status", {
      p_payment_id: input.id,
      p_status: input.status,
      p_paid_at: input.paid_at ?? null,
      p_method: input.method ?? null,
      p_reference: input.reference ?? null,
      p_reason: input.reason ?? null,
    })
    if (error) return fail(error)
    return { ok: true, data: { id: input.id }, message: "Situação do pagamento atualizada." }
  })
}

export async function generateClosing(start: string, end: string, label?: string): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await assertPermission(P.fechamentosCriar)
    if (!isValidISODate(start) || !isValidISODate(end) || end < start) return { ok: false, error: "Período inválido." }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .rpc("closing_generate", { p_start: start, p_end: end, p_label: label ?? null })
      .single()
    if (error) return fail(error)
    return { ok: true, data: { id: (data as { id: string }).id }, message: "Consolidação gerada." }
  })
}

export async function transitionClosing(
  id: string,
  to: Extract<ClosingStatus, "aprovado" | "encerrado" | "reaberto">,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const supabase = await getServerSupabase()
    let result
    if (to === "aprovado") {
      await assertPermission(P.fechamentosAprovar)
      result = await supabase.rpc("closing_approve", { p_closing: id })
    } else if (to === "encerrado") {
      await assertPermission(P.fechamentosEncerrar)
      result = await supabase.rpc("closing_close", { p_closing: id })
    } else {
      await assertPermission(P.fechamentosReabrir)
      result = await supabase.rpc("closing_reopen", { p_closing: id, p_reason: reason ?? "" })
    }
    if (result.error) return fail(result.error)
    const messages = { aprovado: "Fechamento aprovado.", encerrado: "Período encerrado.", reaberto: "Período reaberto." }
    return { ok: true, data: { id }, message: messages[to] }
  })
}
