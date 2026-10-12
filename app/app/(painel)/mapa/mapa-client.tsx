"use client"

import { Crosshair, Loader2, LocateFixed, MapPinPlus, RefreshCw, Store, X } from "lucide-react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { DeliveryDetailDialog } from "@/components/deliveries/delivery-detail"
import { DeliveryFormDialog } from "@/components/deliveries/delivery-form"
import { AddressSearch, geocodeReverse, type GeoResult } from "@/components/ossala/address-search"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan, useSession } from "@/components/ossala/session-provider"
import type { ManualAddress } from "@/components/map/leaflet-map"
import { useCatalog } from "@/hooks/use-catalog"
import { removeManualAddress, saveManualAddress, saveStorePosition } from "@/lib/actions/account"
import { updateDeliveryPosition } from "@/lib/actions/deliveries"
import { todayISO } from "@/lib/dates"
import type { DeliveryRow } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { fetchAllDeliveries, normalizeDelivery, type DeliveryFilters } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"

const LeafletMap = dynamic(() => import("@/components/map/leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Carregando mapa…
    </div>
  ),
})

type Mode = "none" | "manual" | "store"

const CATEGORIES = [
  { key: "pendente", label: "Pendentes", color: "#f59e0b" },
  { key: "em_andamento", label: "Em andamento", color: "#38bdf8" },
  { key: "entregue", label: "Concluídas", color: "#22c55e" },
  { key: "divergencia", label: "Com divergência", color: "#ef4444" },
  { key: "manual", label: "Endereços manuais", color: "#e8c98e" },
  { key: "loja", label: "Loja", color: "#800020" },
] as const

