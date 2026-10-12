import type { Metadata } from "next"
import { CalendarioClient } from "./calendario-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Calendário" }

export default async function CalendarioPage() {
  await requirePagePermission(P.entregasVer)
  return <CalendarioClient />
}
