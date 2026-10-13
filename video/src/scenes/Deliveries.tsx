import { AlertTriangle, Loader2, MapPin, Plus, RefreshCw, Save, Search } from "lucide-react"
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { DeliveryStatusBadge, PaymentStatusBadge } from "@/components/ossala/status-badge"
import { formatDateBR, formatTime } from "@/lib/dates"
import type { DeliveryRow, DeliveryStatus } from "@/lib/domain"
import { formatBRL } from "@/lib/money"
import { cn } from "@/lib/utils"
import { AREAS, DELIVERIES, DEMO_DATE, MOTOBOYS, NEW_DELIVERY, newDeliveryRow } from "../data/demo"
import { caretVisible, progress, rise, tween, typed, type CursorKey } from "../lib/anim"
import { AnchorProbe } from "../ui/AnchorProbe"
import { AppShell } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Camera, Window } from "../ui/Camera"
import { Cursor } from "../ui/Cursor"
import { DialogFrame, FakeInput, FakeSelect, flash, OptionsMenu, Toast } from "../ui/Overlays"
import { SceneLabel } from "../ui/SceneLabel"

const noop = () => {}

/** Posições medidas com a AnchorProbe (centro dos elementos, coordenadas da janela). */
const A = {
  novaEntrega: [1476, 123],
  search: [700, 413],
  buscar: [1055, 411],
  result: [760, 419],
  motoboy: [961, 691],
  motoboyOpt: [961, 799],
  salvar: [1070, 767],
  firstRow: [929, 382],
}

// Linha do tempo da cena (frames locais).
const T = {
  cursorIn: 24,
  clickNova: 58,
  dialog: 62,
  typeComanda: 84,
  typeSearch: 104,
  clickBuscar: 150,
  results: 160,
  clickResult: 184,
  clickMotoboy: 214,
  clickOption: 240,
  clickSalvar: 268,
  close: 272,
  rowIn: 278,
  andamento: 318,
  concluida: 352,
}

const OPTIONS = ["Sem motoboy", ...MOTOBOYS.map((m) => m.name)]
const OPTION_INDEX = OPTIONS.indexOf("Rafael Souza")

/** Linha da tabela — mesma marcação de entregas-client.tsx (versão computador). */
function Row({ d, highlight = 0, style }: { d: DeliveryRow; highlight?: number; style?: React.CSSProperties }) {
  return (
    <TableRow style={{ ...style, backgroundColor: highlight ? `rgba(212,175,55,${0.14 * highlight})` : undefined }}>
      <TableCell className="font-semibold">
        <span className="flex items-center gap-1.5">
          {d.comanda_number}
          {d.has_divergence && <AlertTriangle className="size-3.5 text-red-300" aria-label="Divergência" />}
        </span>
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap">
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
        <span className="flex items-center gap-1.5 text-sm">
          <span className="size-2 rounded-full" style={{ background: d.area_color ?? "#666" }} />
          {d.area_name}
        </span>
      </TableCell>
      <TableCell className="text-sm">{d.motoboy_name ?? <Badge tone="warning">Sem motoboy</Badge>}</TableCell>
      <TableCell>
        <DeliveryStatusBadge status={d.status} />
      </TableCell>
      <TableCell>
        <PaymentStatusBadge status={d.payment_status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatBRL(d.charge_total)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatBRL(d.repass_net)}</TableCell>
    </TableRow>
  )
}

