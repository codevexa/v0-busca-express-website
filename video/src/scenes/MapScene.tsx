import { Crosshair, LocateFixed, RefreshCw, Store } from "lucide-react"
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { formatDateBR, formatTime } from "@/lib/dates"
import { DELIVERY_STATUS, type DeliveryRow } from "@/lib/domain"
import { formatBRL } from "@/lib/money"
import { AREAS, DELIVERIES, DEMO_DATE, MAP_POS, MOTOBOYS, newDeliveryRow, STORE_POS } from "../data/demo"
import { progress, tween, type CursorKey } from "../lib/anim"
import { AnchorProbe } from "../ui/AnchorProbe"
import { AppShell } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Camera, Window } from "../ui/Camera"
import { Cursor } from "../ui/Cursor"
import { DeliveryPin, MapCanvas, MapPopup, StorePin } from "../ui/MapCanvas"
import { OptionsMenu } from "../ui/Overlays"
import { SceneLabel } from "../ui/SceneLabel"

const noop = () => {}

// Mesmas categorias e cores de mapa-client.tsx / leaflet-map.tsx.
const CATEGORIES = [
  { key: "pendente", label: "Pendentes", color: "#f59e0b" },
  { key: "em_andamento", label: "Em andamento", color: "#38bdf8" },
  { key: "entregue", label: "Concluídas", color: "#22c55e" },
  { key: "divergencia", label: "Com divergência", color: "#ef4444" },
  { key: "manual", label: "Endereços manuais", color: "#e8c98e" },
  { key: "loja", label: "Loja", color: "#800020" },
] as const
const STATUS_COLOR: Record<string, string> = { pendente: "#f59e0b", em_andamento: "#38bdf8", entregue: "#22c55e", cancelada: "#6b7280" }

/** Área do mapa na janela (medida com a AnchorProbe). */
const MAP = { x: 313, y: 315, w: 896, h: 600 }
const AREA_SELECT = [929, 266]
const ZONA_SUL = "a3"

const T = { cursorIn: 84, clickPin: 118, popupOut: 184, clickArea: 206, pickArea: 230 }

const ALL: DeliveryRow[] = [newDeliveryRow("entregue"), ...DELIVERIES]
const FOCUS_ID = "d4835"

function pinXY(id: string) {
  const [px, py] = MAP_POS[id]
  return [px * MAP.w, py * MAP.h] as const
}

