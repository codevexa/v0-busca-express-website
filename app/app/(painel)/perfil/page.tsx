import type { Metadata } from "next"
import { Suspense } from "react"
import { PerfilClient } from "./perfil-client"
import { requireContext } from "@/lib/auth"

export const metadata: Metadata = { title: "Meu perfil" }

export default async function PerfilPage() {
  await requireContext()
  return (
    <Suspense>
      <PerfilClient />
    </Suspense>
  )
}
