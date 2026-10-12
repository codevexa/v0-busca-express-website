import type { Metadata } from "next"
import { Suspense } from "react"
import { MapaClient } from "./mapa-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Mapa" }

export default async function MapaPage() {
  await requirePagePermission(P.mapaVer)
  return (
    <Suspense>
      <MapaClient />
    </Suspense>
  )
}