export function MapPage({ frame }: { frame: number }) {
  const filtered = frame >= T.pickArea
  const visibleRows = filtered ? ALL.filter((d) => d.area_id === ZONA_SUL) : ALL
  const focus = ALL.find((d) => d.id === FOCUS_ID)!
  const [fx, fy] = pinXY(FOCUS_ID)
  const popup = progress(frame, T.clickPin + 4, 10) * (1 - progress(frame, T.popupOut, 8))
  const [sx, sy] = [STORE_POS[0] * MAP.w, STORE_POS[1] * MAP.h]
  return (
    <>
      <PageHeader
        title="Mapa"
        description="Loja, entregas e endereços manuais sobre o OpenStreetMap."
        actions={
          <>
            <Button variant="outline">
              <RefreshCw /> Atualizar
            </Button>
            <Button variant="outline">
              <LocateFixed /> Centralizar na loja
            </Button>
          </>
        }
      />
      <FiltersBar
          value={{ from: DEMO_DATE, to: DEMO_DATE, area: filtered ? ZONA_SUL : null, search: "" }}
          onChange={noop}
          motoboys={MOTOBOYS}
          areas={AREAS}
          show={{ payment: false }}
        />

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="relative overflow-hidden rounded-xl border border-border" style={{ height: MAP.h }} data-anchor="map">
          <MapCanvas width={MAP.w} height={MAP.h}>
            <StorePin x={sx} y={sy} pulse={((frame + 20) % 45) / 45} />
            {ALL.map((d, i) => {
              const [x, y] = pinXY(d.id)
              const drop = progress(frame, 22 + i * 4, 16, Easing.out(Easing.back(1.8)))
              const out = d.area_id !== ZONA_SUL ? progress(frame, T.pickArea + 2, 10) : 0
              const ringT = d.area_id === ZONA_SUL && frame >= T.pickArea + 8 ? ((frame - T.pickArea - 8) % 36) / 36 : 0
              const color = d.has_divergence ? "#ef4444" : (STATUS_COLOR[d.status] ?? "#d4af37")
              return (
                <DeliveryPin
                  key={d.id}
                  x={x}
                  y={y}
                  color={color}
                  areaColor={d.area_color ?? "#d4af37"}
                  drop={drop * (1 - out)}
                  ring={ringT}
                />
              )
            })}
            <MapPopup x={fx} y={fy - 24} p={popup}>
              <div className="min-w-52 space-y-0.5 text-xs">
                <div className="text-sm font-bold text-[#e8c98e]">Comanda {focus.comanda_number}</div>
                <div>
                  {focus.address}, {focus.address_number}
                </div>
                <div>Bairro: {focus.neighborhood}</div>
                <div>Cidade: {[focus.city, focus.state].join(" / ")}</div>
                <div>Motoboy: {focus.motoboy_name}</div>
                <div>Área: {focus.area_name}</div>
                <div>Status: {DELIVERY_STATUS[focus.status].label}</div>
                <div>
                  Cobrado {formatBRL(focus.charge_total)} · Repasse {formatBRL(focus.repass_net)}
                </div>
                <div>
                  {formatDateBR(focus.delivery_date)} às {formatTime(focus.delivery_time)}
                </div>
                <div className="text-muted-foreground">Arraste o marcador para corrigir a posição.</div>
                <span className="mt-1 inline-block text-[#d4af37] underline">Abrir detalhes</span>
              </div>
            </MapPopup>
          </MapCanvas>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold text-[#e8c98e]">Exibir</h2>
            <ul className="grid grid-cols-1 gap-2 text-sm">
              {CATEGORIES.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <Checkbox checked />
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  <Label className="font-normal">{c.label}</Label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{visibleRows.length} entrega(s) no mapa · 0 sem posição</p>
          </section>
          <Button variant="ghost" size="sm" className="w-full">
            <Store /> Reposicionar a loja
          </Button>
          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
            <h2 className="text-sm font-semibold text-[#e8c98e]">Endereço manual</h2>
            <Button variant="outline" size="sm" className="w-full">
              <Crosshair /> Marcar posição no mapa
            </Button>
          </section>
        </aside>
      </div>
    </>
  )
}

/** Cena 4 — Mapa interativo: loja, pontos de entrega por status e separação por áreas. */
export function MapScene({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const [px, py] = pinXY(FOCUS_ID)
  const pin = { x: MAP.x + px, y: MAP.y + py - 12 }
  const k = [0, 30, 80, T.clickPin + 10, T.popupOut, T.clickArea, T.pickArea + 16, duration]
  const cam = {
    fx: tween(frame, k, [800, 800, 760, MAP.x + px + 60, 820, 800, 640, 600]),
    fy: tween(frame, k, [520, 480, 560, MAP.y + py - 90, 420, 420, 600, 620]),
    zoom: tween(frame, k, [0.98, 1.0, 1.25, 1.75, 1.3, 1.3, 1.5, 1.62]),
    rotX: tween(frame, [0, 30], [8, 0]),
    rotY: tween(frame, [0, 30, duration - 30, duration], [-5, 0, 0, 3]),
  }
  const pointer: CursorKey[] = [
    { f: T.cursorIn, x: pin.x + 160, y: pin.y + 120 },
    { f: T.clickPin - 6, x: pin.x, y: pin.y },
    { f: T.clickPin, x: pin.x, y: pin.y, click: true },
    { f: T.popupOut - 10, x: pin.x + 30, y: pin.y + 40 },
    { f: T.clickArea - 6, x: AREA_SELECT[0], y: AREA_SELECT[1] },
    { f: T.clickArea, x: AREA_SELECT[0], y: AREA_SELECT[1], click: true },
    { f: T.pickArea - 6, x: AREA_SELECT[0], y: AREA_SELECT[1] + 44 + 4 + 3 * 32 + 16 - 20 },
    { f: T.pickArea, x: AREA_SELECT[0], y: AREA_SELECT[1] + 44 + 4 + 3 * 32 + 16 - 20, click: true },
    { f: T.pickArea + 40, x: AREA_SELECT[0] - 200, y: AREA_SELECT[1] + 360 },
  ]
  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 780} />
      <Camera state={cam}>
        <Window>
          <AppShell active="/app/mapa">
            <MapPage frame={frame} />
          </AppShell>
          <div className="absolute z-40" style={{ left: AREA_SELECT[0] - 117, top: AREA_SELECT[1] - 20 }}>
            <OptionsMenu
              frame={frame}
              openAt={T.clickArea + 2}
              closeAt={T.pickArea + 2}
              options={["Todas as áreas", ...AREAS.map((a) => a.name)]}
              highlighted={frame >= T.pickArea - 12 ? 3 : 0}
              width={235}
            />
          </div>
          <Cursor frame={frame} keys={pointer} scale={0.8} visibleFrom={T.cursorIn} hideAfter={T.pickArea + 44} />
          <AnchorProbe tag={`map@${frame}`} />
        </Window>
      </Camera>
      <SceneLabel
        frame={frame}
        duration={duration}
        index="03 — MAPA INTERATIVO"
        title="Cada entrega no seu lugar"
        subtitle="Pontos por status, contorno na cor da área e filtro por área de cobrança."
        from={36}
      />
    </AbsoluteFill>
  )
}
