import { AppShell } from "@/components/ossala/app-shell"
import { PasswordChangeGuard } from "@/components/ossala/password-guard"
import { SessionProvider } from "@/components/ossala/session-provider"
import { requireContext } from "@/lib/auth"
import type { AppSettings } from "@/lib/domain"
import { getServerSupabase } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireContext()
  const supabase = await getServerSupabase()
  const [{ data: settings }, { data: branding }] = await Promise.all([
    supabase.from("app_settings").select("*").maybeSingle(),
    supabase.from("company_settings").select("logo_path").maybeSingle(),
  ])
  const logoUrl = branding?.logo_path
    ? supabase.storage.from("branding").getPublicUrl(branding.logo_path).data.publicUrl
    : null

  return (
    <SessionProvider value={{ session, settings: (settings as AppSettings) ?? null, logoUrl }}>
      <PasswordChangeGuard />
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
