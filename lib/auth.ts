import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"
import type { SessionContext } from "@/lib/domain"
import { can } from "@/lib/permissions"
import { getServerSupabase } from "@/lib/supabase/server"

/** Contexto do usuário autenticado (perfil, empresa e permissões efetivas). */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.rpc("my_context")
  if (error || !data) return null
  return data as SessionContext
})

export async function requireContext(): Promise<SessionContext> {
  const ctx = await getSessionContext()
  if (!ctx) {
    const supabase = await getServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Sessão válida, mas usuário desativado ou sem empresa ativa: encerra a sessão.
    redirect(user ? "/app/auth/sair?motivo=inativo" : "/app/login")
  }
  return ctx
}

/** Para páginas: redireciona quem não tem a permissão. */
export async function requirePagePermission(key: string): Promise<SessionContext> {
  const ctx = await requireContext()
  if (!can(ctx, key)) redirect(`/app/sem-permissao?p=${encodeURIComponent(key)}`)
  return ctx
}

export class ForbiddenError extends Error {
  constructor(message = "Operação não autorizada para o seu usuário.") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class UnauthenticatedError extends ForbiddenError {
  constructor() {
    super("Sessão expirada. Entre novamente.")
    this.name = "UnauthenticatedError"
  }
}

/** Para ações e APIs: lança ForbiddenError se faltar a permissão. */
export async function assertPermission(key: string | string[]): Promise<SessionContext> {
  const ctx = await getSessionContext()
  if (!ctx) throw new UnauthenticatedError()
  const keys = Array.isArray(key) ? key : [key]
  if (!keys.some((k) => can(ctx, k))) throw new ForbiddenError()
  return ctx
}
