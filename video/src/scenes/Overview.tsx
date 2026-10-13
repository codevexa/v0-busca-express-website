import { AlertTriangle, Ban, Bike, CheckCircle2, ClipboardList, Clock, Hash, Plus, RefreshCw, ScanSearch, Sparkles, Wallet } from "lucide-react"
import { AbsoluteFill, useCurrentFrame } from "remotion"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { StatCard } from "@/components/ossala/stat-card"
import { formatBRL } from "@/lib/money"
import { cn } from "@/lib/utils"
import { AREAS, DEMO_DATE, MOTOBOYS, SUMMARY } from "../data/demo"
import { countUp, easeInOut, progress, rise, tween } from "../lib/anim"
import { AppShell } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Camera, Window } from "../ui/Camera"
import { SceneLabel } from "../ui/SceneLabel"

const noop = () => {}

/** Painel "Hoje" — mesma estrutura de app/app/(painel)/dashboard-client.tsx. */
export function DashboardScreen({ frame, countFrom = 40 }: { frame: number; countFrom?: number }) {
  const s = SUMMARY
  const n = (v: number, i: number) => Math.round(countUp(frame, countFrom + i * 2, 40, v))
  const money = (v: number, i: number) => formatBRL(countUp(frame, countFrom + i * 2, 46, v))
  const alerts = [
    { severity: "warning", message: "1 entrega(s) sem motoboy atribuído" },
    { severity: "danger", message: "1 entrega(s) com divergência" },
  ]
  const cards = [
    <StatCard key="1" label="Entregas" value={n(s.total, 0)} icon={ClipboardList} href="#" />,
    <StatCard key="2" label="Comandas" value={n(s.comandas, 1)} icon={Hash} />,
    <StatCard key="3" label="Pendentes" value={n(s.pendentes, 2)} icon={Clock} tone="warning" href="#" />,
    <StatCard key="4" label="Em andamento" value={n(s.em_andamento, 3)} icon={Bike} href="#" />,
    <StatCard key="5" label="Concluídas" value={n(s.concluidas, 4)} icon={CheckCircle2} tone="success" href="#" />,
    <StatCard key="6" label="Canceladas" value={n(s.canceladas, 5)} icon={Ban} href="#" />,
    <StatCard key="7" label="Divergências" value={n(s.divergencias, 6)} icon={AlertTriangle} tone="danger" href="#" />,
    <StatCard key="8" label="Conferências aguardando" value={n(s.conferencias_aguardando, 7)} icon={ScanSearch} href="#" />,
    <StatCard key="9" label="Extras lançados" value={n(s.extras_qtd, 8)} icon={Sparkles} />,
    <StatCard key="10" label="Valor cobrado" value={money(s.charge_total, 9)} icon={Wallet} tone="gold" />,
    <StatCard key="11" label="Repasse (concluídas)" value={money(s.repass_total, 10)} icon={Wallet} tone="gold" />,
    <StatCard
      key="12"
      label="Repasse a pagar"
      value={money(s.pagamentos_pendentes_valor, 11)}
      hint={`${s.pagamentos_pendentes_qtd} entrega(s) · 4 pagamento(s) em aberto`}
      icon={Wallet}
      tone="warning"
      href="#"
    />,
  ]
  const bars = progress(frame, countFrom + 50, 50, easeInOut)
  return (
    <>
      <PageHeader
        title="Hoje"
        description="Atualizado em agora · indicadores calculados a partir do banco de dados."
        actions={
          <>
            <Button variant="outline">
              <RefreshCw /> Atualizar
            </Button>
            <Button>
              <Plus /> Nova entrega
            </Button>
          </>
        }
      />
      <FiltersBar
        value={{ from: DEMO_DATE, to: DEMO_DATE }}
        onChange={noop}
        motoboys={MOTOBOYS}
        areas={AREAS}
        show={{ search: false }}
      />
      <div className="mb-4 space-y-2">
        {alerts.map((a, i) => (
          <div
            key={a.message}
            style={rise(frame, countFrom - 10 + i * 6, 12)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              a.severity === "danger" && "border-red-500/40 bg-red-500/10 text-red-200",
              a.severity === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-100",
            )}
          >
            <AlertTriangle className="size-4 shrink-0" />
            {a.message}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-3">
        {cards.map((c, i) => (
          <div key={i} style={rise(frame, countFrom - 16 + i * 2, 20)}>
            {c}
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <section className="rounded-xl border border-border bg-card p-4" style={rise(frame, countFrom + 20, 24)}>
          <h2 className="mb-3 font-semibold text-[#e8c98e]">Entregas por motoboy</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motoboy</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Concluídas</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.por_motoboy.map((m) => (
                <TableRow key={m.nome}>
                  <TableCell>{m.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.concluidas}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(m.repasse)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <section className="rounded-xl border border-border bg-card p-4" style={rise(frame, countFrom + 26, 24)}>
          <h2 className="mb-3 font-semibold text-[#e8c98e]">Entregas por área</h2>
          <ul className="space-y-2">
            {s.por_area.map((a) => {
              const pct = Math.round((a.total / Math.max(1, s.total - s.canceladas)) * 100)
              return (
                <li key={a.nome}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: a.cor }} />
                      {a.nome}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {a.total} · {formatBRL(a.cobrado)}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-muted">
                    <div className="h-2 rounded bg-[#800020]" style={{ width: `${pct * bars}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}

/** Cena 2 — Apresentação do sistema: a janela entra em perspectiva e a câmera percorre o painel. */
export function Overview({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const k = [0, 56, 100, 150, 196, duration]
  const cam = {
    fx: tween(frame, k, [800, 800, 800, 930, 960, 900]),
    fy: tween(frame, k, [520, 480, 480, 330, 700, 640]),
    zoom: tween(frame, k, [0.7, 0.92, 0.95, 1.32, 1.26, 1.12]),
    rotX: tween(frame, [0, 56], [26, 0]),
    rotY: tween(frame, k, [-10, 0, 0, -3, 2, 0]),
    lift: tween(frame, [0, 56], [220, 0]),
    opacity: progress(frame, 0, 20),
  }
  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 150} />
      <Camera state={cam}>
        <Window>
          <AppShell active="/app" reveal={progress(frame, 18, 40)}>
            <DashboardScreen frame={frame} countFrom={44} />
          </AppShell>
        </Window>
      </Camera>
      <SceneLabel
        frame={frame}
        duration={duration}
        index="01 — VISÃO GERAL"
        title="Tudo o que acontece hoje, em um painel"
        subtitle="Entregas, status, divergências e valores atualizados em tempo real."
        from={64}
      />
    </AbsoluteFill>
  )
}
