import type { Metadata } from "next"
import { AreasClient } from "./areas-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Áreas e cobrança" }

export default async function AreasPage() {
  await requirePagePermission(P.areasVer)
  return <AreasClient />
}
