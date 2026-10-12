import "server-only"

import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { getSupabasePublishableKey, getSupabaseServiceKey, getSupabaseUrl } from "@/lib/env"

/** Cliente com a sessão do usuário atual (RLS aplicada). */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  })
}

/**
 * Cliente privilegiado (service_role). Ignora RLS — usar apenas para operações
 * administrativas que já tiveram a permissão do usuário verificada.
 */
export function getAdminSupabase(): SupabaseClient {
  const key = getSupabaseServiceKey()
  if (!key) {
    throw new AdminUnavailableError()
  }
  return createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export class AdminUnavailableError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor. " +
        "Ela é necessária para criar usuários e redefinir senhas.",
    )
    this.name = "AdminUnavailableError"
  }
}
