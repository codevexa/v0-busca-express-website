/**
 * Variáveis de ambiente. As públicas (NEXT_PUBLIC_*) vão para o navegador;
 * as demais só existem no servidor.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada. Veja .env.example.")
  }
  return url
}

export function getSupabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) não configurada.")
  }
  return key
}

/** Chave privilegiada: usar SOMENTE em código de servidor. */
export function getSupabaseServiceKey(): string | null {
  if (typeof window !== "undefined") {
    throw new Error("A chave de serviço nunca pode ser usada no navegador.")
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? null
}

export const INTERNAL_EMAIL_DOMAIN = process.env.AUTH_INTERNAL_EMAIL_DOMAIN ?? "ossala.internal"

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ??
    "http://localhost:3000"
  )
}
