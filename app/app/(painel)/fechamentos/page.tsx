import type { Metadata } from "next"
import { Suspense } from "react"
import { FechamentosClient } from "./fechamentos-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Fechamentos" }

export default async function FechamentosPage() {
  await requirePagePermission(P.fechamentosVer)
  return (
    <Suspense>
      <FechamentosClient />
    </Suspense>
  )
}