function DeliveriesPage({ frame }: { frame: number }) {
  const status: DeliveryStatus = frame >= T.concluida ? "entregue" : frame >= T.andamento ? "em_andamento" : "pendente"
  const statusFlash = Math.max(flash(frame, T.andamento, 30), flash(frame, T.concluida, 30))
  const rowIn = progress(frame, T.rowIn, 22)
  const rows = DELIVERIES.slice(0, 9)
  return (
    <>
      <PageHeader
        title="Entregas"
        description="Cadastro, consulta, atribuição e acompanhamento das comandas."
        actions={
          <>
            <Button variant="outline">
              <RefreshCw /> Atualizar
            </Button>
            <Button data-anchor="novaEntrega" className={cn(frame >= T.clickNova - 10 && frame < T.dialog && "bg-primary/90")}>
              <Plus /> Nova entrega
            </Button>
          </>
        }
      />
      <FiltersBar value={{ from: DEMO_DATE, to: DEMO_DATE, search: "" }} onChange={noop} motoboys={MOTOBOYS} areas={AREAS} />
      <div className="rounded-xl border border-border bg-card" data-anchor="table">
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
              <TableHead className="text-right">Cobrado</TableHead>
              <TableHead className="text-right">Repasse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {frame >= T.rowIn && (
              <Row
                d={newDeliveryRow(status)}
                highlight={Math.max(flash(frame, T.rowIn + 4, 60) * 0.9, statusFlash)}
                style={{ opacity: rowIn, transform: `translateY(${(1 - rowIn) * -12}px)` }}
              />
            )}
            {rows.map((d, i) => (
              <Row key={d.id} d={d} style={rise(frame, 4 + i * 3, 10, 14)} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{frame >= T.rowIn ? 12 : 11} registro(s)</p>
    </>
  )
}

function NewDeliveryDialog({ frame }: { frame: number }) {
  const n = NEW_DELIVERY
  const filled = frame >= T.clickResult
  const fill = flash(frame, T.clickResult, 36)
  const comanda = typed(n.comanda, frame, T.typeComanda, 10)
  const query = typed(`${n.address}, ${n.number}`, frame, T.typeSearch, 16)
  const searching = frame >= T.clickBuscar && frame < T.results
  const showResults = frame >= T.results && frame < T.clickResult
  const selectedMotoboy = frame >= T.clickOption
  const area = AREAS.find((a) => a.id === n.areaId)!
  const focus = (start: number, end: number) => frame >= start && frame < end
  const hl = (on: boolean) => (on ? { boxShadow: `0 0 0 3px rgba(212,175,55,${0.35 * fill})` } : undefined)
  return (
    <DialogFrame frame={frame} openAt={T.dialog} closeAt={T.close} className="max-w-2xl">
      <div data-anchor="dialog" className="flex flex-col gap-1.5 pr-6 text-left">
        <div className="text-lg leading-none font-semibold text-[#e8c98e]">Nova entrega</div>
        <div className="text-sm text-muted-foreground">
          Os valores de cobrança e repasse são definidos pela área vigente no momento do cadastro.
        </div>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2 grid gap-1.5">
            <Label>Nº da comanda *</Label>
            <FakeInput value={comanda} focused={focus(T.typeComanda - 4, T.typeSearch - 4)} caret={caretVisible(frame)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Data *</Label>
            <FakeInput value={formatDateBR(DEMO_DATE)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Horário *</Label>
            <FakeInput value={n.time} />
          </div>
        </div>

        <div className="relative grid gap-2 rounded-lg border border-border p-3">
          <Label className="text-[#e8c98e]">Localizar endereço</Label>
          <div className="flex gap-2">
            <div className="flex-1" data-anchor="search">
              <FakeInput
                value={filled ? `${n.address}, ${n.number}, ${n.neighborhood}` : query}
                placeholder="Rua, número, bairro, cidade"
                focused={focus(T.typeSearch - 4, T.clickResult)}
                caret={caretVisible(frame)}
              />
            </div>
            <Button type="button" variant="secondary" data-anchor="buscar">
              {searching ? <Loader2 className="animate-spin" style={{ transform: `rotate(${frame * 18}deg)` }} /> : <Search />}
              Buscar
            </Button>
          </div>
          {showResults && (
            <ul className="overflow-hidden rounded-md border border-border" style={{ opacity: progress(frame, T.results, 8) }}>
              {[
                `${n.number}, ${n.address}, ${n.neighborhood}, ${n.city}, ${n.state}, Brasil`,
                `${n.address}, Vila Nova, ${n.city}, ${n.state}, Brasil`,
              ].map((label, i) => (
                <li key={label} data-anchor={i === 0 ? "result" : undefined}>
                  <span
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                      i === 0 && frame >= T.clickResult - 14 && "bg-muted",
                    )}
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#d4af37]" />
                    <span>{label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {filled ? (
            <>
              <p className="text-xs text-amber-200">Endereço selecionado. Confira os campos preenchidos.</p>
              <p className="flex items-center gap-1 text-xs text-emerald-300">
                <MapPin className="size-3" /> Posição: -23.57412, -46.66218 (nominatim)
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sem posição no mapa. Busque o endereço acima ou ajuste depois na tela Mapa.</p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-3 grid gap-1.5">
            <Label>Endereço *</Label>
            <div style={hl(filled)} className="rounded-md">
              <FakeInput value={filled ? n.address : ""} />
            </div>
          </div>
          <div className="col-span-1 grid gap-1.5">
            <Label>Número</Label>
            <div style={hl(filled)} className="rounded-md">
              <FakeInput value={filled ? n.number : ""} />
            </div>
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label>Complemento</Label>
            <FakeInput value="" />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label>Bairro</Label>
            <div style={hl(filled)} className="rounded-md">
              <FakeInput value={filled ? n.neighborhood : ""} />
            </div>
          </div>
          <div className="col-span-2 -mt-2 text-xs text-muted-foreground">
            {filled && <span>Bairro cadastrado → {area.name}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Área de entrega</Label>
            <FakeSelect value={filled ? "Automática (pelo bairro)" : "Selecione"} />
            {filled && (
              <span className="text-xs text-muted-foreground">
                Valores vigentes: cobrança {formatBRL(area.charge_amount)} · repasse {formatBRL(area.repass_amount)}
              </span>
            )}
          </div>
          <div className="relative grid gap-1.5 self-start">
            <Label>Motoboy responsável</Label>
            <div className="relative" data-anchor="motoboy">
              <FakeSelect value={selectedMotoboy ? "Rafael Souza" : "Sem motoboy"} focused={focus(T.clickMotoboy, T.clickOption + 10)} />
              <OptionsMenu
                frame={frame}
                openAt={T.clickMotoboy + 2}
                closeAt={T.clickOption + 2}
                options={OPTIONS}
                highlighted={frame >= T.clickOption - 12 ? OPTION_INDEX : Math.min(OPTION_INDEX, Math.max(0, Math.floor((frame - T.clickMotoboy - 6) / 4)))}
                width={316}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit" data-anchor="salvar">
            {frame >= T.clickSalvar ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </div>
      </div>
    </DialogFrame>
  )
}

/** Cena 3 — Gestão de entregas: cadastro de comanda, atribuição de motoboy e acompanhamento do status. */
export function Deliveries({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const k = [0, 40, T.dialog, T.dialog + 26, T.clickResult, T.clickMotoboy, T.clickSalvar, T.rowIn + 16, duration]
  const cam = {
    fx: tween(frame, k, [820, 860, 1200, 800, 800, 820, 820, 860, 900]),
    fy: tween(frame, k, [440, 400, 200, 400, 470, 560, 560, 420, 430]),
    zoom: tween(frame, k, [0.98, 1.0, 1.15, 1.32, 1.36, 1.4, 1.3, 1.42, 1.38]),
    rotY: tween(frame, [0, 40, duration - 40, duration], [6, 0, 0, -3]),
    rotX: tween(frame, [0, 40], [4, 0]),
  }
  const pointer: CursorKey[] = [
    { f: T.cursorIn, x: 1180, y: 520 },
    { f: T.clickNova - 4, x: A.novaEntrega[0], y: A.novaEntrega[1] },
    { f: T.clickNova, x: A.novaEntrega[0], y: A.novaEntrega[1], click: true },
    { f: T.typeSearch - 10, x: A.search[0], y: A.search[1] + 4 },
    { f: T.clickBuscar - 6, x: A.buscar[0], y: A.buscar[1] },
    { f: T.clickBuscar, x: A.buscar[0], y: A.buscar[1], click: true },
    { f: T.clickResult - 8, x: A.result[0], y: A.result[1] },
    { f: T.clickResult, x: A.result[0], y: A.result[1], click: true },
    { f: T.clickMotoboy - 6, x: A.motoboy[0], y: A.motoboy[1] },
    { f: T.clickMotoboy, x: A.motoboy[0], y: A.motoboy[1], click: true },
    { f: T.clickOption - 6, x: A.motoboyOpt[0], y: A.motoboyOpt[1] },
    { f: T.clickOption, x: A.motoboyOpt[0], y: A.motoboyOpt[1], click: true },
    { f: T.clickSalvar - 8, x: A.salvar[0], y: A.salvar[1] },
    { f: T.clickSalvar, x: A.salvar[0], y: A.salvar[1], click: true },
    { f: T.rowIn + 30, x: A.firstRow[0] + 340, y: A.firstRow[1] + 60 },
  ]
  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 390} />
      <Camera state={cam}>
        <Window>
          <AppShell active="/app/entregas">
            <DeliveriesPage frame={frame} />
          </AppShell>
          <NewDeliveryDialog frame={frame} />
          <Toast frame={frame} at={T.close + 2} text="Entrega cadastrada." duration={60} />
          <Cursor frame={frame} keys={pointer} scale={0.9} visibleFrom={T.cursorIn} hideAfter={T.rowIn + 40} />
          <AnchorProbe tag={`deliveries@${frame}`} />
        </Window>
      </Camera>
      <SceneLabel
        frame={frame}
        duration={duration}
        index="02 — GESTÃO DE ENTREGAS"
        title="Da comanda ao motoboy em segundos"
        subtitle="Endereço localizado, área e valores automáticos, atribuição e status em tempo real."
        from={300}
      />
      {/* Indicação discreta da atualização em tempo real do status. */}
      <StatusTicker frame={frame} />
    </AbsoluteFill>
  )
}

function StatusTicker({ frame }: { frame: number }) {
  const steps = [
    { at: T.rowIn, label: "Pendente", color: "#fcd34d" },
    { at: T.andamento, label: "Em andamento", color: "#7dd3fc" },
    { at: T.concluida, label: "Concluída", color: "#6ee7b7" },
  ]
  const p = progress(frame, T.rowIn + 6, 16) * (1 - progress(frame, 380, 10))
  if (p <= 0) return null
  return (
    <div
      style={{
        position: "absolute",
        right: 72,
        bottom: 108,
        opacity: p,
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "12px 18px",
        borderRadius: 999,
        background: "rgba(16,11,13,0.82)",
        border: "1px solid rgba(212,175,55,0.25)",
        fontSize: 18,
        color: "#b3a79c",
      }}
    >
      {steps.map((s, i) => {
        const on = frame >= s.at
        const pulse = interpolate(frame - s.at, [0, 8, 24], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        return (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {i > 0 && <span style={{ width: 28, height: 1, background: on ? s.color : "rgba(179,167,156,0.3)" }} />}
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: on ? s.color : "rgba(179,167,156,0.3)",
                boxShadow: on ? `0 0 ${6 + pulse * 14}px ${s.color}` : undefined,
              }}
            />
            <span style={{ color: on ? "#f3eee6" : undefined, fontWeight: on ? 600 : 400 }}>{s.label}</span>
          </span>
        )
      })}
    </div>
  )
}
