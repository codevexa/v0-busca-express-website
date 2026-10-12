"use client"

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { CLOSING_STATUS, type ClosingStatus } from "@/lib/domain"
import { addDays, fortnightRange, monthRange, parseISODate, todayISO, toISODate } from "@/lib/dates"
import { friendlyError } from "@/lib/errors"
import { formatBRL, sumCents, fromCents } from "@/lib/money"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface DayStat {
  total: number
  concluidas: number
  pendentes: number
  canceladas: number
  repasse: number[]
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

export function CalendarioClient() {
  const can = useCan()
  const { settings } = useSession()
  const showMoney = can(P.financeiroVer)
  const [anchor, setAnchor] = useState(todayISO())
  const month = monthRange(anchor)
  const [stats, setStats] = useState<Record<string, DayStat>>({})
  const [closings, setClosings] = useState<Array<{ start_date: string; end_date: string; status: ClosingStatus; label: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    const map: Record<string, DayStat> = {}
    try {
      for (let offset = 0; offset < 20000; offset += 1000) {
        const { data, error } = await supabase
          .from("delivery_financials")
          .select("delivery_date, status, repass_net")
          .gte("delivery_date", month.from)
          .lte("delivery_date", month.to)
          .order("id")
          .range(offset, offset + 999)
        if (error) throw error
        for (const r of data ?? []) {
          const s = (map[r.delivery_date] ??= { total: 0, concluidas: 0, pendentes: 0, canceladas: 0, repasse: [] })
          s.total += 1
          if (r.status === "entregue") {
            s.concluidas += 1
            s.repasse.push(Number(r.repass_net))
          } else if (r.status === "cancelada") s.canceladas += 1
          else s.pendentes += 1
        }
        if (!data || data.length < 1000) break
      }
      setStats(map)
      if (can(P.fechamentosVer)) {
        const { data } = await supabase
          .from("closing_periods")
          .select("start_date, end_date, status, label")
          .lte("start_date", month.to)
          .gte("end_date", month.from)
        setClosings((data ?? []) as typeof closings)
      }
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [month.from, month.to, can])

  useEffect(() => {
    load()
  }, [load])

  const days = useMemo(() => {
    const first = parseISODate(month.from)
    const lead = (first.getDay() + 6) % 7
    const start = addDays(month.from, -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month.from])

  const totals = Object.values(stats).reduce(
    (acc, s) => ({ total: acc.total + s.total, concluidas: acc.concluidas + s.concluidas, repasse: [...acc.repasse, ...s.repasse] }),
    { total: 0, concluidas: 0, repasse: [] as number[] },
  )
  const today = todayISO()
  const split = settings?.closing_split_day ?? 15

  return (
    <>
      <PageHeader
        title="Calendário"
        description="Entregas por dia, quinzenas e situação dos fechamentos."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(month.from, -1))} aria-label="Mês anterior">
              <ChevronLeft />
            </Button>
            <span className="min-w-40 text-center font-medium capitalize">{month.label}</span>
            <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(month.to, 1))} aria-label="Próximo mês">
              <ChevronRight />
            </Button>
            <Button variant="ghost" onClick={() => setAnchor(todayISO())}>
              Hoje
            </Button>
          </div>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}

      <div className="mb-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          Total no mês: <strong className="text-foreground">{totals.total}</strong>
        </span>
        <span>
          Concluídas: <strong className="text-foreground">{totals.concluidas}</strong>
        </span>
        {showMoney && (
          <span>
            Repasse: <strong className="text-[#d4af37]">{formatBRL(fromCents(sumCents(totals.repasse)))}</strong>
          </span>
        )}
        {loading && <Loader2 className="size-4 animate-spin" />}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#b48a4a]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day >= month.from && day <= month.to
          const s = stats[day]
          const closing = closings.find((c) => day >= c.start_date && day <= c.end_date)
          const isSplit = parseISODate(day).getDate() === split
          return (
            <Link
              key={day}
              href={`/app/historico?de=${day}&ate=${day}`}
              className={cn(
                "flex min-h-20 flex-col rounded-lg border p-1.5 text-left text-xs transition-colors hover:border-[#b48a4a]/60 sm:min-h-24",
                inMonth ? "border-border bg-card" : "border-transparent bg-card/30 text-muted-foreground",
                day === today && "ring-1 ring-[#d4af37]",
                isSplit && inMonth && "border-r-2 border-r-[#800020]",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("font-semibold", day === today && "text-[#d4af37]")}>{parseISODate(day).getDate()}</span>
                {closing && inMonth && (
                  <span
                    title={`${closing.label}: ${CLOSING_STATUS[closing.status].label}`}
                    className={cn(
                      "size-2 rounded-full",
                      closing.status === "encerrado" ? "bg-emerald-400" : closing.status === "aprovado" ? "bg-[#d4af37]" : "bg-sky-400",
                    )}
                  />
                )}
              </span>
              {s && (
                <span className="mt-auto space-y-0.5">
                  <span className="block text-[11px] font-medium text-foreground">{s.total} entrega(s)</span>
                  <span className="hidden text-[10px] text-muted-foreground sm:block">
                    {s.concluidas} ok · {s.pendentes} abertas
                  </span>
                  {showMoney && s.repasse.length > 0 && (
                    <span className="hidden text-[10px] text-[#d4af37] sm:block">{formatBRL(fromCents(sumCents(s.repasse)))}</span>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Quinzenas: 1–{split} e {split + 1}–fim do mês (borda bordô marca o corte).</span>
        {[fortnightRange(month.from, split), fortnightRange(month.to, split)].map((r) => (
          <Link key={r.from} href={`/app/historico?de=${r.from}&ate=${r.to}`} className="text-[#d4af37] underline">
            Ver {r.label} ({toISODate(parseISODate(r.from)).slice(8)}–{r.to.slice(8)})
          </Link>
        ))}
        {can(P.fechamentosVer) && (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-400" /> consolidado</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#d4af37]" /> aprovado</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> encerrado</span>
          </span>
        )}
      </div>
    </>
  )
}
