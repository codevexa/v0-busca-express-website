"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { Pagination } from "@/components/ossala/pagination"
import { addDays, formatDateTimeBR, todayISO } from "@/lib/dates"
import { friendlyError } from "@/lib/errors"
import { getBrowserSupabase } from "@/lib/supabase/client"

interface AuditRow {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  changed_fields: string[] | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  reason: string | null
  created_at: string
}

const ENTITIES: Record<string, string> = {
  deliveries: "Entregas",
  delivery_extras: "Extras",
  payments: "Pagamentos",
  payment_items: "Itens de pagamento",
  closing_periods: "Fechamentos",
  delivery_areas: "Áreas",
  neighborhoods: "Bairros",
  extra_rules: "Regras de extras",
  motoboys: "Motoboys",
  profiles: "Usuários",
  user_permissions: "Permissões de usuário",
  company_role_overrides: "Permissões por função",
  app_settings: "Configurações",
  delivery_conferences: "Conferências",
  delivery_photos: "Fotos",
  app: "Eventos do aplicativo",
}

const IGNORED = new Set(["updated_by", "company_id"])
const PAGE = 30

export function AuditoriaClient() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [entity, setEntity] = useState("")
  const [from, setFrom] = useState(addDays(todayISO(), -7))
  const [to, setTo] = useState(todayISO())
  const [entityId, setEntityId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    let q = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", `${from}T00:00:00-03:00`)
      .lte("created_at", `${to}T23:59:59-03:00`)
    if (entity) q = q.eq("entity", entity)
    if (entityId.trim()) q = q.eq("entity_id", entityId.trim())
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      setError(friendlyError(error))
    } else {
      const list = (data ?? []) as AuditRow[]
      setRows(list)
      setCount(count ?? 0)
      setError(null)
      const ids = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[]
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome, matricula").in("id", ids)
        setNames(Object.fromEntries((profs ?? []).map((p) => [p.id, `${p.nome} (${p.matricula})`])))
      }
    }
    setLoading(false)
  }, [entity, from, to, entityId, page])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro das operações críticas: quem alterou, quando, o que mudou e a justificativa."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4">
        <NativeSelect value={entity} onChange={(e) => (setEntity(e.target.value), setPage(0))} aria-label="Entidade">
          <option value="">Todas as áreas</option>
          {Object.entries(ENTITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        <Input placeholder="ID do registro" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 && !loading ? (
        <EmptyState title="Nenhum registro de auditoria no período" />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const fields = (r.changed_fields ?? []).filter((f) => !IGNORED.has(f))
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.action === "delete" ? "danger" : r.action === "insert" ? "success" : "info"}>{r.action}</Badge>
                  <span className="font-medium">{ENTITIES[r.entity] ?? r.entity}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBR(r.created_at)}</span>
                  <span className="text-xs text-muted-foreground">· {r.actor_id ? (names[r.actor_id] ?? "usuário") : "sistema"}</span>
                </div>
                {r.reason && <p className="mt-1 text-xs text-amber-200">Justificativa: {r.reason}</p>}
                {r.action === "update" && fields.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-[#d4af37]">{fields.length} campo(s) alterado(s): {fields.join(", ")}</summary>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {fields.map((f) => (
                          <tr key={f} className="border-t border-border">
                            <td className="py-1 pr-2 text-muted-foreground">{f}</td>
                            <td className="py-1 pr-2 text-red-200">{JSON.stringify(r.before_data?.[f] ?? null)}</td>
                            <td className="py-1 text-emerald-200">{JSON.stringify(r.after_data?.[f] ?? null)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                {r.action !== "update" && r.entity_id && <p className="mt-1 text-xs text-muted-foreground">Registro {r.entity_id}</p>}
              </li>
            )
          })}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE} count={count} onPage={setPage} />
    </>
  )
}
