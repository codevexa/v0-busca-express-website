"use server"

import { revalidatePath } from "next/cache"
import { assertPermission, getSessionContext } from "@/lib/auth"
import { fail, type ActionResult } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"
import { guarded } from "@/lib/actions/guard"
import { changePasswordSchema } from "@/lib/validation/auth"
import { firstIssue, manualAddressSchema, settingsSchema } from "@/lib/validation/schemas"

export async function updateOwnProfile(input: { nome: string; phone: string | null }): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await getSessionContext()
    if (!ctx) return { ok: false, error: "Sessão expirada." }
    const nome = input.nome.trim()
    if (nome.length < 2 || nome.length > 120) return { ok: false, error: "Informe um nome válido." }
    const phone = input.phone?.trim() || null
    const supabase = await getServerSupabase()
    const { error } = await supabase.from("profiles").update({ nome, phone }).eq("id", ctx.user_id)
    if (error) return fail(error)
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Perfil atualizado." }
  })
}

export async function changeOwnPassword(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await getSessionContext()
    if (!ctx) return { ok: false, error: "Sessão expirada." }
    const parsed = changePasswordSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const supabase = await getServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "Sessão expirada." }

    // Confirma a senha atual antes de trocar.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.current,
    })
    if (verifyError) return { ok: false, error: "Senha atual incorreta." }
    if (parsed.data.current === parsed.data.password) {
      return { ok: false, error: "A nova senha deve ser diferente da atual." }
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) return { ok: false, error: "Não foi possível alterar a senha. Tente outra senha." }
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", ctx.user_id)
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Senha alterada com sucesso." }
  })
}

export async function saveSettings(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.configuracoes)
    const parsed = settingsSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const supabase = await getServerSupabase()
    const { data, error } = await supabase
      .from("app_settings")
      .update({ ...parsed.data, updated_by: ctx.user_id })
      .eq("company_id", ctx.company.id)
      .select("company_id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Configurações não encontradas ou sem permissão." }
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Configurações salvas." }
  })
}

const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
}

export async function uploadLogo(form: FormData): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.configuracoes)
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione o arquivo do logotipo." }
    const ext = LOGO_TYPES[file.type]
    if (!ext) return { ok: false, error: "Formato inválido. Use PNG, JPG, WEBP ou SVG." }
    if (file.size > 2 * 1024 * 1024) return { ok: false, error: "O arquivo deve ter no máximo 2 MB." }
    const supabase = await getServerSupabase()
    const path = `${ctx.company.id}/logo-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("branding").upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    })
    if (upErr) return { ok: false, error: "Falha ao enviar o logotipo: " + upErr.message }
    const { error } = await supabase
      .from("company_settings")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("company_id", ctx.company.id)
    if (error) return fail(error)
    revalidatePath("/app", "layout")
    const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl
    return { ok: true, data: { url }, message: "Logotipo atualizado." }
  })
}

export async function removeLogo(): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.configuracoes)
    const supabase = await getServerSupabase()
    const { error } = await supabase.from("company_settings").update({ logo_path: null }).eq("company_id", ctx.company.id)
    if (error) return fail(error)
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Logotipo removido. A marca textual será usada." }
  })
}

export async function saveCompanyName(name: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.configuracoes)
    const value = name.trim()
    if (value.length < 2 || value.length > 120) return { ok: false, error: "Nome inválido." }
    const supabase = await getServerSupabase()
    const { error } = await supabase.from("company_settings").update({ display_name: value }).eq("company_id", ctx.company.id)
    if (error) return fail(error)
    const { error: e2 } = await supabase.from("companies").update({ name: value }).eq("id", ctx.company.id)
    if (e2) return fail(e2)
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Nome da empresa atualizado." }
  })
}

export async function markNotificationsRead(ids: string[] | null): Promise<ActionResult<{ count: number }>> {
  return guarded(async () => {
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids })
    if (error) return fail(error)
    return { ok: true, data: { count: Number(data ?? 0) } }
  })
}

export async function saveManualAddress(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.mapaEditar)
    const parsed = manualAddressSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const { id, ...values } = parsed.data
    const supabase = await getServerSupabase()
    const query = id
      ? supabase.from("manual_addresses").update(values).eq("id", id).select("id").maybeSingle()
      : supabase.from("manual_addresses").insert({ ...values, company_id: ctx.company.id }).select("id").single()
    const { data, error } = await query
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Endereço não encontrado ou sem permissão." }

    // Vincular a uma comanda também posiciona a entrega no mapa.
    if (values.delivery_id) {
      const { error: linkError } = await supabase
        .from("deliveries")
        .update({ latitude: values.latitude, longitude: values.longitude, geocode_source: "manual" })
        .eq("id", values.delivery_id)
      if (linkError) return fail(linkError)
    }
    return { ok: true, data: { id: data.id as string }, message: "Endereço salvo." }
  })
}

export async function removeManualAddress(id: string): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await assertPermission(P.mapaEditar)
    const supabase = await getServerSupabase()
    const { data, error } = await supabase.from("manual_addresses").delete().eq("id", id).select("id").maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Endereço não encontrado ou sem permissão." }
    return { ok: true, data: { id }, message: "Endereço removido." }
  })
}

export async function saveStorePosition(input: {
  latitude: number
  longitude: number
  address?: string | null
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.configuracoes)
    const { latitude, longitude } = input
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { ok: false, error: "Coordenadas inválidas." }
    }
    const supabase = await getServerSupabase()
    const patch: Record<string, unknown> = { store_lat: latitude, store_lng: longitude, updated_by: ctx.user_id }
    if (input.address) patch.store_address = input.address.slice(0, 200)
    const { error } = await supabase.from("app_settings").update(patch).eq("company_id", ctx.company.id)
    if (error) return fail(error)
    revalidatePath("/app", "layout")
    return { ok: true, data: null, message: "Posição da loja atualizada." }
  })
}
