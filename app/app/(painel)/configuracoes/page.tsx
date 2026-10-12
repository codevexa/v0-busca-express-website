import type { Metadata } from "next"
import { ConfiguracoesClient } from "./configuracoes-client"
import { requirePagePermission } from "@/lib/auth"
import { isOcrConfigured } from "@/lib/ocr/anthropic"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Configurações" }

export default async function ConfiguracoesPage() {
  await requirePagePermission(P.configuracoes)
  const integrations = {
    ocr: isOcrConfigured(),
    serviceRole: !!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY),
    nominatimEmail: !!process.env.NOMINATIM_EMAIL,
    cronSecret: !!process.env.CRON_SECRET,
  }
  return <ConfiguracoesClient integrations={integrations} />
}
