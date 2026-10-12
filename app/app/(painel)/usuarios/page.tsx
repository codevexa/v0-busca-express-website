import type { Metadata } from "next"
import { UsuariosClient } from "./usuarios-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Usuários" }

export default async function UsuariosPage() {
  await requirePagePermission(P.usuariosVer)
  const adminConfigured = !!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
  return <UsuariosClient adminConfigured={adminConfigured} />
}
