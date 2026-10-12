"use client"

import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useEffect, useMemo, useRef } from "react"
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet"
import type { DeliveryRow } from "@/lib/domain"
import { DELIVERY_STATUS } from "@/lib/domain"
import { formatDateBR, formatTime } from "@/lib/dates"
import { formatBRL } from "@/lib/money"

export interface ManualAddress {
  id: string
  label: string | null
  address: string
  address_number: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  latitude: number
  longitude: number
  delivery_id: string | null
}

const STATUS_COLOR: Record<string, string> = {
  pendente: "#f59e0b",
  em_andamento: "#38bdf8",
  entregue: "#22c55e",
  cancelada: "#6b7280",
}

function deliveryIcon(d: DeliveryRow) {
  const color = d.has_divergence ? "#ef4444" : (STATUS_COLOR[d.status] ?? "#d4af37")
  return L.divIcon({
    className: "ossala-area-marker",
    html: `<div class="pin" style="background:${color};outline:2px solid ${d.area_color ?? "#d4af37"};outline-offset:1px"></div>`,
    iconSize: [26, 26],
    iconAnchor: [11, 24],
    popupAnchor: [0, -22],
  })
}

const storeIcon = L.divIcon({
  className: "ossala-store-marker",
  html: `<div class="pin">LOJA</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -18],
})

const manualIcon = L.divIcon({
  className: "ossala-manual-marker",
  html: `<div class="pin"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
})

const draftIcon = L.divIcon({
  className: "ossala-manual-marker",
  html: `<div class="pin" style="background:#d4af37;border-color:#800020"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number; key: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 0.6 })
  }, [target, map])
  return null
}

function FitBounds({ points, enabled }: { points: Array<[number, number]>; enabled: boolean }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (!enabled || done.current || points.length === 0) return
    done.current = true
    if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 })
  }, [points, enabled, map])
  return null
}

export default function LeafletMap({
  center,
  store,
  deliveries,
  manual,
  draft,
  flyTarget,
  showMoney,
  canEdit,
  onMapClick,
  onDeliveryMoved,
  onOpenDelivery,
  onRemoveManual,
  fitOnLoad,
}: {
  center: [number, number]
  store: { lat: number; lng: number; name: string; address: string | null } | null
  deliveries: DeliveryRow[]
  manual: ManualAddress[]
  draft: { lat: number; lng: number } | null
  flyTarget: { lat: number; lng: number; zoom?: number; key: number } | null
  showMoney: boolean
  canEdit: boolean
  onMapClick?: (lat: number, lng: number) => void
  onDeliveryMoved: (d: DeliveryRow, lat: number, lng: number) => void
  onOpenDelivery: (id: string) => void
  onRemoveManual: (m: ManualAddress) => void
  fitOnLoad: boolean
}) {
  const points = useMemo(
    () => [
      ...deliveries.filter((d) => d.latitude != null).map((d) => [d.latitude!, d.longitude!] as [number, number]),
      ...(store ? [[store.lat, store.lng] as [number, number]] : []),
    ],
    [deliveries, store],
  )

  return (
    <MapContainer center={center} zoom={store ? 14 : 5} className="h-full w-full" zoomControl scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <ClickHandler onClick={onMapClick} />
      <FlyTo target={flyTarget} />
      <FitBounds points={points} enabled={fitOnLoad} />

      {store && (
        <Marker position={[store.lat, store.lng]} icon={storeIcon} zIndexOffset={1000}>
          <Popup>
            <strong className="text-[#d4af37]">{store.name}</strong>
            {store.address && <div className="text-xs">{store.address}</div>}
          </Popup>
        </Marker>
      )}

      {deliveries
        .filter((d) => d.latitude != null && d.longitude != null)
        .map((d) => (
          <Marker
            key={d.id}
            position={[d.latitude!, d.longitude!]}
            icon={deliveryIcon(d)}
            draggable={canEdit}
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng()
                onDeliveryMoved(d, ll.lat, ll.lng)
              },
            }}
          >
            <Popup>
              <div className="min-w-52 space-y-0.5 text-xs">
                <div className="text-sm font-bold text-[#e8c98e]">Comanda {d.comanda_number}</div>
                <div>
                  {d.address}
                  {d.address_number ? `, ${d.address_number}` : ""}
                  {d.complement ? ` — ${d.complement}` : ""}
                </div>
                <div>Bairro: {d.neighborhood ?? "—"}</div>
                <div>Cidade: {[d.city, d.state].filter(Boolean).join(" / ") || "—"}</div>
                <div>Motoboy: {d.motoboy_name ?? "Sem motoboy"}</div>
                <div>Área: {d.area_name ?? "Sem área"}</div>
                <div>
                  Status: {DELIVERY_STATUS[d.status].label}
                  {d.has_divergence ? " · com divergência" : ""}
                </div>
                {showMoney && (
                  <div>
                    Cobrado {formatBRL(d.charge_total)} · Repasse {formatBRL(d.repass_net)}
                  </div>
                )}
                <div>
                  {formatDateBR(d.delivery_date)} às {formatTime(d.delivery_time)}
                </div>
                {canEdit && <div className="text-muted-foreground">Arraste o marcador para corrigir a posição.</div>}
                <button className="mt-1 text-[#d4af37] underline" onClick={() => onOpenDelivery(d.id)}>
                  Abrir detalhes
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

      {manual.map((m) => (
        <Marker key={m.id} position={[m.latitude, m.longitude]} icon={manualIcon}>
          <Popup>
            <div className="space-y-0.5 text-xs">
              <div className="text-sm font-bold text-[#e8c98e]">{m.label || "Endereço manual"}</div>
              <div>
                {m.address}
                {m.address_number ? `, ${m.address_number}` : ""}
              </div>
              <div>{[m.neighborhood, m.city, m.state].filter(Boolean).join(" · ")}</div>
              {m.delivery_id && (
                <button className="text-[#d4af37] underline" onClick={() => onOpenDelivery(m.delivery_id!)}>
                  Ver comanda vinculada
                </button>
              )}
              {canEdit && (
                <button className="ml-2 text-red-300 underline" onClick={() => onRemoveManual(m)}>
                  Remover
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {draft && <Marker position={[draft.lat, draft.lng]} icon={draftIcon} />}
    </MapContainer>
  )
}
