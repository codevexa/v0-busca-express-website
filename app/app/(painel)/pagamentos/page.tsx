import type { Metadata } from "next"
import { Suspense } from "react"
import { PagamentosClient } from "./pagamentos-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Pagamentos" }

export default async function PagamentosPage() {
  await requirePagePermission(P.pagamentosVer)
  return (
    <Suspense>
      <PagamentosClient />
    </Suspense>
  )
}
