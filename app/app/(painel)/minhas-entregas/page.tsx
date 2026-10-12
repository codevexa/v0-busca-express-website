import type { Metadata } from "next"
import { MinhasEntregasClient } from "./minhas-entregas-client"
import { requirePagePermission } from "@/lib/auth"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Minhas entregas" }

export default async function MinhasEntregasPage() {
  const ctx = await requirePagePermission(P.entregasConfirmar)
  return <MinhasEntregasClient hasMotoboy={!!ctx.motoboy_id} />
}
