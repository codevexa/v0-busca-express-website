import "server-only"

import { ForbiddenError } from "@/lib/auth"
import { fail, type ActionResult } from "@/lib/errors"
import { getServerSupabase } from "@/lib/supabase/server"

/** Envolve uma ação: trata falta de permissão (e registra o evento) e erros do banco. */
export async function guarded<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      try {
        const supabase = await getServerSupabase()
        await supabase.rpc("report_app_event", {
          p_category: "nao_autorizado",
          p_title: "Operação não autorizada",
          p_message: error.message,
          p_link: null,
        })
      } catch {
        // ignora falha ao registrar
      }
      return { ok: false, error: error.message, code: "42501" }
    }
    return fail(error)
  }
}
