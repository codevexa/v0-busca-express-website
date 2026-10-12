import { NextResponse, type NextRequest } from "next/server"
import { homeFor } from "@/lib/permissions"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { AdminUnavailableError, getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"
import { loginSchema } from "@/lib/validation/auth"
import type { SessionContext } from "@/lib/domain"

const GENERIC = "Matrícula ou senha inválidas."

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
  }
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? GENERIC }, { status: 400 })
  }
  const { matricula, password } = parsed.data

  const ip = clientIp(request.headers)
  const limit = rateLimit(`login:${ip}:${matricula.toLowerCase()}`, 8, 5 * 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${limit.retryAfter}s e tente novamente.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    )
  }

  // A tradução matrícula → e-mail do Auth roda só no servidor (service_role).
  let admin
  try {
    admin = getAdminSupabase()
  } catch (error) {
    if (error instanceof AdminUnavailableError) {
      return NextResponse.json({ error: "Login indisponível: servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." }, { status: 503 })
    }
    throw error
  }
  const { data: email, error: lookupError } = await admin.rpc("resolve_login_email", { p_matricula: matricula })
  const supabase = await getServerSupabase()
  if (lookupError) {
    return NextResponse.json({ error: "Serviço de autenticação indisponível. Tente novamente." }, { status: 503 })
  }
  if (!email) {
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

  const { error } = await supabase.auth.signInWithPassword({ email: email as string, password })
  if (error) {
    const status = error.status === 429 ? 429 : 401
    return NextResponse.json(
      { error: status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : GENERIC },
      { status },
    )
  }

  const { data: ctx } = await supabase.rpc("my_context")
  if (!ctx) {
    await supabase.auth.signOut()
    return NextResponse.json({ error: "Usuário sem empresa ativa. Procure o administrador." }, { status: 403 })
  }
  const session = ctx as SessionContext
  await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", session.user_id)

  const next = request.nextUrl.searchParams.get("next")
  const safeNext = next && next.startsWith("/app") && !next.startsWith("//") ? next : null
  return NextResponse.json({
    redirect: session.must_change_password ? "/app/perfil?trocar-senha=1" : (safeNext ?? homeFor(session.role)),
  })
}
