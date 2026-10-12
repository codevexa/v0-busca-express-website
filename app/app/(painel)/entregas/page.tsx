import type { Metadata } from "next"
import { Suspense } from "react"
import { EntregasClient } from "./entregas-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Entregas" }

export default async function EntregasPage() {
  await requirePagePermission(P.entregasVer)
  return (
    <Suspense>
      <EntregasClient />
    </Suspense>
  )
}
