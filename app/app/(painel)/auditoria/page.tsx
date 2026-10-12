import type { Metadata } from "next"
import { AuditoriaClient } from "./auditoria-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Auditoria" }

export default async function AuditoriaPage() {
  await requirePagePermission(P.auditoria)
  return <AuditoriaClient />
}
