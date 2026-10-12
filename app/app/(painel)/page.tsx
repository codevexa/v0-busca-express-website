import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { DashboardClient } from "./dashboard-client"
import { requireContext } from "@/lib/auth"
import { can, P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Hoje" }

export default async function HojePage() {
  const ctx = await requireContext()
  if (ctx.role === "MOTOBOY") redirect("/app/minhas-entregas")
  if (!can(ctx, P.dashboard)) {
    redirect(can(ctx, P.entregasVer) ? "/app/entregas" : "/app/perfil")
  }
  return <DashboardClient />
}
