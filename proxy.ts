import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Proxy (antigo middleware): renova a sessão do Supabase Auth e protege as
 * rotas do aplicativo. A autorização fina é feita no servidor e no banco (RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return response
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicAppRoute =
    pathname === "/app/login" || pathname.startsWith("/app/auth/") || pathname === "/app/offline"

  if (pathname.startsWith("/app") && !isPublicAppRoute && !user) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = "/app/login"
    redirect.search = pathname === "/app" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
    return NextResponse.redirect(redirect)
  }

  if (pathname === "/app/login" && user) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = "/app"
    redirect.search = ""
    return NextResponse.redirect(redirect)
  }

  return response
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
}
