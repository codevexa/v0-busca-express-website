"use client"

import { BadgeCheck, Ban, Banknote, ClipboardCheck, Loader2, RefreshCw, Wallet } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan } from "@/components/ossala/session-provider"
import { PaymentStatusBadge } from "@/components/ossala/status-badge"
import { useCatalog } from "@/hooks/use-catalog"
import { createPayment, setPaymentStatus } from "@/lib/actions/finance"
import { addDays, formatDateBR, formatDateTimeBR, fortnightRange, todayISO } from "@/lib/dates"
import { PAYMENT_STATUS, type DeliveryRow, type PaymentStatus } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { formatBRL, fromCents, sumCents } from "@/lib/money"
import { P } from "@/lib/permissions"
import { fetchAllDeliveries, normalizeDelivery } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"

interface PaymentRow {
  id: string
  motoboy_id: string
  amount: number
  status: PaymentStatus
  method: string | null
  reference: string | null
  notes: string | null
  description: string | null
  paid_at: string | null
  created_at: string
  approved_at: string | null
  cancel_reason: string | null
  motoboys: { name: string } | null
}

export function PagamentosClient() {
  const can = useCan()
  const params = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState(can(P.pagamentosCriar) && !params.get("id") ? "apagar" : "pagamentos")
  return (
    <>
      <PageHeader title="Pagamentos" description="Repasse aos motoboys: geração, conferência, aprovação e registro do pagamento." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {can(P.pagamentosCriar) && <TabsTrigger value="apagar">A pagar</TabsTrigger>}
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
        </TabsList>
        {can(P.pagamentosCriar) && (
          <TabsContent value="apagar">
            <APagar onCreated={(id) => {
              setTab("pagamentos")
              router.replace(`?id=${id}`, { scroll: false })
            }} />
          </TabsContent>
        )}
        <TabsContent value="pagamentos">
          <PaymentsList />
        </TabsContent>
      </Tabs>
    </>
  )
}

