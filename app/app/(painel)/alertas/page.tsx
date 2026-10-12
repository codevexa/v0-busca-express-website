import type { Metadata } from "next"
import { AlertasClient } from "./alertas-client"
import { requireContext } from "@/lib/auth"

export const metadata: Metadata = { title: "Alertas" }

export default async function AlertasPage() {
  await requireContext()
  return <AlertasClient />
}
