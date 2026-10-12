import type { Metadata } from "next"
import { RelatoriosClient } from "./relatorios-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Relatórios" }

export default async function RelatoriosPage() {
  await requirePagePermission(P.relatoriosVer)
  return <RelatoriosClient />
}
