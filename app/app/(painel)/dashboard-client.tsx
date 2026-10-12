"use client"

import {
  AlertTriangle,
  Ban,
  Bike,
  CheckCircle2,
  ClipboardList,
  Clock,
  Hash,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState } from "@/components/ossala/empty-state"
import { FiltersBar } from "@/components/ossala/filters-bar"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan } from "@/components/ossala/session-provider"
import { StatCard } from "@/components/ossala/stat-card"
import { useCatalog } from "@/hooks/use-catalog"
import { todayISO, formatDateTimeBR } from "@/lib/dates"
import { friendlyError } from "@/lib/errors"
import { formatBRL } from "@/lib/money"
import { P } from "@/lib/permissions"
import type { DeliveryFilters } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface Summary {
  total: number
  comandas: number
  pendentes: number
  em_andamento: number
  concluidas: number
  canceladas: number
  divergencias: number
  conferencias_aguardando: number
  extras_qtd: number
  charge_total: number
  repass_total: number
  pagamentos_pendentes_valor: number
  pagamentos_pendentes_qtd: number
  por_motoboy: Array<{ motoboy_id: string | null; nome: string; total: number; concluidas: number; repasse: number }>
  por_area: Array<{ area_id: string | null; nome: string; cor: string | null; total: number; cobrado: number }>
}

interface Alert {
  type: string
  severity: "info" | "warning" | "danger"
  message: string
  link: string
}

export function DashboardClient() {
  const can = useCan()
  const { motoboys, areas } = useCatalog()
  const today = todayISO()
  const [filters, setFilters] = useState<DeliveryFilters>({ from: today, to: today })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [pendingPayments, setPendingPayments] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const showMoney = can(P.financeiroVer)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    const supabase = getBrowserSupabase()
    const [s, a, p] = await Promise.all([
      supabase.rpc("dashboard_summary", {
        p_from: filters.from || today,
        p_to: filters.to || today,
        p_motoboy: filters.motoboy || null,
        p_area: filters.area || null,
        p_status: filters.status || null,
        p_payment_status: filters.payment || null,
      }),
      supabase.rpc("operational_alerts", { p_date: today }),
      can(P.pagamentosVer)
        ? supabase.from("payments").select("id", { count: "exact", head: true }).in("status", ["pendente", "em_conferencia", "aprovado"])
        : Promise.resolve({ count: null, error: null }),
    ])
    if (id !== reqId.current) return
    if (s.error) {
      setError(friendlyError(s.error))
    } else {
      setSummary(s.data as Summary)
      setAlerts((a.data as Alert[]) ?? [])
      setPendingPayments(p.count ?? null)
      setError(null)
      setUpdatedAt(new Date().toISOString())
    }
    setLoading(false)
  }, [filters, today, can])

  useEffect(() => {
    load()
  }, [load])

  // Atualização em tempo real (entregas e conferências) + periódica.
  useEffect(() => {
    const supabase = getBrowserSupabase()
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => load(), 800)
    }
    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_conferences" }, schedule)
      .subscribe()
    const interval = setInterval(() => load(), 60_000)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [load])

  const s = summary
  return (
    <>
      <PageHeader
        title="Hoje"
        description={updatedAt ? `Atualizado em ${formatDateTimeBR(updatedAt)}` : "Indicadores calculados a partir do banco de dados."}
        actions={
          <>
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            {can(P.entregasCriar) && (
              <Button asChild>
                <Link href="/app/entregas?nova=1">
                  <Plus /> Nova entrega
                </Link>
              </Button>
            )}
          </>
        }
      />

      <FiltersBar value={filters} onChange={setFilters} motoboys={motoboys} areas={areas} show={{ search: false }} />

      {error && <ErrorState message={error} onRetry={load} />}

      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.type}
              href={a.link}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                a.severity === "danger" && "border-red-500/40 bg-red-500/10 text-red-200",
                a.severity === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-100",
                a.severity === "info" && "border-sky-500/30 bg-sky-500/10 text-sky-100",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />
              {a.message}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Entregas" value={s?.total ?? 0} icon={ClipboardList} loading={loading && !s} href="/app/entregas" />
        <StatCard label="Comandas" value={s?.comandas ?? 0} icon={Hash} loading={loading && !s} />
        <StatCard label="Pendentes" value={s?.pendentes ?? 0} icon={Clock} tone="warning" loading={loading && !s} href="/app/entregas?status=pendente" />
        <StatCard label="Em andamento" value={s?.em_andamento ?? 0} icon={Bike} loading={loading && !s} href="/app/entregas?status=em_andamento" />
        <StatCard label="Concluídas" value={s?.concluidas ?? 0} icon={CheckCircle2} tone="success" loading={loading && !s} href="/app/entregas?status=entregue" />
        <StatCard label="Canceladas" value={s?.canceladas ?? 0} icon={Ban} loading={loading && !s} href="/app/entregas?status=cancelada" />
        <StatCard label="Divergências" value={s?.divergencias ?? 0} icon={AlertTriangle} tone={s?.divergencias ? "danger" : "default"} loading={loading && !s} href="/app/entregas?divergencia=1" />
        <StatCard label="Conferências aguardando" value={s?.conferencias_aguardando ?? 0} icon={ScanSearch} loading={loading && !s} href="/app/conferencia" />
        <StatCard label="Extras lançados" value={s?.extras_qtd ?? 0} icon={Sparkles} loading={loading && !s} />
        {showMoney && (
          <>
            <StatCard label="Valor cobrado" value={formatBRL(s?.charge_total)} icon={Wallet} tone="gold" loading={loading && !s} />
            <StatCard label="Repasse (concluídas)" value={formatBRL(s?.repass_total)} icon={Wallet} tone="gold" loading={loading && !s} />
            <StatCard
              label="Repasse a pagar"
              value={formatBRL(s?.pagamentos_pendentes_valor)}
              hint={`${s?.pagamentos_pendentes_qtd ?? 0} entrega(s)${pendingPayments !== null ? ` · ${pendingPayments} pagamento(s) em aberto` : ""}`}
              icon={Wallet}
              tone="warning"
              loading={loading && !s}
              href={can(P.pagamentosVer) ? "/app/pagamentos" : undefined}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-[#e8c98e]">Entregas por motoboy</h2>
          {s && s.por_motoboy.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motoboy</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Concluídas</TableHead>
                  {showMoney && <TableHead className="text-right">Repasse</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.por_motoboy.map((m) => (
                  <TableRow key={m.motoboy_id ?? "none"}>
                    <TableCell>{m.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.concluidas}</TableCell>
                    {showMoney && <TableCell className="text-right tabular-nums">{formatBRL(m.repasse)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyBlock loading={loading} />
          )}
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-[#e8c98e]">Entregas por área</h2>
          {s && s.por_area.length > 0 ? (
            <ul className="space-y-2">
              {s.por_area.map((a) => {
                const pct = s.total ? Math.round((a.total / Math.max(1, s.total - s.canceladas)) * 100) : 0
                return (
                  <li key={a.area_id ?? "none"}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: a.cor ?? "#666" }} />
                        {a.nome}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {a.total} {showMoney && `· ${formatBRL(a.cobrado)}`}
                      </span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-[#800020]" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyBlock loading={loading} />
          )}
        </section>
      </div>
    </>
  )
}

function EmptyBlock({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
      {loading ? <Loader2 className="size-5 animate-spin" /> : <PackageOpen className="size-6 text-[#b48a4a]" />}
      {loading ? "Carregando…" : "Nenhuma entrega no período."}
    </div>
  )
}
