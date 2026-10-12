import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { UnauthenticatedError, assertPermission } from "@/lib/auth"
import { addDays, todayISO } from "@/lib/dates"
import { friendlyError } from "@/lib/errors"
import { extractComanda } from "@/lib/ocr/anthropic"
import { compareDelivery, countDivergences, extractComandaCandidates } from "@/lib/ocr/compare"
import { OcrError, type OcrResult } from "@/lib/ocr/types"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
type Mime = keyof typeof TYPES

const DELIVERY_COLUMNS = "id, comanda_number, delivery_date, address, address_number, complement, neighborhood, city, state"

/**
 * POST /api/conferencia/ocr
 *
 * multipart/form-data:
 *   file         imagem (JPG/PNG/WEBP, até 10 MB) — obrigatório em uma nova conferência
 *   source       "camera" | "galeria"
 *   delivery_id  entrega já conhecida (opcional)
 *   comanda      número informado pelo usuário (opcional, ajuda a localizar)
 *   conference_id  reprocessa uma conferência existente com a mesma foto (nova tentativa)
 *
 * Responde com a conferência criada/atualizada, os dados identificados e a
 * comparação. Nenhum resultado é inventado: em falha, a conferência fica com
 * status "falha_ocr" e a mensagem do erro.
 */
export async function POST(request: NextRequest) {
  let ctx
  try {
    ctx = await assertPermission(P.conferenciaCriar)
  } catch (error) {
    const status = error instanceof UnauthenticatedError ? 401 : 403
    return NextResponse.json({ error: (error as Error).message }, { status })
  }

  const supabase = await getServerSupabase()
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Envie os dados como multipart/form-data." }, { status: 400 })
  }

  const conferenceId = stringOrNull(form.get("conference_id"))
  const deliveryHint = stringOrNull(form.get("delivery_id"))
  const comandaHint = stringOrNull(form.get("comanda"))

  let image: Buffer
  let mime: Mime
  let conference: { id: string; photo_id: string | null; delivery_id: string | null }

  if (conferenceId) {
    // Nova tentativa usando a foto já armazenada.
    const { data: existing, error } = await supabase
      .from("delivery_conferences")
      .select("id, photo_id, delivery_id, status, delivery_photos(storage_path, mime_type)")
      .eq("id", conferenceId)
      .maybeSingle()
    if (error || !existing) return NextResponse.json({ error: "Conferência não encontrada." }, { status: 404 })
    if (!["falha_ocr", "aguardando_revisao", "processando"].includes(existing.status)) {
      return NextResponse.json({ error: "Esta conferência já foi revisada." }, { status: 409 })
    }
    const photo = existing.delivery_photos as unknown as { storage_path: string; mime_type: string } | null
    if (!photo) return NextResponse.json({ error: "A foto desta conferência não está mais disponível." }, { status: 410 })
    const { data: blob, error: dlError } = await supabase.storage.from("delivery-photos").download(photo.storage_path)
    if (dlError || !blob) return NextResponse.json({ error: "Não foi possível ler a foto armazenada." }, { status: 502 })
    image = Buffer.from(await blob.arrayBuffer())
    mime = (photo.mime_type in TYPES ? photo.mime_type : "image/jpeg") as Mime
    conference = { id: existing.id, photo_id: existing.photo_id, delivery_id: existing.delivery_id }
    await supabase.from("delivery_conferences").update({ status: "processando", error_message: null }).eq("id", existing.id)
  } else {
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Selecione ou fotografe a comanda." }, { status: 400 })
    }
    if (!(file.type in TYPES)) {
      return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG ou WEBP." }, { status: 415 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "A imagem deve ter no máximo 10 MB." }, { status: 413 })
    }
    mime = file.type as Mime
    image = Buffer.from(await file.arrayBuffer())
    if (!looksLikeImage(image, mime)) {
      return NextResponse.json({ error: "O arquivo enviado não é uma imagem válida." }, { status: 415 })
    }
    const source = form.get("source") === "camera" ? "camera" : "galeria"

    // 1. Armazena a imagem em espaço privado da empresa.
    const now = new Date()
    const path = `${ctx.company.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${randomUUID()}.${TYPES[mime]}`
    const { error: uploadError } = await supabase.storage
      .from("delivery-photos")
      .upload(path, image, { contentType: mime, upsert: false })
    if (uploadError) {
      return NextResponse.json({ error: "Falha ao armazenar a imagem: " + uploadError.message }, { status: 502 })
    }

    const { data: photo, error: photoError } = await supabase
      .from("delivery_photos")
      .insert({
        storage_path: path,
        mime_type: mime,
        size_bytes: image.length,
        source,
        delivery_id: deliveryHint,
        comanda_number: comandaHint,
      })
      .select("id")
      .single()
    if (photoError) return NextResponse.json({ error: friendlyError(photoError) }, { status: 400 })

    const { data: created, error: confError } = await supabase
      .from("delivery_conferences")
      .insert({ photo_id: photo.id, delivery_id: deliveryHint, status: "processando" })
      .select("id, photo_id, delivery_id")
      .single()
    if (confError) return NextResponse.json({ error: friendlyError(confError) }, { status: 400 })
    conference = created
  }

  // 2. OCR
  let ocr: OcrResult
  try {
    ocr = await extractComanda(image, mime)
  } catch (error) {
    const message = error instanceof OcrError ? error.message : "Falha inesperada no OCR."
    await supabase
      .from("delivery_conferences")
      .update({
        status: "falha_ocr",
        error_message: message,
        ocr_provider: "anthropic",
      })
      .eq("id", conference.id)
    return NextResponse.json(
      {
        conference_id: conference.id,
        status: "falha_ocr",
        error: message,
        error_code: error instanceof OcrError ? error.code : "provider_error",
      },
      { status: 200 },
    )
  }

  // 3. Localiza a entrega correspondente.
  const delivery = await findDelivery(supabase, conference.delivery_id ?? deliveryHint, [
    ...extractComandaCandidates(ocr.fields.comanda_number.value),
    ...extractComandaCandidates(comandaHint),
  ])

  // 4. Compara e registra (aprovação sempre manual).
  const comparison = compareDelivery(delivery, ocr.fields)
  const divergences = countDivergences(comparison)
  const { data: updated, error: updateError } = await supabase
    .from("delivery_conferences")
    .update({
      status: "aguardando_revisao",
      delivery_id: delivery?.id ?? null,
      ocr_provider: ocr.provider,
      ocr_model: ocr.model,
      ocr_raw_text: ocr.rawText,
      ocr_fields: ocr.fields,
      ocr_confidence: ocr.overallConfidence,
      comparison,
      divergence_count: divergences,
      error_message: delivery ? null : "Nenhuma entrega cadastrada corresponde à comanda identificada.",
    })
    .eq("id", conference.id)
    .select("*")
    .single()
  if (updateError) return NextResponse.json({ error: friendlyError(updateError) }, { status: 400 })

  if (delivery && conference.photo_id) {
    await supabase
      .from("delivery_photos")
      .update({ delivery_id: delivery.id, comanda_number: delivery.comanda_number })
      .eq("id", conference.photo_id)
  }

  return NextResponse.json({
    conference_id: conference.id,
    status: "aguardando_revisao",
    conference: updated,
    delivery,
    comparison,
    divergences,
    fields: ocr.fields,
    confidence: ocr.overallConfidence,
  })
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function looksLikeImage(buf: Buffer, mime: Mime): boolean {
  if (buf.length < 12) return false
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8
  if (mime === "image/png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP"
}

async function findDelivery(supabase: SupabaseClient, deliveryId: string | null, candidates: string[]) {
  if (deliveryId) {
    const { data } = await supabase.from("deliveries").select(DELIVERY_COLUMNS).eq("id", deliveryId).maybeSingle()
    if (data) return data
  }
  const today = todayISO()
  for (const candidate of candidates) {
    const { data } = await supabase
      .from("deliveries")
      .select(DELIVERY_COLUMNS)
      .ilike("comanda_number", candidate.replace(/[%_\\]/g, "\\$&"))
      .gte("delivery_date", addDays(today, -7))
      .lte("delivery_date", addDays(today, 1))
      .neq("status", "cancelada")
      .order("delivery_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  return null
}
