"use client"

import { Bike, Camera, CheckCircle2, Loader2, MapPin, Navigation, PackageCheck, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useSession } from "@/components/ossala/session-provider"
import { DeliveryStatusBadge } from "@/components/ossala/status-badge"
import { confirmMyDelivery } from "@/lib/actions/deliveries"
import { addDays, formatDateBR, formatDateTimeBR, formatTime, todayISO } from "@/lib/dates"
import type { DeliveryRow } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { normalizeDelivery } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"

type View = "abertas" | "hoje" | "concluidas"

export function MinhasEntregasClient({ hasMotoboy }: { hasMotoboy: boolean }) {
  const { session } = useSession()
  const [view, setView] = useState<View>("abertas")
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session.motoboy_id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const supabase = getBrowserSupabase()
    const today = todayISO()
    // RLS garante que o motoboy veja somente as próprias entregas.
    let q = supabase
      .from("deliveries")
      .select(
        "id, comanda_number, delivery_date, delivery_time, address, address_number, complement, neighborhood, city, state, latitude, longitude, notes, status, has_divergence, conference_status, delivered_at, area_id, motoboy_id, payment_status, created_at, updated_at, delivery_areas(name, color)",
      )
      .eq("motoboy_id", session.motoboy_id)
    if (view === "abertas") q = q.in("status", ["pendente", "em_andamento"]).gte("delivery_date", addDays(today, -7))
    if (view === "hoje") q = q.eq("delivery_date", today).neq("status", "cancelada")
    if (view === "concluidas") q = q.eq("status", "entregue").gte("delivery_date", addDays(today, -15))
    const { data, error } = await q
      .order("delivery_date", { ascending: view !== "concluidas" })
      .order("delivery_time", { ascending: view !== "concluidas" })
      .limit(200)
    if (error) {
      setError(friendlyError(error))
    } else {
      setRows(
        (data ?? []).map((r) => {
          const area = (r as unknown as { delivery_areas?: { name: string; color: string } | null }).delivery_areas
          return normalizeDelivery({ ...r, area_name: area?.name ?? null, area_color: area?.color ?? null })
        }),
      )
      setError(null)
    }
    setLoading(false)
  }, [session.motoboy_id, view])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!session.motoboy_id) return
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("minhas-entregas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `motoboy_id=eq.${session.motoboy_id}` },
        () => load(),
      )
      .subscribe()
    const interval = setInterval(load, 60_000)
    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [load, session.motoboy_id])

  async function change(d: DeliveryRow, status: "em_andamento" | "entregue") {
    const r = await confirmMyDelivery(d.id, status)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Atualizado.")
    await load()
  }

  if (!hasMotoboy || !session.motoboy_id) {
    return (
      <EmptyState
        icon={Bike}
        title="Cadastro de motoboy não vinculado"
        description="Seu usuário ainda não está vinculado a um cadastro de motoboy ativo. Procure o gestor."
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Minhas entregas"
        description="Somente as entregas atribuídas a você."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
        }
      />
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mb-4">
        <TabsList>
          <TabsTrigger value="abertas">Em aberto</TabsTrigger>
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !loading && rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nenhuma entrega aqui" description="Novas entregas atribuídas aparecem automaticamente." />
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => {
            const fullAddress = [
              [d.address, d.address_number].filter(Boolean).join(", "),
              d.complement,
              d.neighborhood,
              [d.city, d.state].filter(Boolean).join(" - "),
            ]
              .filter(Boolean)
              .join(" · ")
            const navQuery = encodeURIComponent(
              d.latitude != null ? `${d.latitude},${d.longitude}` : [d.address, d.address_number, d.neighborhood, d.city].filter(Boolean).join(", "),
            )
            return (
              <li key={d.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-[#e8c98e]">Comanda {d.comanda_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(d.delivery_date)} · {formatTime(d.delivery_time)}
                      {d.area_name && ` · ${d.area_name}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <DeliveryStatusBadge status={d.status} />
                    {d.has_divergence && <Badge tone="danger">Divergência</Badge>}
                  </div>
                </div>
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[#d4af37]" />
                  {fullAddress}
                </p>
                {d.notes && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{d.notes}</p>}
                {d.delivered_at && (
                  <p className="mt-2 text-xs text-emerald-300">Entregue em {formatDateTimeBR(d.delivered_at)}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button asChild variant="outline">
                    <a href={`https://www.openstreetmap.org/search?query=${navQuery}`} target="_blank" rel="noreferrer">
                      <Navigation /> Rota
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/app/fotos?entrega=${d.id}&comanda=${encodeURIComponent(d.comanda_number)}`}>
                      <Camera /> Foto
                    </Link>
                  </Button>
                  {d.status === "pendente" && (
                    <ConfirmButton
                      variant="secondary"
                      title="Iniciar entrega?"
                      description={`Comanda ${d.comanda_number}`}
                      confirmLabel="Iniciar"
                      onConfirm={() => change(d, "em_andamento")}
                    >
                      <Bike /> Iniciar
                    </ConfirmButton>
                  )}
                  {(d.status === "pendente" || d.status === "em_andamento") && (
                    <ConfirmButton
                      className="bg-ossala-gradient col-span-2 h-12 text-base"
                      title="Confirmar pedido entregue?"
                      description={
                        <span>
                          Comanda <strong>{d.comanda_number}</strong> — {d.address}
                          {d.address_number ? `, ${d.address_number}` : ""}. Depois de confirmada, só um gestor pode corrigir.
                        </span>
                      }
                      confirmLabel="Pedido entregue"
                      onConfirm={() => change(d, "entregue")}
                    >
                      <CheckCircle2 /> Pedido entregue
                    </ConfirmButton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
