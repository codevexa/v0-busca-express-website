import { Camera as CameraIcon, Check, ImageIcon, Loader2, RefreshCw, RotateCcw, Save, ScanSearch, Search, Send, Upload, X } from "lucide-react"
import { AbsoluteFill, useCurrentFrame } from "remotion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ComparisonTable } from "@/components/conference/comparison-table"
import { PageHeader } from "@/components/ossala/page-header"
import { ConferenceStatusBadge } from "@/components/ossala/status-badge"
import { formatDateBR } from "@/lib/dates"
import type { ConferenceStatus } from "@/lib/domain"
import { compareDelivery } from "@/lib/ocr/compare"
import type { OcrFields } from "@/lib/ocr/types"
import { cn } from "@/lib/utils"
import { DEMO_DATE, NEW_DELIVERY } from "../data/demo"
import { caretVisible, progress, rise, tween, typed, type CursorKey } from "../lib/anim"
import { AnchorProbe } from "../ui/AnchorProbe"
import { AppShell } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Camera, Window } from "../ui/Camera"
import { Cursor } from "../ui/Cursor"
import { DialogFrame, FakeInput, FakeSelect, Toast } from "../ui/Overlays"
import { Receipt } from "../ui/Receipt"
import { SceneLabel } from "../ui/SceneLabel"

const n = NEW_DELIVERY
/** Rolagem da página de fotos para mostrar o resultado da leitura. */
const SCROLL = 280
const DIALOG_SCROLL = 150
/** Cadastro da comanda 4835 (cena de entregas). */
const REGISTERED = {
  comanda_number: n.comanda,
  address: n.address,
  address_number: n.number,
  complement: null,
  neighborhood: n.neighborhood,
  city: n.city,
  state: n.state,
}
/** Campos lidos pelo OCR na foto (número do imóvel borrado → baixa confiança). */
const OCR: Partial<OcrFields> = {
  comanda_number: { value: n.comanda, confidence: 0.98 },
  address: { value: "R. das Palmeiras", confidence: 0.93 },
  address_number: { value: "128", confidence: 0.46 },
  complement: { value: "Ap 32", confidence: 0.88 },
  neighborhood: { value: n.neighborhood, confidence: 0.91 },
  city: { value: n.city, confidence: 0.95 },
  state: { value: n.state, confidence: 0.97 },
}

const T = {
  cursorIn: 16,
  clickComanda: 28,
  typeComanda: 32,
  clickFoto: 66,
  photo: 80,
  clickEnviar: 100,
  result: 150,
  clickAbrir: 188,
  swap: 192,
  dialog: 198,
  clickNumber: 236,
  typeNumber: 244,
  clickAprovar: 280,
  alert: 284,
  clickConfirm: 306,
  closeAll: 310,
}

/** Posições medidas com a AnchorProbe. */
const A = {
  comanda: [625, 208],
  fotografar: [476, 278],
  enviar: [573, 336],
  abrir: [412, 738],
  number: [1007, 430],
  aprovar: [628, 731],
  confirm: [960, 516],
}

