import type { Metadata } from "next"
import { Suspense } from "react"
import { EntregasClient } from "../entregas/entregas-client"
import { requirePagePermission } from "@/lib/auth"
import { addDays, todayISO } from "@/lib/dates"
import { P } from "@/lib/permissions"

export const metadata: Metadata = { title: "Histórico" }

export default async function HistoricoPage() {
  await requirePagePermission(P.entregasVer)
  const today = todayISO()
  return (
    <Suspense>
      <EntregasClient
        title="Histórico"
        description="Consulte entregas de qualquer período: hoje, ontem, semanas, quinzenas, meses ou intervalo personalizado."
        defaultRange={{ from: addDays(today, -30), to: today }}
      />
    </Suspense>
  )
}