export function MapaClient() {
  const can = useCan()
  const { session, settings } = useSession()
  const params = useSearchParams()
  const { motoboys, areas, neighborhoods } = useCatalog()
  const today = todayISO()
  const canEdit = can(P.mapaEditar)
  const motoboyView = session.role === "MOTOBOY"

  const [filters, setFilters] = useState<DeliveryFilters>({ from: today, to: today })
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [manual, setManual] = useState<ManualAddress[]>([])
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
  )
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>("none")
  const [draft, setDraft] = useState<(GeoResult & { label_text?: string }) | null>(null)
  const [draftLabel, setDraftLabel] = useState("")
  const [draftDelivery, setDraftDelivery] = useState("")
  const [saving, setSaving] = useState(false)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<DeliveryRow | null>(null)

  const store =
    settings?.store_lat != null && settings?.store_lng != null
      ? { lat: settings.store_lat, lng: settings.store_lng, name: settings.store_name ?? session.company.name, address: settings.store_address }
      : null

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    try {
      const focusId = params.get("entrega")
      const { rows } = await fetchAllDeliveries(supabase, filters, 3000)
      let list = rows
      if (focusId && !rows.some((r) => r.id === focusId)) {
        const { data } = await supabase.from("delivery_financials").select("*").eq("id", focusId).maybeSingle()
        if (data) list = [...rows, normalizeDelivery(data)]
      }
      setDeliveries(list)
      if (!motoboyView) {
        const { data, error } = await supabase.from("manual_addresses").select("*").order("created_at", { ascending: false }).limit(500)
        if (error) throw error
        setManual((data ?? []) as ManualAddress[])
      }
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [filters, params, motoboyView])

  useEffect(() => {
    load()
  }, [load])

  // Foco em uma entrega vinda de outra tela (?entrega=id).
  useEffect(() => {
    const focusId = params.get("entrega")
    const d = deliveries.find((x) => x.id === focusId)
    if (d?.latitude != null) setFlyTarget({ lat: d.latitude, lng: d.longitude!, zoom: 17, key: Date.now() })
  }, [params, deliveries])

  const filtered = useMemo(
    () =>
      deliveries.filter((d) => {
        if (d.has_divergence) return visible.divergencia
        if (d.status === "cancelada") return false
        return visible[d.status] ?? true
      }),
    [deliveries, visible],
  )
  const unlocated = deliveries.filter((d) => d.latitude == null && d.status !== "cancelada")

  async function onMapClick(lat: number, lng: number) {
    if (mode === "none") return
    if (mode === "store") {
      const geo = await geocodeReverse(lat, lng).catch(() => null)
      const r = await saveStorePosition({ latitude: lat, longitude: lng, address: geo?.label ?? null })
      if (!r.ok) return toast.error(r.error)
      toast.success(r.message ?? "Loja posicionada.")
      setMode("none")
      window.location.reload()
      return
    }
    setDraft({
      label: "",
      latitude: lat,
      longitude: lng,
      address: null,
      address_number: null,
      neighborhood: null,
      city: null,
      state: null,
      postal_code: null,
    })
    try {
      const geo = await geocodeReverse(lat, lng)
      if (geo) setDraft({ ...geo, latitude: lat, longitude: lng })
      else toast.info("Endereço não identificado para esta posição. Preencha manualmente.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function saveDraft() {
    if (!draft || saving) return
    if (!draft.address || draft.address.trim().length < 3) return toast.error("Informe o endereço.")
    setSaving(true)
    const r = await saveManualAddress({
      label: draftLabel || null,
      address: draft.address,
      address_number: draft.address_number,
      neighborhood: draft.neighborhood,
      city: draft.city,
      state: draft.state,
      latitude: draft.latitude,
      longitude: draft.longitude,
      delivery_id: draftDelivery || null,
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(draftDelivery ? "Endereço salvo e vinculado à comanda." : (r.message ?? "Salvo."))
    setDraft(null)
    setDraftLabel("")
    setDraftDelivery("")
    setMode("none")
    load()
  }

  async function onDeliveryMoved(d: DeliveryRow, lat: number, lng: number) {
    const r = await updateDeliveryPosition(d.id, lat, lng, "mapa")
    if (!r.ok) {
      toast.error(r.error)
    } else {
      toast.success(`Posição da comanda ${d.comanda_number} corrigida.`)
    }
    load()
  }

  return (
    <>
      <PageHeader
        title="Mapa"
        description="Loja, entregas e endereços manuais sobre o OpenStreetMap."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            {store && (
              <Button variant="outline" onClick={() => setFlyTarget({ lat: store.lat, lng: store.lng, zoom: 15, key: Date.now() })}>
                <LocateFixed /> Centralizar na loja
              </Button>
            )}
          </>
        }
      />
      <FiltersBar
        value={filters}
        onChange={setFilters}
        motoboys={motoboys}
        areas={areas}
        show={{ payment: false, motoboy: !motoboyView }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[60dvh] overflow-hidden rounded-xl border border-border lg:h-[70dvh]">
          {mode !== "none" && (
            <div className="absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-[#800020] px-4 py-1.5 text-xs font-medium text-[#e8c98e] shadow">
              {mode === "store" ? "Clique no mapa para posicionar a loja" : "Clique no mapa para marcar o endereço"}
              <button className="ml-2 underline" onClick={() => setMode("none")}>
                cancelar
              </button>
            </div>
          )}
          <LeafletMap
            center={store ? [store.lat, store.lng] : [-14.235, -51.925]}
            store={visible.loja ? store : null}
            deliveries={filtered}
            manual={visible.manual ? manual : []}
            draft={draft ? { lat: draft.latitude, lng: draft.longitude } : null}
            flyTarget={flyTarget}
            showMoney={can(P.financeiroVer)}
            canEdit={canEdit}
            onMapClick={onMapClick}
            onDeliveryMoved={onDeliveryMoved}
            onOpenDelivery={(id) => (motoboyView ? undefined : setDetailId(id))}
            onRemoveManual={async (m) => {
              if (!confirm("Remover este endereço manual?")) return
              const r = await removeManualAddress(m.id)
              if (!r.ok) return toast.error(r.error)
              toast.success(r.message ?? "Removido.")
              load()
            }}
            fitOnLoad={!params.get("entrega")}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold text-[#e8c98e]">Exibir</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
              {CATEGORIES.filter((c) => !(motoboyView && c.key === "manual")).map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`cat-${c.key}`}
                    checked={visible[c.key]}
                    onCheckedChange={(v) => setVisible((s) => ({ ...s, [c.key]: !!v }))}
                  />
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  <Label htmlFor={`cat-${c.key}`} className="font-normal">
                    {c.label}
                  </Label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {filtered.filter((d) => d.latitude != null).length} entrega(s) no mapa · {unlocated.length} sem posição
            </p>
          </section>

          {!store && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              A posição da loja ainda não foi configurada.
              {can(P.configuracoes) && (
                <Button size="sm" className="mt-2 w-full" onClick={() => setMode("store")}>
                  <Store /> Posicionar a loja no mapa
                </Button>
              )}
            </section>
          )}
          {store && can(P.configuracoes) && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setMode("store")}>
              <Store /> Reposicionar a loja
            </Button>
          )}

          {canEdit && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-3">
              <h2 className="text-sm font-semibold text-[#e8c98e]">Endereço manual</h2>
              <AddressSearch
                city={settings?.default_city}
                state={settings?.default_state}
                onSelect={(r) => {
                  setDraft(r)
                  setFlyTarget({ lat: r.latitude, lng: r.longitude, zoom: 17, key: Date.now() })
                }}
              />
              <Button variant="outline" size="sm" className="w-full" onClick={() => setMode(mode === "manual" ? "none" : "manual")}>
                {mode === "manual" ? <X /> : <Crosshair />} {mode === "manual" ? "Cancelar marcação" : "Marcar posição no mapa"}
              </Button>

              {draft && (
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Identificação (opcional)</Label>
                    <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Ex.: Cliente Maria" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Endereço</Label>
                    <Input value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Número" value={draft.address_number ?? ""} onChange={(e) => setDraft({ ...draft, address_number: e.target.value })} />
                    <Input placeholder="Bairro" value={draft.neighborhood ?? ""} onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })} />
                    <Input placeholder="Cidade" value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
                    <Input placeholder="UF" maxLength={2} value={draft.state ?? ""} onChange={(e) => setDraft({ ...draft, state: e.target.value.toUpperCase() })} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
                  </p>
                  <div className="grid gap-1">
                    <Label className="text-xs">Vincular à comanda</Label>
                    <NativeSelect value={draftDelivery} onChange={(e) => setDraftDelivery(e.target.value)}>
                      <option value="">Não vincular</option>
                      {deliveries
                        .filter((d) => d.status !== "cancelada")
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.comanda_number} — {d.address}
                            {d.latitude == null ? " (sem posição)" : ""}
                          </option>
                        ))}
                    </NativeSelect>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={saveDraft} disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" /> : <MapPinPlus />} Salvar
                    </Button>
                    <Button variant="outline" onClick={() => setDraft(null)}>
                      <X />
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {unlocated.length > 0 && !motoboyView && (
            <section className="rounded-xl border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold text-[#e8c98e]">Sem posição no mapa</h2>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {unlocated.slice(0, 50).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <button className="truncate text-left hover:text-[#d4af37]" onClick={() => setDetailId(d.id)}>
                      {d.comanda_number} — {d.address}
                    </button>
                    {canEdit && can(P.entregasEditar) && (
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        title="Localizar pelo endereço?"
                        description="O endereço cadastrado será buscado no OpenStreetMap e a primeira correspondência será usada. Confira a posição depois."
                        onConfirm={async () => {
                          const q = [d.address, d.address_number, d.neighborhood].filter(Boolean).join(", ")
                          const res = await fetch(
                            `/api/geocode?q=${encodeURIComponent(q)}&city=${encodeURIComponent(d.city ?? settings?.default_city ?? "")}&state=${encodeURIComponent(d.state ?? settings?.default_state ?? "")}`,
                          )
                          const json = (await res.json()) as { results?: GeoResult[]; error?: string }
                          const hit = json.results?.[0]
                          if (!hit) {
                            toast.error(json.error ?? "Endereço não localizado. Marque a posição manualmente.")
                            return false
                          }
                          const r = await updateDeliveryPosition(d.id, hit.latitude, hit.longitude, "nominatim")
                          if (!r.ok) {
                            toast.error(r.error)
                            return false
                          }
                          toast.success("Entrega localizada.")
                          setFlyTarget({ lat: hit.latitude, lng: hit.longitude, zoom: 17, key: Date.now() })
                          load()
                        }}
                      >
                        <Crosshair />
                      </ConfirmButton>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {!motoboyView && (
        <>
          <DeliveryDetailDialog
            deliveryId={detailId}
            onOpenChange={(o) => !o && setDetailId(null)}
            motoboys={motoboys}
            onEdit={(d) => {
              setDetailId(null)
              setEditing(d)
            }}
            onChanged={load}
          />
          <DeliveryFormDialog
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            delivery={editing}
            motoboys={motoboys}
            areas={areas}
            neighborhoods={neighborhoods}
            onSaved={() => load()}
          />
        </>
      )}
    </>
  )
}
