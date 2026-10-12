import type { Metadata } from "next"
import { MotoboysClient } from "./motoboys-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Motoboys" }

export default async function MotoboysPage() {
  await requirePagePermission(P.motoboysVer)
  return <MotoboysClient />
}
