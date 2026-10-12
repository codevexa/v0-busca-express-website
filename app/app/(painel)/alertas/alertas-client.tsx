"use client"

import { AlertTriangle, Bell, CheckCheck, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { Pagination } from "@/components/ossala/pagination"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { markNotificationsRead } from "@/lib/actions/account"
import { formatDateTimeBR, todayISO } from "@/lib/dates"
import type { NotificationRow } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const CATEGORIES: Record<string, { label: string; tone: "danger" | "warning" | "info" | "gold" | "muted" }> = {
  entrega: { label: "Entrega", tone: "info" },
  entrega_pendente: { label: "Entrega pendente", tone: "warning" },
  divergencia: { label: "Divergência", tone: "danger" },
  conferencia: { label: "Conferência", tone: "info" },
  falha_ocr: { label: "Falha no OCR", tone: "danger" },
  pagamento: { label: "Pagamento", tone: "gold" },
  fechamento: { label: "Fechamento", tone: "gold" },
  erro_salvar: { label: "Erro ao salvar", tone: "danger" },
  nao_autorizado: { label: "Não autorizado", tone: "danger" },
  rede: { label: "Rede", tone: "warning" },
}

const PAGE = 30

interface OperationalAlert {
  type: string
  severity: "info" | "warning" | "danger"
  message: string
  link: string
}

export function AlertasClient() {
  const can = useCan()
  const { session } = useSession()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [count, setCount] = useState(0)
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<"todas" | "nao_lidas">("nao_lidas")
  const [category, setCategory] = useState("")
  const [ops, setOps] = useState<OperationalAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    let q = supabase
      .from("notifications")
      .select("id, category, title, message, link, read_at, created_at", { count: "exact" })
      .eq("recipient_id", session.user_id)
    if (filter === "nao_lidas") q = q.is("read_at", null)
    if (category) q = q.eq("category", category)
    const [{ data, error, count }, unreadRes, opsRes] = await Promise.all([
      q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", session.user_id).is("read_at", null),
      can(P.dashboard) ? supabase.rpc("operational_alerts", { p_date: todayISO() }) : Promise.resolve({ data: [] }),
    ])
    if (error) setError(friendlyError(error))
    else {
      setRows((data ?? []) as NotificationRow[])
      setCount(count ?? 0)
      setUnread(unreadRes.count ?? 0)
      setOps((opsRes.data as OperationalAlert[]) ?? [])
      setError(null)
    }
    setLoading(false)
  }, [session.user_id, filter, category, page, can])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel(`alertas:${session.user_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.user_id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, session.user_id])

  async function mark(ids: string[] | null) {
    const r = await markNotificationsRead(ids)
    if (!r.ok) return toast.error(r.error)
    if (ids === null) toast.success(`${r.data.count} notificação(ões) marcada(s) como lida(s).`)
    window.dispatchEvent(new Event("ossala:notifications-changed"))
    load()
  }

  return (
    <>
      <PageHeader
        title="Alertas"
        description={`${unread} não lida(s). Notificações geradas por eventos reais do sistema.`}
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            <Button onClick={() => mark(null)} disabled={unread === 0}>
              <CheckCheck /> Marcar todas como lidas
            </Button>
          </>
        }
      />

      {ops.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-[#e8c98e]">Alertas operacionais de hoje</h2>
          <div className="space-y-2">
            {ops.map((a) => (
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
                <AlertTriangle className="size-4 shrink-0" /> {a.message}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect value={filter} onChange={(e) => (setFilter(e.target.value as typeof filter), setPage(0))} className="w-44" aria-label="Filtro">
          <option value="nao_lidas">Não lidas</option>
          <option value="todas">Todas</option>
        </NativeSelect>
        <NativeSelect value={category} onChange={(e) => (setCategory(e.target.value), setPage(0))} className="w-52" aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 && !loading ? (
        <EmptyState icon={Bell} title={filter === "nao_lidas" ? "Nenhuma notificação não lida" : "Nenhuma notificação"} />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const cat = CATEGORIES[n.category ?? ""] ?? { label: n.category ?? "Geral", tone: "muted" as const }
            return (
              <li
                key={n.id}
                className={cn("rounded-xl border bg-card p-3", n.read_at ? "border-border opacity-75" : "border-[#b48a4a]/50")}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.read_at && <span className="size-2 rounded-full bg-[#d4af37]" aria-label="Não lida" />}
                      <span className="font-medium">{n.title}</span>
                      <Badge tone={cat.tone}>{cat.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTimeBR(n.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {n.link && (
                      <Button asChild size="sm" variant="secondary" onClick={() => !n.read_at && mark([n.id])}>
                        <Link href={n.link}>Abrir</Link>
                      </Button>
                    )}
                    {!n.read_at && (
                      <Button size="sm" variant="ghost" onClick={() => mark([n.id])}>
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE} count={count} onPage={setPage} />
    </>
  )
}
