import { NextResponse, type NextRequest } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

/** Retorno dos links de recuperação de senha do Supabase Auth (PKCE). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const next = request.nextUrl.searchParams.get("next") ?? "/app/perfil?trocar-senha=1"
  const safeNext = next.startsWith("/app") && !next.startsWith("//") ? next : "/app"
  if (code) {
    const supabase = await getServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url))
  }
  return NextResponse.redirect(new URL("/app/login?erro=link", request.url))
}
