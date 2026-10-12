import type { Metadata } from "next"
import { Suspense } from "react"
import { FotosClient } from "./fotos-client"
import { requireContext } from "@/lib/auth"
import { can, P } from "@/lib/permissions"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Fotos de comandas" }

export default async function FotosPage() {
  const ctx = await requireContext()
  if (!can(ctx, P.fotosCriar) && !can(ctx, P.fotosVer)) redirect("/app/sem-permissao?p=fotos.criar")
  return (
    <Suspense>
      <FotosClient />
    </Suspense>
  )
}