function APagar({ onCreated }: { onCreated: (id: string) => void }) {
  const { motoboys } = useCatalog()
  const today = todayISO()
  const f = fortnightRange(today)
  const [motoboy, setMotoboy] = useState("")
  const [from, setFrom] = useState(f.from)
  const [to, setTo] = useState(f.to)
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [method, setMethod] = useState("PIX")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  // Mesma chave enquanto a seleção não muda: repetir o clique não duplica o pagamento.
  const keyRef = useRef<string>(crypto.randomUUID())

  const load = useCallback(async () => {
    if (!motoboy) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const { rows } = await fetchAllDeliveries(getBrowserSupabase(), { from, to, motoboy, status: "entregue", payment: "pendente" })
      setRows(rows)
      setSelected(new Set(rows.map((r) => r.id)))
      keyRef.current = crypto.randomUUID()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [motoboy, from, to])

  useEffect(() => {
    load()
  }, [load])

  const total = fromCents(sumCents(rows.filter((r) => selected.has(r.id)).map((r) => r.repass_net)))

  async function create() {
    if (creating || selected.size === 0) return false
    setCreating(true)
    const r = await createPayment({
      motoboy_id: motoboy,
      delivery_ids: [...selected],
      idempotency_key: keyRef.current,
      description: description || `Repasse ${formatDateBR(from)} a ${formatDateBR(to)}`,
      method,
    })
    setCreating(false)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(`Pagamento gerado: ${formatBRL(r.data.amount)}.`)
    keyRef.current = crypto.randomUUID()
    onCreated(r.data.id)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4">
        <NativeSelect value={motoboy} onChange={(e) => setMotoboy(e.target.value)} aria-label="Motoboy">
          <option value="">Selecione o motoboy</option>
          {motoboys.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        <Button variant="outline" onClick={load} disabled={loading || !motoboy}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
        </Button>
      </div>
      {!motoboy ? (
        <EmptyState icon={Wallet} title="Selecione um motoboy" description="São listadas as entregas concluídas ainda não incluídas em pagamento." />
      ) : rows.length === 0 && !loading ? (
        <EmptyState title="Nada a pagar no período" />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === rows.length && rows.length > 0}
                      onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                      aria-label="Selecionar todas"
                    />
                  </TableHead>
                  <TableHead>Comanda</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Repasse área</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead className="text-right">Ajustes</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected)
                          if (v) next.add(r.id)
                          else next.delete(r.id)
                          setSelected(next)
                          keyRef.current = crypto.randomUUID()
                        }}
                        aria-label={`Selecionar ${r.comanda_number}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.comanda_number}</TableCell>
                    <TableCell>{formatDateBR(r.delivery_date)}</TableCell>
                    <TableCell>{r.area_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(r.repass_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(r.extras_repass_total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(r.adjustments_total)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatBRL(r.repass_net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7}>{selected.size} entrega(s) selecionada(s)</TableCell>
                  <TableCell className="text-right text-[#d4af37] tabular-nums">{formatBRL(total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[160px_1fr_auto]">
            <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Método">
              <option>PIX</option>
              <option>Dinheiro</option>
              <option>Transferência</option>
              <option>Outro</option>
            </NativeSelect>
            <Input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <ConfirmButton
              title="Gerar pagamento?"
              description={`${selected.size} entrega(s) — total ${formatBRL(total)}. O valor é recalculado pelo servidor.`}
              confirmLabel="Gerar pagamento"
              disabled={selected.size === 0 || creating}
              onConfirm={create}
            >
              <Banknote /> Gerar pagamento
            </ConfirmButton>
          </div>
        </>
      )}
    </div>
  )
}

function PaymentsList() {
  const { motoboys } = useCatalog()
  const params = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState("")
  const [motoboy, setMotoboy] = useState("")
  const [from, setFrom] = useState(addDays(todayISO(), -60))
  const [to, setTo] = useState(todayISO())
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openId = params.get("id")

  const load = useCallback(async () => {
    setLoading(true)
    let q = getBrowserSupabase()
      .from("payments")
      .select("*, motoboys(name)")
      .gte("created_at", `${from}T00:00:00-03:00`)
      .lte("created_at", `${to}T23:59:59-03:00`)
      .order("created_at", { ascending: false })
      .limit(300)
    if (status) q = q.eq("status", status)
    if (motoboy) q = q.eq("motoboy_id", motoboy)
    const { data, error } = await q
    if (error) setError(friendlyError(error))
    else {
      setRows((data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as PaymentRow[])
      setError(null)
    }
    setLoading(false)
  }, [status, motoboy, from, to])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelado")
    return {
      all: fromCents(sumCents(active.map((r) => r.amount))),
      paid: fromCents(sumCents(active.filter((r) => r.status === "pago").map((r) => r.amount))),
    }
  }, [rows])

  const open = (id: string | null) => router.replace(id ? `?id=${id}` : "?", { scroll: false })

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-5">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={motoboy} onChange={(e) => setMotoboy(e.target.value)} aria-label="Motoboy">
          <option value="">Todos os motoboys</option>
          {motoboys.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
        </Button>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 && !loading ? (
        <EmptyState icon={Wallet} title="Nenhum pagamento no período" />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gerado em</TableHead>
                <TableHead>Motoboy</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pago em</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => open(r.id)}>
                  <TableCell className="text-xs">{formatDateTimeBR(r.created_at)}</TableCell>
                  <TableCell>{r.motoboys?.name ?? "—"}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm">{r.description ?? "—"}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-xs">{r.paid_at ? formatDateTimeBR(r.paid_at) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Total (sem cancelados) · pago {formatBRL(totals.paid)}</TableCell>
                <TableCell className="text-right text-[#d4af37] tabular-nums">{formatBRL(totals.all)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <PaymentDialog id={openId} onClose={() => open(null)} onChanged={load} />
    </div>
  )
}

function PaymentDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const can = useCan()
  const [payment, setPayment] = useState<PaymentRow | null>(null)
  const [items, setItems] = useState<DeliveryRow[]>([])
  const [paidAt, setPaidAt] = useState(todayISO())
  const [method, setMethod] = useState("")
  const [reference, setReference] = useState("")

  const load = useCallback(async () => {
    if (!id) return
    const supabase = getBrowserSupabase()
    const { data } = await supabase.from("payments").select("*, motoboys(name)").eq("id", id).maybeSingle()
    if (!data) {
      toast.error("Pagamento não encontrado.")
      onClose()
      return
    }
    const p = { ...data, amount: Number(data.amount) } as PaymentRow
    setPayment(p)
    setMethod(p.method ?? "PIX")
    setReference(p.reference ?? "")
    const { data: its } = await supabase.from("payment_items").select("delivery_id, active").eq("payment_id", id)
    const ids = (its ?? []).map((i) => i.delivery_id)
    if (ids.length) {
      const { data: ds } = await supabase.from("delivery_financials").select("*").in("id", ids).order("delivery_date")
      setItems((ds ?? []).map(normalizeDelivery))
    } else setItems([])
  }, [id, onClose])

  useEffect(() => {
    setPayment(null)
    load()
  }, [load])

  async function transition(status: PaymentStatus, reason?: string) {
    if (!payment) return false
    const r = await setPaymentStatus({
      id: payment.id,
      status,
      paid_at: status === "pago" ? new Date(`${paidAt}T12:00:00-03:00`).toISOString() : null,
      method: status === "pago" ? method : null,
      reference: status === "pago" ? reference : null,
      reason: reason ?? null,
    })
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Atualizado.")
    await load()
    onChanged()
  }

  const p = payment
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pagamento {p && <PaymentStatusBadge status={p.status} />}
          </DialogTitle>
          <DialogDescription>{p ? `${p.motoboys?.name ?? ""} · gerado em ${formatDateTimeBR(p.created_at)}` : "Carregando…"}</DialogDescription>
        </DialogHeader>
        {!p ? (
          <Loader2 className="mx-auto size-6 animate-spin text-[#d4af37]" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Info label="Valor" value={<span className="font-bold text-[#d4af37]">{formatBRL(p.amount)}</span>} />
              <Info label="Método" value={p.method ?? "—"} />
              <Info label="Referência" value={p.reference ?? "—"} />
              <Info label="Pago em" value={p.paid_at ? formatDateTimeBR(p.paid_at) : "—"} />
              {p.cancel_reason && <Info label="Motivo do cancelamento" value={p.cancel_reason} />}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comanda</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.comanda_number}</TableCell>
                    <TableCell>{formatDateBR(d.delivery_date)}</TableCell>
                    <TableCell>{d.area_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(d.repass_net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {p.status === "aprovado" && can(P.pagamentosConfirmar) && (
              <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Data do pagamento</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Método</Label>
                  <Input value={method} onChange={(e) => setMethod(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Referência / comprovante</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {p.status === "pendente" && can(P.pagamentosCriar) && (
                <ConfirmButton variant="outline" title="Enviar para conferência?" onConfirm={() => transition("em_conferencia")}>
                  <ClipboardCheck /> Em conferência
                </ConfirmButton>
              )}
              {(p.status === "pendente" || p.status === "em_conferencia") && can(P.pagamentosAprovar) && (
                <ConfirmButton title="Aprovar pagamento?" description={`Valor: ${formatBRL(p.amount)}`} onConfirm={() => transition("aprovado")}>
                  <BadgeCheck /> Aprovar
                </ConfirmButton>
              )}
              {p.status === "aprovado" && can(P.pagamentosConfirmar) && (
                <ConfirmButton
                  className="bg-ossala-gradient"
                  title="Registrar pagamento efetuado?"
                  description={`${formatBRL(p.amount)} para ${p.motoboys?.name ?? ""} em ${formatDateBR(paidAt)} via ${method}.`}
                  onConfirm={() => transition("pago")}
                >
                  <Banknote /> Registrar pagamento
                </ConfirmButton>
              )}
              {p.status !== "cancelado" && can(P.pagamentosExcluir) && (
                <ConfirmButton
                  variant="destructive"
                  title={p.status === "pago" ? "Estornar pagamento?" : "Cancelar pagamento?"}
                  description="As entregas voltam a ficar disponíveis para um novo pagamento."
                  reasonLabel="Motivo"
                  reasonMinLength={3}
                  onConfirm={(reason) => transition("cancelado", reason)}
                >
                  <Ban /> {p.status === "pago" ? "Estornar" : "Cancelar"}
                </ConfirmButton>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  )
}
