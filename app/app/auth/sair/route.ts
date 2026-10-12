import { NextResponse, type NextRequest } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

/** Encerra a sessão de um usuário desativado ou sem empresa ativa. */
export async function GET(request: NextRequest) {
  const supabase = await getServerSupabase()
  await supabase.auth.signOut()
  const motivo = request.nextUrl.searchParams.get("motivo") ?? "inativo"
  return NextResponse.redirect(new URL(`/app/login?erro=${encodeURIComponent(motivo)}`, request.url))
}
