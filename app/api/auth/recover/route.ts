import { NextResponse, type NextRequest } from "next/server"
import { INTERNAL_EMAIL_DOMAIN, getAppUrl } from "@/lib/env"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { getServerSupabase } from "@/lib/supabase/server"

/**
 * Recuperação de acesso. Funciona apenas para contas com e-mail real
 * cadastrado; contas com e-mail interno (matrícula) dependem do administrador.
 * A resposta é sempre a mesma para não revelar quais matrículas existem.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { matricula?: string }
  const matricula = String(body.matricula ?? "").trim()
  const generic = {
    message:
      "Se a matrícula tiver um e-mail de recuperação cadastrado, enviamos um link. " +
      "Caso contrário, peça ao administrador para redefinir sua senha.",
  }
  if (!matricula) return NextResponse.json(generic)

  const limit = rateLimit(`recover:${clientIp(request.headers)}`, 5, 15 * 60_000)
  if (!limit.ok) return NextResponse.json(generic)

  const supabase = await getServerSupabase()
  const { data: email } = await supabase.rpc("resolve_login_email", { p_matricula: matricula })
  if (typeof email === "string" && !email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) && !email.endsWith("@ossala.local")) {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/app/auth/callback?next=/app/perfil?trocar-senha=1`,
    })
  }
  return NextResponse.json(generic)
}
