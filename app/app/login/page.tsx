import type { Metadata } from "next"
import { Suspense } from "react"
import { LoginForm } from "./login-form"
import { getServerSupabase } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Entrar" }
export const dynamic = "force-dynamic"

async function getPublicBranding(): Promise<{ name: string; logoUrl: string | null }> {
  try {
    const supabase = await getServerSupabase()
    const { data } = await supabase.rpc("login_branding", {
      p_slug: process.env.NEXT_PUBLIC_COMPANY_SLUG ?? "empresa-principal",
    })
    const b = data as { name?: string; logo_path?: string | null } | null
    const logoUrl = b?.logo_path ? supabase.storage.from("branding").getPublicUrl(b.logo_path).data.publicUrl : null
    return { name: b?.name ?? "OSSALA", logoUrl }
  } catch {
    return { name: "OSSALA", logoUrl: null }
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [{ erro }, branding] = await Promise.all([searchParams, getPublicBranding()])
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#100b0d] px-4 py-10">
      <Suspense>
        <LoginForm logoUrl={branding.logoUrl} companyName={branding.name} errorCode={erro ?? null} />
      </Suspense>
    </div>
  )
}
