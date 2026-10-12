"use client"

import { Camera, Check, Loader2, RefreshCw, RotateCcw, Save, Search, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ComparisonTable } from "@/components/conference/comparison-table"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { Pagination } from "@/components/ossala/pagination"
import { useCan } from "@/components/ossala/session-provider"
import { ConferenceStatusBadge } from "@/components/ossala/status-badge"
import { useCatalog } from "@/hooks/use-catalog"
import { reviewConference } from "@/lib/actions/conference"
import { addDays, formatDateBR, formatDateTimeBR, todayISO } from "@/lib/dates"
import { CONFERENCE_STATUS, type ConferenceStatus } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { compareDelivery } from "@/lib/ocr/compare"
import { OCR_FIELDS, type ComparisonRow, type OcrFields } from "@/lib/ocr/types"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"

interface ConferenceListRow {
  id: string
  status: ConferenceStatus
  divergence_count: number
  created_at: string
  ocr_confidence: number | null
  error_message: string | null
  delivery_id: string | null
  deliveries: { comanda_number: string; delivery_date: string; motoboy_id: string | null } | null
  delivery_photos: { motoboy_id: string | null; comanda_number: string | null } | null
}

const PAGE = 20

export function ConferenciaClient() {
  const can = useCan()
  const router = useRouter()
  const params = useSearchParams()
  const { motoboys } = useCatalog()
  const [status, setStatus] = useState<string>(params.get("status") ?? "pendentes")
  const [from, setFrom] = useState(addDays(todayISO(), -15))
  const [to, setTo] = useState(todayISO())
  const [motoboy, setMotoboy] = useState("")
  const [comanda, setComanda] = useState("")
  const [rows, setRows] = useState<ConferenceListRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openId = params.get("id")

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    let q = supabase
      .from("delivery_conferences")
      .select(
        "id, status, divergence_count, created_at, ocr_confidence, error_message, delivery_id, deliveries(comanda_number, delivery_date, motoboy_id), delivery_photos(motoboy_id, comanda_number)",
        { count: "exact" },
      )
      .gte("created_at", `${from}T00:00:00-03:00`)
      .lte("created_at", `${to}T23:59:59-03:00`)
    if (status === "pendentes") q = q.in("status", ["aguardando_revisao", "falha_ocr", "processando"])
    else if (status) q = q.eq("status", status)
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      setError(friendlyError(error))
    } else {
      let list = (data ?? []) as unknown as ConferenceListRow[]
      if (motoboy) list = list.filter((r) => (r.deliveries?.motoboy_id ?? r.delivery_photos?.motoboy_id) === motoboy)
      if (comanda.trim()) {
        const c = comanda.trim().toLowerCase()
        list = list.filter((r) => (r.deliveries?.comanda_number ?? r.delivery_photos?.comanda_number ?? "").toLowerCase().includes(c))
      }
      setRows(list)
      setCount(count ?? 0)
      setError(null)
    }
    setLoading(false)
  }, [status, from, to, motoboy, comanda, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("conferencias")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_conferences" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const setOpen = (id: string | null) => {
    const sp = new URLSearchParams(params.toString())
    if (id) sp.set("id", id)
    else sp.delete("id")
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <>
      <PageHeader
        title="Conferência"
        description="Compare os dados cadastrados com os identificados na foto. A aprovação é sempre manual."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            {can(P.conferenciaCriar) && (
              <Button asChild>
                <a href="/app/fotos">
                  <Camera /> Nova foto
                </a>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-5">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="pendentes">Pendentes de revisão</option>
          <option value="">Todas</option>
          {Object.entries(CONFERENCE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        <NativeSelect value={motoboy} onChange={(e) => setMotoboy(e.target.value)} aria-label="Motoboy">
          <option value="">Todos os motoboys</option>
          {motoboys.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
        <Input placeholder="Comanda" value={comanda} onChange={(e) => setComanda(e.target.value)} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !loading && rows.length === 0 ? (
        <EmptyState title="Nenhuma conferência encontrada" description="Envie fotos de comandas na tela Fotos." />
      ) : (
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
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTimeBR(r.created_at)}</TableCell>
                  <TableCell className="font-medium">
                    {r.deliveries?.comanda_number ?? r.delivery_photos?.comanda_number ?? <span className="text-amber-200">não vinculada</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {motoboys.find((m) => m.id === (r.deliveries?.motoboy_id ?? r.delivery_photos?.motoboy_id))?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <ConferenceStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.divergence_count > 0 ? <Badge tone="danger">{r.divergence_count}</Badge> : "—"}</TableCell>
                  <TableCell className="text-xs">{r.ocr_confidence != null ? `${Math.round(r.ocr_confidence * 100)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE} count={count} onPage={setPage} />

      <ConferenceDialog id={openId} onClose={() => setOpen(null)} onChanged={load} />
    </>
  )
}

interface ConferenceDetail {
  id: string
  status: ConferenceStatus
  ocr_fields: Partial<OcrFields>
  corrected_fields: Record<string, string | null>
  comparison: ComparisonRow[]
  divergence_count: number
  error_message: string | null
  notes: string | null
  ocr_raw_text: string | null
  ocr_confidence: number | null
  ocr_model: string | null
  created_at: string
  reviewed_at: string | null
  delivery_id: string | null
  delivery_photos: { storage_path: string } | null
}

interface DeliveryLite {
  id: string
  comanda_number: string
  delivery_date: string
  address: string
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
}

function ConferenceDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const can = useCan()
  const [conf, setConf] = useState<ConferenceDetail | null>(null)
  const [delivery, setDelivery] = useState<DeliveryLite | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [search, setSearch] = useState("")
  const [candidates, setCandidates] = useState<DeliveryLite[]>([])
  const [pending, setPending] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const supabase = getBrowserSupabase()
    const { data, error } = await supabase.from("delivery_conferences").select("*, delivery_photos(storage_path)").eq("id", id).maybeSingle()
    if (error || !data) {
      toast.error(error ? friendlyError(error) : "Conferência não encontrada.")
      onClose()
      return
    }
    const c = data as unknown as ConferenceDetail
    setConf(c)
    setNotes(c.notes ?? "")
    const initial: Record<string, string> = {}
    for (const { key } of OCR_FIELDS) {
      initial[key] = (c.corrected_fields?.[key] ?? c.ocr_fields?.[key]?.value ?? "") as string
    }
    setValues(initial)
    if (c.delivery_id) {
      const { data: d } = await supabase
        .from("deliveries")
        .select("id, comanda_number, delivery_date, address, address_number, complement, neighborhood, city, state")
        .eq("id", c.delivery_id)
        .maybeSingle()
      setDelivery((d as DeliveryLite) ?? null)
    } else {
      setDelivery(null)
    }
    if (c.delivery_photos?.storage_path) {
      const { data: signed } = await supabase.storage.from("delivery-photos").createSignedUrl(c.delivery_photos.storage_path, 900)
      setPhotoUrl(signed?.signedUrl ?? null)
    } else {
      setPhotoUrl(null)
    }
  }, [id, onClose])

  useEffect(() => {
    setConf(null)
    setCandidates([])
    setSearch("")
    load()
  }, [load])

  const reviewed = conf && ["aprovada", "rejeitada", "nova_foto_solicitada"].includes(conf.status)
  const editable = !!conf && !reviewed && can(P.conferenciaAprovar)

  // Comparação recalculada localmente com as correções digitadas (o servidor recalcula ao salvar).
  const liveRows: ComparisonRow[] = conf
    ? compareDelivery(
        delivery,
        Object.fromEntries(
          OCR_FIELDS.map(({ key }) => {
            const original = conf.ocr_fields?.[key]
            const v = values[key] ?? ""
            const changed = (original?.value ?? "") !== v
            return [key, { value: v || null, confidence: changed ? 1 : (original?.confidence ?? 0) }]
          }),
        ) as Partial<OcrFields>,
      )
    : []

  async function searchDeliveries() {
    const term = search.trim()
    if (!term) return
    const supabase = getBrowserSupabase()
    const { data } = await supabase
      .from("deliveries")
      .select("id, comanda_number, delivery_date, address, address_number, complement, neighborhood, city, state")
      .ilike("comanda_number", `%${term.replace(/[%_]/g, "")}%`)
      .neq("status", "cancelada")
      .order("delivery_date", { ascending: false })
      .limit(10)
    setCandidates((data ?? []) as DeliveryLite[])
    if (!data?.length) toast.info("Nenhuma entrega com esse número.")
  }

  async function decide(decision: "aprovada" | "rejeitada" | "nova_foto_solicitada" | "salvar") {
    if (!conf || pending) return false
    setPending(true)
    const corrected: Record<string, string | null> = {}
    for (const { key } of OCR_FIELDS) {
      const original = conf.ocr_fields?.[key]?.value ?? ""
      if ((values[key] ?? "") !== original) corrected[key] = values[key] || null
    }
    const r = await reviewConference({
      id: conf.id,
      decision,
      corrected_fields: corrected,
      delivery_id: delivery?.id ?? null,
      notes,
    })
    setPending(false)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Salvo.")
    onChanged()
    if (decision === "salvar") await load()
    else onClose()
  }

  async function retryOcr() {
    if (!conf || retrying) return
    setRetrying(true)
    const form = new FormData()
    form.append("conference_id", conf.id)
    try {
      const res = await fetch("/api/conferencia/ocr", { method: "POST", body: form })
      const json = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (!res.ok) toast.error(json.error ?? "Falha ao reprocessar.")
      else if (json.status === "falha_ocr") toast.warning(json.error ?? "O OCR falhou novamente.")
      else toast.success("Imagem reprocessada.")
      await load()
      onChanged()
    } catch {
      toast.error("Falha de conexão.")
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Conferência {conf && <ConferenceStatusBadge status={conf.status} />}
          </DialogTitle>
          <DialogDescription>
            {conf ? `Enviada em ${formatDateTimeBR(conf.created_at)}${conf.ocr_model ? ` · OCR: ${conf.ocr_model}` : ""}` : "Carregando…"}
          </DialogDescription>
        </DialogHeader>
        {!conf ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-[#d4af37]" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="space-y-2">
              {photoUrl ? (
                <a href={photoUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="Foto da comanda" className="w-full rounded-lg border border-border object-contain" />
                </a>
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  {conf.delivery_photos ? "Foto indisponível" : "Conferência manual (sem foto)"}
                </div>
              )}
              {conf.ocr_confidence != null && (
                <p className="text-xs text-muted-foreground">Confiança média do OCR: {Math.round(conf.ocr_confidence * 100)}%</p>
              )}
              {conf.ocr_raw_text && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[#d4af37]">Texto lido</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{conf.ocr_raw_text}</pre>
                </details>
              )}
              {!reviewed && can(P.conferenciaCriar) && conf.delivery_photos && (
                <Button variant="outline" className="w-full" onClick={retryOcr} disabled={retrying}>
                  {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />} Tentar o OCR novamente
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {conf.error_message && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{conf.error_message}</p>
              )}

              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Entrega vinculada:{" "}
                    {delivery ? (
                      <strong>
                        Comanda {delivery.comanda_number} · {formatDateBR(delivery.delivery_date)}
                      </strong>
                    ) : (
                      <span className="text-amber-200">nenhuma</span>
                    )}
                  </span>
                  {editable && delivery && (
                    <Button size="sm" variant="ghost" onClick={() => setDelivery(null)}>
                      <X /> Desvincular
                    </Button>
                  )}
                </div>
                {editable && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Buscar comanda para vincular"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchDeliveries())}
                    />
                    <Button variant="secondary" onClick={searchDeliveries}>
                      <Search />
                    </Button>
                  </div>
                )}
                {candidates.length > 0 && (
                  <ul className="mt-2 divide-y divide-border rounded border border-border">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <button
                          className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setDelivery(c)
                            setCandidates([])
                          }}
                        >
                          {c.comanda_number} · {formatDateBR(c.delivery_date)} · {c.address}
                          {c.address_number ? `, ${c.address_number}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ComparisonTable
                rows={reviewed ? conf.comparison : liveRows}
                editable={editable}
                values={values}
                onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
              />
              {editable && (
                <p className="text-xs text-muted-foreground">
                  Corrija os dados identificados quando o OCR ler errado. As correções ficam registradas.
                </p>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="conf-notes">Observações</Label>
                <Textarea id="conf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!editable} />
              </div>

              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton
                    title="Aprovar conferência?"
                    description={
                      liveRows.some((r) => r.status === "divergent" || r.status === "low_confidence")
                        ? "Ainda há divergências ou leituras de baixa confiança. Justifique nas observações."
                        : "Os dados conferem com o cadastro."
                    }
                    confirmLabel="Aprovar"
                    disabled={!delivery}
                    onConfirm={() => decide("aprovada")}
                  >
                    <Check /> Aprovar
                  </ConfirmButton>
                  <ConfirmButton
                    variant="destructive"
                    title="Rejeitar conferência?"
                    description="A entrega ficará marcada com divergência. Informe o motivo nas observações."
                    confirmLabel="Rejeitar"
                    onConfirm={() => decide("rejeitada")}
                  >
                    <X /> Rejeitar
                  </ConfirmButton>
                  <ConfirmButton
                    variant="outline"
                    title="Solicitar nova fotografia?"
                    description="O responsável pelo envio será notificado."
                    confirmLabel="Solicitar"
                    onConfirm={() => decide("nova_foto_solicitada")}
                  >
                    <Camera /> Solicitar nova foto
                  </ConfirmButton>
                  <Button variant="ghost" onClick={() => decide("salvar")} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar correções
                  </Button>
                </div>
              ) : reviewed ? (
                <p className="text-xs text-muted-foreground">Revisada em {formatDateTimeBR(conf.reviewed_at)}.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Somente usuários com permissão de aprovação podem revisar.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
