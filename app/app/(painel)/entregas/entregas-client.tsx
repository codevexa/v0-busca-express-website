"use client"

import { AlertTriangle, Loader2, MapPin, Plus, RefreshCw } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DeliveryDetailDialog } from "@/components/deliveries/delivery-detail"
import { DeliveryFormDialog } from "@/components/deliveries/delivery-form"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { Pagination } from "@/components/ossala/pagination"
import { useCan } from "@/components/ossala/session-provider"
import { DeliveryStatusBadge, PaymentStatusBadge } from "@/components/ossala/status-badge"
import { useCatalog } from "@/hooks/use-catalog"
import { formatDateBR, formatTime, todayISO } from "@/lib/dates"
import type { DeliveryRow } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { formatBRL } from "@/lib/money"
import { P } from "@/lib/permissions"
import { fetchDeliveries, type DeliveryFilters } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"

const PAGE_SIZE = 25

export function EntregasClient({
  title = "Entregas",
  description = "Cadastro, consulta, atribuição e acompanhamento das comandas.",
  defaultRange,
}: {
  title?: string
  description?: string
  defaultRange?: { from: string; to: string }
}) {
  const can = useCan()
  const router = useRouter()
  const params = useSearchParams()
  const { motoboys, areas, neighborhoods } = useCatalog()
  const today = todayISO()

  const [filters, setFilters] = useState<DeliveryFilters>(() => ({
    from: params.get("de") ?? defaultRange?.from ?? (params.get("status") || params.get("divergencia") ? undefined : today),
    to: params.get("ate") ?? defaultRange?.to ?? (params.get("status") || params.get("divergencia") ? undefined : today),
    status: (params.get("status") as DeliveryFilters["status"]) ?? null,
    motoboy: params.get("motoboy"),
    area: params.get("area"),
    divergence: params.get("divergencia") === "1",
    noMotoboy: params.get("sem_motoboy") === "1",
    noArea: params.get("sem_area") === "1",
    search: params.get("q") ?? "",
  }))
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(params.get("nova") === "1" && can(P.entregasCriar))
  const [editing, setEditing] = useState<DeliveryRow | null>(null)
  const [detailId, setDetailId] = useState<string | null>(params.get("id"))
  const showMoney = can(P.financeiroVer)
  const reqId = useRef(0)

  // Pesquisa com atraso para não consultar a cada tecla.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 350)
    return () => clearTimeout(t)
  }, [filters.search])
  const effective = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch])

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const result = await fetchDeliveries(getBrowserSupabase(), effective, page, PAGE_SIZE)
      if (id !== reqId.current) return
      setRows(result.rows)
      setCount(result.count)
      setError(null)
    } catch (e) {
      if (id === reqId.current) setError(friendlyError(e))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [effective, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => setPage(0), [effective])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let timer: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel("entregas-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => load(), 1000)
      })
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [load])

  const openDetail = (id: string | null) => {
    setDetailId(id)
    const sp = new URLSearchParams(params.toString())
    if (id) sp.set("id", id)
    else sp.delete("id")
    sp.delete("nova")
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            {can(P.entregasCriar) && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus /> Nova entrega
              </Button>
            )}
          </>
        }
      />

      <FiltersBar value={filters} onChange={setFilters} motoboys={motoboys} areas={areas} />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !loading && rows.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega encontrada"
          description="Ajuste os filtros ou cadastre uma nova entrega."
          action={
            can(P.entregasCriar) ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus /> Nova entrega
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Computador */}
          <div className="hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comanda</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Motoboy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  {showMoney && <TableHead className="text-right">Cobrado</TableHead>}
                  {showMoney && <TableHead className="text-right">Repasse</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}>
                          <div className="h-5 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer" onClick={() => openDetail(d.id)}>
                        <TableCell className="font-semibold">
                          <span className="flex items-center gap-1.5">
                            {d.comanda_number}
                            {d.has_divergence && <AlertTriangle className="size-3.5 text-red-300" aria-label="Divergência" />}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateBR(d.delivery_date)}
                          <br />
                          <span className="text-muted-foreground">{formatTime(d.delivery_time)}</span>
                        </TableCell>
                        <TableCell className="max-w-64">
                          <div className="truncate">
                            {d.address}
                            {d.address_number ? `, ${d.address_number}` : ""}
                          </div>
                          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            {d.latitude != null && <MapPin className="size-3 text-[#d4af37]" />}
                            {[d.neighborhood, d.city].filter(Boolean).join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {d.area_name ? (
                            <span className="flex items-center gap-1.5 text-sm">
                              <span className="size-2 rounded-full" style={{ background: d.area_color ?? "#666" }} />
                              {d.area_name}
                            </span>
                          ) : (
                            <Badge tone="warning">Sem área</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{d.motoboy_name ?? <Badge tone="warning">Sem motoboy</Badge>}</TableCell>
                        <TableCell>
                          <DeliveryStatusBadge status={d.status} />
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={d.payment_status} />
                        </TableCell>
                        {showMoney && <TableCell className="text-right tabular-nums">{formatBRL(d.charge_total)}</TableCell>}
                        {showMoney && <TableCell className="text-right tabular-nums">{formatBRL(d.repass_net)}</TableCell>}
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* Celular */}
          <ul className="space-y-2 md:hidden">
            {rows.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => openDetail(d.id)}
                  className="w-full rounded-xl border border-border bg-card p-3 text-left active:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {d.comanda_number}
                      {d.has_divergence && <AlertTriangle className="ml-1 inline size-3.5 text-red-300" />}
                    </span>
                    <DeliveryStatusBadge status={d.status} />
                  </div>
                  <p className="mt-1 text-sm">
                    {d.address}
                    {d.address_number ? `, ${d.address_number}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[d.neighborhood, d.area_name, d.motoboy_name ?? "Sem motoboy"].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatDateBR(d.delivery_date)} {formatTime(d.delivery_time)}
                    </span>
                    {showMoney && <span className="tabular-nums text-[#d4af37]">{formatBRL(d.repass_net)}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </>
      )}

      <DeliveryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) setEditing(null)
        }}
        delivery={editing}
        motoboys={motoboys}
        areas={areas}
        neighborhoods={neighborhoods}
        onSaved={(id) => {
          load()
          openDetail(id)
        }}
      />

      <DeliveryDetailDialog
        deliveryId={detailId}
        onOpenChange={(o) => !o && openDetail(null)}
        motoboys={motoboys}
        onEdit={(d) => {
          setEditing(d)
          openDetail(null)
          setFormOpen(true)
        }}
        onChanged={load}
      />
    </>
  )
}
