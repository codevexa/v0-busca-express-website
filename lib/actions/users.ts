"use server"

import { assertPermission } from "@/lib/auth"
import { INTERNAL_EMAIL_DOMAIN } from "@/lib/env"
import { fail, type ActionResult } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { AdminUnavailableError, getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"
import { guarded } from "@/lib/actions/guard"
import { passwordSchema } from "@/lib/validation/auth"
import { createUserSchema, firstIssue, updateUserSchema } from "@/lib/validation/schemas"

function internalEmail(matricula: string) {
  const local = matricula
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "-")
  return `${local}@${INTERNAL_EMAIL_DOMAIN}`
}

function adminOrError() {
  try {
    return { admin: getAdminSupabase(), error: null }
  } catch (error) {
    if (error instanceof AdminUnavailableError) return { admin: null, error: error.message }
    throw error
  }
}

/** Cria a conta no Supabase Auth + perfil + vínculo de motoboy (servidor, service_role). */
export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.usuariosGerenciar)
    const parsed = createUserSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const v = parsed.data
    if (v.role === "ADMIN" && ctx.role !== "ADMIN") {
      return { ok: false, error: "Somente administradores podem criar outros administradores." }
    }

    const { admin, error: adminError } = adminOrError()
    if (!admin) return { ok: false, error: adminError! }

    const { data: existing } = await admin.from("profiles").select("id").ilike("matricula", v.matricula).maybeSingle()
    if (existing) return { ok: false, error: "Já existe um usuário com esta matrícula." }

    const email = v.recovery_email ?? internalEmail(v.matricula)
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password: v.password,
      email_confirm: true,
      user_metadata: { nome: v.nome, matricula: v.matricula },
    })
    if (authError || !created.user) {
      return {
        ok: false,
        error: /already/i.test(authError?.message ?? "")
          ? "Já existe uma conta com este e-mail."
          : "Não foi possível criar a conta de acesso.",
      }
    }
    const userId = created.user.id

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      matricula: v.matricula,
      login: v.matricula,
      nome: v.nome,
      role: v.role,
      tipo: v.role.toLowerCase(),
      phone: v.phone,
      email,
      company_id: ctx.company.id,
      must_change_password: v.must_change_password,
      created_by: ctx.user_id,
      ativo: true,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      return fail(profileError)
    }

    // Compatibilidade com a estrutura multiempresa existente.
    await admin
      .from("company_memberships")
      .upsert(
        { company_id: ctx.company.id, user_id: userId, role: v.role.toLowerCase(), status: "active", is_primary: true },
        { onConflict: "company_id,user_id" },
      )

    if (v.role === "MOTOBOY") {
      if (v.motoboy_id) {
        const { error } = await admin
          .from("motoboys")
          .update({ profile_id: userId })
          .eq("id", v.motoboy_id)
          .eq("company_id", ctx.company.id)
          .is("profile_id", null)
        if (error) return fail(error)
      } else {
        const { error } = await admin
          .from("motoboys")
          .insert({ company_id: ctx.company.id, profile_id: userId, name: v.nome, phone: v.phone, created_by: ctx.user_id })
        if (error) return fail(error)
      }
    }

    await admin.from("audit_logs").insert({
      company_id: ctx.company.id,
      actor_id: ctx.user_id,
      action: "usuario_criado",
      entity: "profiles",
      entity_id: userId,
      after_data: { matricula: v.matricula, nome: v.nome, role: v.role },
    })
    return { ok: true, data: { id: userId }, message: "Usuário criado." }
  })
}

