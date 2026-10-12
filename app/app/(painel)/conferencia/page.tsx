import type { Metadata } from "next"
import { Suspense } from "react"
import { ConferenciaClient } from "./conferencia-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Conferência" }

export default async function ConferenciaPage() {
  await requirePagePermission(P.conferenciaVer)
  return (
    <Suspense>
      <ConferenciaClient />
    </Suspense>
  )
}