function PhotoPage({ frame }: { frame: number }) {
  const comanda = typed(n.comanda, frame, T.typeComanda, 10)
  const preparing = frame >= T.clickFoto && frame < T.photo
  const hasPhoto = frame >= T.photo
  const sending = frame >= T.clickEnviar && frame < T.result
  const scan = sending ? progress(frame, T.clickEnviar + 4, T.result - T.clickEnviar - 10) : -1
  const boxes = frame >= T.clickEnviar ? Math.floor(progress(frame, T.clickEnviar + 8, 38) * 6) : 0
  const rows = compareDelivery(REGISTERED, OCR)
  const snap = frame >= T.photo ? Math.max(0, 1 - (frame - T.photo) / 8) : 0
  return (
    <>
      <PageHeader title="Fotos de comandas" description="Fotografe ou selecione a comanda para conferência automática por OCR." />
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid gap-1.5" data-anchor="comanda">
              <Label>Nº da comanda (opcional, ajuda a localizar)</Label>
              <FakeInput value={comanda} focused={frame >= T.clickComanda && frame < T.clickFoto} caret={caretVisible(frame)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" className="h-14 text-base" data-anchor="fotografar">
                <CameraIcon /> Fotografar
              </Button>
              <Button type="button" variant="outline" className="h-14 text-base">
                <ImageIcon /> Galeria
              </Button>
            </div>
            {hasPhoto && (
              <div className="flex gap-2" style={rise(frame, T.photo, 10)}>
                <Button className="bg-ossala-gradient flex-1" data-anchor="enviar">
                  {sending ? <Loader2 className="animate-spin" style={{ transform: `rotate(${frame * 18}deg)` }} /> : <Send />}
                  {sending ? "Enviando e lendo…" : "Enviar"}
                </Button>
                <Button variant="outline">
                  <RotateCcw /> Repetir
                </Button>
              </div>
            )}
          </div>
          <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background/50 py-3">
            {preparing ? (
              <Loader2 className="size-6 text-[#d4af37]" style={{ transform: `rotate(${frame * 18}deg)` }} />
            ) : hasPhoto ? (
              <div style={{ opacity: progress(frame, T.photo, 8), transform: `scale(${1.04 - 0.04 * progress(frame, T.photo, 14)})` }}>
                <Receipt width={240} scan={scan} boxes={boxes} />
              </div>
            ) : (
              <span className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <Upload className="size-6 text-[#b48a4a]" />
                A pré-visualização aparece aqui antes do envio.
              </span>
            )}
            {snap > 0 && <div className="absolute inset-0 bg-white" style={{ opacity: snap * 0.8 }} />}
          </div>
        </div>

        {frame >= T.result && (
          <div className="mt-4 space-y-3 border-t border-border pt-4" style={rise(frame, T.result, 14)}>
            <p className="text-sm">
              Entrega localizada: <strong>comanda {n.comanda}</strong>. A aprovação é sempre manual.
            </p>
            <ComparisonTable rows={rows} />
            <Button variant="secondary" data-anchor="abrir">
              <ScanSearch /> Abrir conferência
            </Button>
          </div>
        )}
      </section>
    </>
  )
}

const LIST: Array<{ at: string; comanda: string; motoboy: string; status: ConferenceStatus; div: number; conf: number }> = [
  { at: "19:59", comanda: n.comanda, motoboy: "Rafael Souza", status: "aguardando_revisao", div: 1, conf: 87 },
  { at: "19:44", comanda: "4831", motoboy: "Rafael Souza", status: "aguardando_revisao", div: 0, conf: 93 },
  { at: "19:21", comanda: "4830", motoboy: "Marcos Pereira", status: "aguardando_revisao", div: 2, conf: 71 },
]

export function ConferencePage({ frame }: { frame: number }) {
  const approved = frame >= T.closeAll
  return (
    <>
      <PageHeader
        title="Conferência"
        description="Compare os dados cadastrados com os identificados na foto. A aprovação é sempre manual."
        actions={
          <>
            <Button variant="outline">
              <RefreshCw /> Atualizar
            </Button>
            <Button>
              <CameraIcon /> Nova foto
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-5 gap-2 rounded-xl border border-border bg-card p-3">
        <FakeSelect value="Pendentes de revisão" />
        <FakeInput value={formatDateBR(DEMO_DATE)} />
        <FakeInput value={formatDateBR(DEMO_DATE)} />
        <FakeSelect value="Todos os motoboys" />
        <FakeInput value="" placeholder="Comanda" />
      </div>
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Enviada em</TableHead>
              <TableHead>Comanda</TableHead>
              <TableHead>Motoboy</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Divergências</TableHead>
              <TableHead>Confiança</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LIST.map((r, i) => (
              <TableRow key={r.comanda}>
                <TableCell className="text-xs whitespace-nowrap">
                  {formatDateBR(DEMO_DATE)} {r.at}
                </TableCell>
                <TableCell className="font-medium">{r.comanda}</TableCell>
                <TableCell className="text-sm">{r.motoboy}</TableCell>
                <TableCell>
                  <ConferenceStatusBadge status={i === 0 && approved ? "aprovada" : r.status} />
                </TableCell>
                <TableCell>{r.div > 0 && !(i === 0 && approved) ? <Badge tone="danger">{r.div}</Badge> : "—"}</TableCell>
                <TableCell className="text-xs">{r.conf}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** Diálogo de conferência — mesma estrutura de ConferenceDialog (conferencia-client.tsx). */
function ConferenceDialog({ frame }: { frame: number }) {
  const typing = typed("120", frame, T.typeNumber, 12)
  const numberValue = frame >= T.typeNumber ? typing : frame >= T.clickNumber + 4 ? "" : "128"
  // Recalculada a cada tecla com a função real do app; o valor digitado passa a ter confiança 1.
  const rows = compareDelivery(REGISTERED, {
    ...OCR,
    address_number: numberValue === "128" ? OCR.address_number! : { value: numberValue || null, confidence: 1 },
  })
  const values: Record<string, string> = {
    comanda_number: n.comanda,
    address: "R. das Palmeiras",
    address_number: numberValue,
    complement: "Ap 32",
    neighborhood: n.neighborhood,
    city: n.city,
    state: n.state,
  }
  return (
    <DialogFrame frame={frame} openAt={T.dialog} closeAt={T.closeAll} className="max-w-5xl" scroll={DIALOG_SCROLL * progress(frame, T.typeNumber + 16, 14)}>
      <div className="flex flex-col gap-1.5 pr-6 text-left">
        <div className="flex flex-wrap items-center gap-2 text-lg leading-none font-semibold text-[#e8c98e]">
          Conferência <ConferenceStatusBadge status="aguardando_revisao" />
        </div>
        <div className="text-sm text-muted-foreground">Enviada em {formatDateBR(DEMO_DATE)} 19:59</div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "252px 1fr" }}>
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-border">
            <Receipt width={250} />
          </div>
          <p className="text-xs text-muted-foreground">Confiança média do OCR: 87%</p>
          <p className="text-xs text-[#d4af37]">▸ Texto lido</p>
          <Button variant="outline" className="w-full">
            <RotateCcw /> Tentar o OCR novamente
          </Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Entrega vinculada:{" "}
                <strong>
                  Comanda {n.comanda} · {formatDateBR(DEMO_DATE)}
                </strong>
              </span>
              <Button size="sm" variant="ghost">
                <X /> Desvincular
              </Button>
            </div>
            <div className="mt-2 flex gap-2">
              <FakeInput value="" placeholder="Buscar comanda para vincular" />
              <Button variant="secondary">
                <Search />
              </Button>
            </div>
          </div>
          <div className={cn("relative", frame >= T.clickNumber && frame < T.typeNumber + 30 && "[&_tr:nth-child(3)_input]:border-ring [&_tr:nth-child(3)_input]:ring-[3px] [&_tr:nth-child(3)_input]:ring-ring/40")}>
            <ComparisonTable rows={rows} editable values={values} onChange={() => {}} />
          </div>
          <p className="text-xs text-muted-foreground">Corrija os dados identificados quando o OCR ler errado. As correções ficam registradas.</p>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <div className="flex min-h-14 w-full rounded-md border border-input bg-input/20 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-anchor="aprovar">
              <Check /> Aprovar
            </Button>
            <Button variant="destructive">
              <X /> Rejeitar
            </Button>
            <Button variant="outline">
              <CameraIcon /> Solicitar nova foto
            </Button>
            <Button variant="ghost">
              <Save /> Salvar correções
            </Button>
          </div>
        </div>
      </div>
    </DialogFrame>
  )
}

/** Confirmação (ConfirmButton → AlertDialog) com as mesmas classes de alert-dialog.tsx. */
function ApproveAlert({ frame }: { frame: number }) {
  return (
    <DialogFrame frame={frame} openAt={T.alert} closeAt={T.closeAll} className="max-w-md" showClose={false}>
      <div className="flex flex-col gap-2 text-left">
        <div className="text-lg font-semibold text-[#e8c98e]">Aprovar conferência?</div>
        <div className="text-sm text-muted-foreground">Os dados conferem com o cadastro.</div>
      </div>
      <div className="flex flex-row justify-end gap-2">
        <Button variant="outline">Cancelar</Button>
        <Button data-anchor="confirm">Aprovar</Button>
      </div>
    </DialogFrame>
  )
}

/** Cena 5 — Conferência de comandas: foto, leitura por OCR, comparação, correção e aprovação manual. */
export function Conference({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const swap = progress(frame, T.swap, 10)
  const k = [0, 24, T.clickFoto, T.clickEnviar, T.result + 10, T.clickAbrir, T.dialog + 14, T.clickNumber, T.clickAprovar, T.alert + 10, T.closeAll + 10, duration]
  const cam = {
    fx: tween(frame, k, [760, 760, 760, 760, 760, 760, 800, 960, 860, 800, 900, 900]),
    fy: tween(frame, k, [380, 330, 300, 320, 520, 560, 480, 470, 560, 520, 270, 260]),
    zoom: tween(frame, k, [1.05, 1.42, 1.5, 1.5, 1.22, 1.3, 1.08, 1.38, 1.3, 1.3, 1.4, 1.46]),
    rotY: tween(frame, [0, 24, duration - 20, duration], [-6, 0, 0, 3]),
  }
  const pointer: CursorKey[] = [
    { f: T.cursorIn, x: 700, y: 360 },
    { f: T.clickComanda - 4, x: A.comanda[0], y: A.comanda[1] },
    { f: T.clickComanda, x: A.comanda[0], y: A.comanda[1], click: true },
    { f: T.clickFoto - 8, x: A.fotografar[0], y: A.fotografar[1] },
    { f: T.clickFoto, x: A.fotografar[0], y: A.fotografar[1], click: true },
    { f: T.clickEnviar - 8, x: A.enviar[0], y: A.enviar[1] },
    { f: T.clickEnviar, x: A.enviar[0], y: A.enviar[1], click: true },
    { f: T.result + 6, x: A.enviar[0] + 160, y: A.enviar[1] + 120 },
    { f: T.clickAbrir - 8, x: A.abrir[0], y: A.abrir[1] },
    { f: T.clickAbrir, x: A.abrir[0], y: A.abrir[1], click: true },
    { f: T.clickNumber - 10, x: A.number[0], y: A.number[1] },
    { f: T.clickNumber, x: A.number[0], y: A.number[1], click: true },
    { f: T.clickAprovar - 10, x: A.aprovar[0], y: A.aprovar[1] },
    { f: T.clickAprovar, x: A.aprovar[0], y: A.aprovar[1], click: true },
    { f: T.clickConfirm - 8, x: A.confirm[0], y: A.confirm[1] },
    { f: T.clickConfirm, x: A.confirm[0], y: A.confirm[1], click: true },
    { f: T.closeAll + 30, x: A.confirm[0] + 120, y: A.confirm[1] + 160 },
  ]
  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 1080} />
      <Camera state={cam}>
        <Window>
          <AppShell active={frame >= T.swap ? "/app/conferencia" : "/app/fotos"}>
            <div style={{ position: "relative" }}>
              {swap < 1 && (
                <div style={{ opacity: 1 - swap, transform: `translateY(${-SCROLL * progress(frame, T.result + 4, 26)}px)` }}>
                  <PhotoPage frame={frame} />
                </div>
              )}
              {swap > 0 && (
                <div style={{ opacity: swap, position: swap < 1 ? "absolute" : "relative", inset: 0 }}>
                  <ConferencePage frame={frame} />
                </div>
              )}
            </div>
          </AppShell>
          <ConferenceDialog frame={frame} />
          <ApproveAlert frame={frame} />
          <Toast frame={frame} at={T.closeAll + 2} text="Conferência aprovada." duration={50} />
          <Cursor frame={frame} keys={pointer} scale={0.85} visibleFrom={T.cursorIn} hideAfter={T.closeAll + 30} />
          <AnchorProbe tag={`conf@${frame}`} />
        </Window>
      </Camera>
      <SceneLabel
        frame={frame}
        duration={duration}
        index="04 — CONFERÊNCIA DE COMANDAS"
        title="A foto confere a comanda"
        subtitle="OCR identifica os dados, compara com o cadastro e a aprovação é sempre manual."
        from={150}
        until={232}
      />
    </AbsoluteFill>
  )
}