export async function updateUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.usuariosGerenciar)
    const parsed = updateUserSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const v = parsed.data
    if (v.id === ctx.user_id) return { ok: false, error: "Use a tela Meu perfil para alterar seus dados." }
    const supabase = await getServerSupabase()
    const { data: before } = await supabase.from("profiles").select("ativo, role").eq("id", v.id).maybeSingle()
    const { data, error } = await supabase
      .from("profiles")
      .update({ nome: v.nome, role: v.role, phone: v.phone, ativo: v.ativo })
      .eq("id", v.id)
      .select("id")
      .maybeSingle()
    if (error) return fail(error)
    if (!data) return { ok: false, error: "Usuário não encontrado ou sem permissão." }

    // Mantém o cadastro de motoboy coerente com o status do usuário.
    if (v.role === "MOTOBOY") {
      await supabase.from("motoboys").update({ active: v.ativo }).eq("profile_id", v.id)
    }

    // Revoga/restaura sessões imediatamente quando possível.
    if (before && before.ativo !== v.ativo) {
      const { admin } = adminOrError()
      if (admin) {
        await admin.auth.admin.updateUserById(v.id, { ban_duration: v.ativo ? "none" : "876000h" })
      }
    }
    return { ok: true, data: { id: v.id }, message: v.ativo ? "Usuário atualizado." : "Usuário desativado." }
  })
}

export async function resetUserPassword(
  userId: string,
  password: string,
  mustChange = true,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.usuariosGerenciar)
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
    const supabase = await getServerSupabase()
    const { data: target } = await supabase.from("profiles").select("id, role, company_id").eq("id", userId).maybeSingle()
    if (!target || target.company_id !== ctx.company.id) return { ok: false, error: "Usuário não encontrado." }
    if (target.role === "ADMIN" && ctx.role !== "ADMIN") {
      return { ok: false, error: "Somente administradores podem redefinir a senha de outro administrador." }
    }
    const { admin, error: adminError } = adminOrError()
    if (!admin) return { ok: false, error: adminError! }
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return { ok: false, error: "Não foi possível redefinir a senha." }
    await admin.from("profiles").update({ must_change_password: mustChange }).eq("id", userId)
    await admin.from("audit_logs").insert({
      company_id: ctx.company.id,
      actor_id: ctx.user_id,
      action: "senha_redefinida",
      entity: "profiles",
      entity_id: userId,
    })
    return { ok: true, data: { id: userId }, message: "Senha redefinida. Informe a senha provisória ao usuário." }
  })
}

/** overrides: chave -> true (conceder), false (revogar) ou null (seguir o padrão do papel). */
export async function setUserPermissions(
  userId: string,
  overrides: Record<string, boolean | null>,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.usuariosGerenciar)
    if (userId === ctx.user_id) return { ok: false, error: "Você não pode alterar as próprias permissões." }
    const supabase = await getServerSupabase()
    const toUpsert = Object.entries(overrides)
      .filter(([, v]) => v !== null)
      .map(([key, allowed]) => ({ user_id: userId, permission_key: key, allowed, granted_by: ctx.user_id }))
    const toRemove = Object.entries(overrides)
      .filter(([, v]) => v === null)
      .map(([key]) => key)
    if (toUpsert.length) {
      const { error } = await supabase.from("user_permissions").upsert(toUpsert, { onConflict: "user_id,permission_key" })
      if (error) return fail(error)
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId)
        .in("permission_key", toRemove)
      if (error) return fail(error)
    }
    return { ok: true, data: { id: userId }, message: "Permissões atualizadas." }
  })
}

export async function setRoleOverrides(
  role: "GESTOR" | "ADMINISTRATIVO" | "MOTOBOY",
  overrides: Record<string, boolean | null>,
): Promise<ActionResult<{ role: string }>> {
  return guarded(async () => {
    const ctx = await assertPermission(P.usuariosGerenciar)
    const supabase = await getServerSupabase()
    const toUpsert = Object.entries(overrides)
      .filter(([, v]) => v !== null)
      .map(([key, allowed]) => ({
        company_id: ctx.company.id,
        role,
        permission_key: key,
        allowed,
        updated_by: ctx.user_id,
        updated_at: new Date().toISOString(),
      }))
    const toRemove = Object.entries(overrides)
      .filter(([, v]) => v === null)
      .map(([key]) => key)
    if (toUpsert.length) {
      const { error } = await supabase
        .from("company_role_overrides")
        .upsert(toUpsert, { onConflict: "company_id,role,permission_key" })
      if (error) return fail(error)
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("company_role_overrides")
        .delete()
        .eq("company_id", ctx.company.id)
        .eq("role", role)
        .in("permission_key", toRemove)
      if (error) return fail(error)
    }
    return { ok: true, data: { role }, message: "Permissões do papel atualizadas." }
  })
}
