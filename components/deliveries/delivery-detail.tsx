"use client"

import {
  Ban,
  Bike,
  CheckCircle2,
  History,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { useCan } from "@/components/ossala/session-provider"
import {
  ConferenceStatusBadge,
  DeliveryStatusBadge,
  PaymentStatusBadge,
} from "@/components/ossala/status-badge"
import { addExtra, assignDelivery, cancelExtra, correctClosedDelivery, setDeliveryStatus } from "@/lib/actions/deliveries"
import { formatDateBR, formatDateTimeBR, formatTime } from "@/lib/dates"
import { DELIVERY_STATUS, EXTRA_KIND, type ConferenceStatus, type DeliveryRow, type ExtraRow, type Motoboy } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { formatBRL, parseMoneyInput } from "@/lib/money"
import { P } from "@/lib/permissions"
import { normalizeDelivery } from "@/lib/queries/deliveries"
import { getBrowserSupabase } from "@/lib/supabase/client"

interface HistoryRow {
  id: number
  from_status: string | null
  to_status: string
  changed_at: string
  note: string | null
  changed_by: string | null
}

interface ConferenceRow {
  id: string
  status: ConferenceStatus
  divergence_count: number
  created_at: string
  notes: string | null
}

interface PhotoRow {
  id: string
  storage_path: string
  created_at: string
  source: string
  url?: string
}

export function DeliveryDetailDialog({
  deliveryId,
  onOpenChange,
  motoboys,
  onEdit,
  onChanged,
}: {
  deliveryId: string | null
  onOpenChange: (open: boolean) => void
  motoboys: Motoboy[]
  onEdit: (d: DeliveryRow) => void
  onChanged: () => void
}) {
  const can = useCan()
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null)
  const [extras, setExtras] = useState<ExtraRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [conferences, setConferences] = useState<ConferenceRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [closed, setClosed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!deliveryId) return
    setLoading(true)
    const supabase = getBrowserSupabase()
    const [d, e, h, c, p] = await Promise.all([
      supabase.from("delivery_financials").select("*").eq("id", deliveryId).maybeSingle(),
      supabase.from("delivery_extras").select("*").eq("delivery_id", deliveryId).order("created_at"),
      supabase.from("delivery_status_history").select("*").eq("delivery_id", deliveryId).order("changed_at"),
      supabase
        .from("delivery_conferences")
        .select("id, status, divergence_count, created_at, notes")
        .eq("delivery_id", deliveryId)
        .order("created_at", { ascending: false }),
      supabase
        .from("delivery_photos")
        .select("id, storage_path, created_at, source")
        .eq("delivery_id", deliveryId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ])
    if (d.error || !d.data) {
      setError(d.error ? friendlyError(d.error) : "Entrega não encontrada ou sem permissão.")
      setLoading(false)
      return
    }
    const row = normalizeDelivery(d.data)
    setDelivery(row)
    setExtras(((e.data ?? []) as ExtraRow[]).map((x) => ({ ...x, charge_amount: Number(x.charge_amount), repass_amount: Number(x.repass_amount) })))
    setHistory((h.data ?? []) as HistoryRow[])
    setConferences((c.data ?? []) as ConferenceRow[])

    const photoRows = (p.data ?? []) as PhotoRow[]
    if (photoRows.length) {
      const { data: signed } = await supabase.storage
        .from("delivery-photos")
        .createSignedUrls(photoRows.map((x) => x.storage_path), 600)
      setPhotos(photoRows.map((x, i) => ({ ...x, url: signed?.[i]?.signedUrl ?? undefined })))
    } else {
      setPhotos([])
    }

    const userIds = Array.from(new Set((h.data ?? []).map((x: HistoryRow) => x.changed_by).filter(Boolean))) as string[]
    if (userIds.length && can(P.usuariosVer)) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", userIds)
      setNames(Object.fromEntries((profs ?? []).map((x: { id: string; nome: string }) => [x.id, x.nome])))
    }

    const { data: periods } = await supabase
      .from("closing_periods")
      .select("id")
      .eq("status", "encerrado")
      .lte("start_date", row.delivery_date)
      .gte("end_date", row.delivery_date)
      .limit(1)
    setClosed(!!periods?.length)
    setError(null)
    setLoading(false)
  }, [deliveryId, can])

  useEffect(() => {
    if (deliveryId) {
      setDelivery(null)
      load()
    }
  }, [deliveryId, load])

  const refresh = async () => {
    await load()
    onChanged()
  }

  const d = delivery
  const showMoney = can(P.financeiroVer)
  const editable = d && !closed && d.status !== "cancelada"

  return (
    <Dialog open={!!deliveryId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Comanda {d?.comanda_number ?? "…"}
            {d && <DeliveryStatusBadge status={d.status} />}
            {d?.has_divergence && <Badge tone="danger">Divergência</Badge>}
            {closed && <Badge tone="muted">Período encerrado</Badge>}
          </DialogTitle>
          <DialogDescription>
            {d ? `${formatDateBR(d.delivery_date)} às ${formatTime(d.delivery_time)}` : "Carregando…"}
          </DialogDescription>
        </DialogHeader>

        {loading && !d && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-[#d4af37]" />
          </div>
        )}
        {error && <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

        {d && (
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              {(showMoney || can(P.extrasVer)) && <TabsTrigger value="valores">Valores e extras</TabsTrigger>}
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="conferencia">Conferência</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Info label="Endereço" value={[d.address, d.address_number].filter(Boolean).join(", ")} />
                <Info label="Complemento" value={d.complement} />
                <Info label="Bairro" value={d.neighborhood} />
                <Info label="Cidade / UF" value={[d.city, d.state].filter(Boolean).join(" / ")} />
                <Info label="CEP" value={d.postal_code} />
                <Info
                  label="Posição"
                  value={
                    d.latitude != null ? (
                      <Link className="text-[#d4af37] underline" href={`/app/mapa?entrega=${d.id}`}>
                        {d.latitude.toFixed(5)}, {d.longitude?.toFixed(5)}
                      </Link>
                    ) : (
                      "Não localizada"
                    )
                  }
                />
                <Info label="Área" value={d.area_name ?? "Sem área"} />
                <Info label="Motoboy" value={d.motoboy_name ?? "Sem motoboy"} />
                <Info label="Pagamento" value={<PaymentStatusBadge status={d.payment_status} />} />
                <Info label="Entregue em" value={d.delivered_at ? formatDateTimeBR(d.delivered_at) : null} />
                <Info label="Observações" value={d.notes} wide />
                {d.status === "cancelada" && <Info label="Motivo do cancelamento" value={d.cancel_reason} wide />}
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {editable && can(P.entregasEditar) && (
                  <Button variant="outline" onClick={() => onEdit(d)}>
                    <Pencil /> Editar / corrigir endereço
                  </Button>
                )}
                {editable && can(P.entregasAtribuir) && d.payment_status !== "pago" && d.payment_status !== "aprovado" && (
                  <AssignControl delivery={d} motoboys={motoboys} onDone={refresh} />
                )}
                {editable && can(P.entregasEditar) && d.status === "pendente" && (
                  <StatusButton id={d.id} status="em_andamento" label="Em andamento" icon={<Bike />} onDone={refresh} />
                )}
                {editable && can(P.entregasEditar) && (d.status === "pendente" || d.status === "em_andamento") && (
                  <StatusButton id={d.id} status="entregue" label="Marcar como entregue" icon={<CheckCircle2 />} onDone={refresh} confirm />
                )}
                {!closed && d.status === "entregue" && can(P.entregasCorrigir) && d.payment_status !== "pago" && d.payment_status !== "aprovado" && (
                  <ConfirmButton
                    variant="outline"
                    title="Corrigir confirmação"
                    description="A entrega voltará para pendente. A correção fica registrada no histórico."
                    reasonLabel="Motivo da correção"
                    reasonMinLength={5}
                    onConfirm={async (reason) => {
                      const r = await setDeliveryStatus(d.id, "pendente", reason)
                      if (!r.ok) {
                        toast.error(r.error)
                        return false
                      }
                      toast.success(r.message ?? "Corrigido.")
                      await refresh()
                    }}
                  >
                    <Undo2 /> Corrigir confirmação
                  </ConfirmButton>
                )}
                {!closed && can(P.entregasExcluir) && d.status !== "cancelada" && d.payment_status !== "pago" && d.payment_status !== "aprovado" && (
                  <ConfirmButton
                    variant="destructive"
                    title="Cancelar entrega"
                    description="A entrega deixará de contar nos totais e no fechamento."
                    reasonLabel="Motivo do cancelamento"
                    reasonMinLength={3}
                    confirmLabel="Cancelar entrega"
                    onConfirm={async (reason) => {
                      const r = await setDeliveryStatus(d.id, "cancelada", reason)
                      if (!r.ok) {
                        toast.error(r.error)
                        return false
                      }
                      toast.success(r.message ?? "Cancelada.")
                      await refresh()
                    }}
                  >
                    <Ban /> Cancelar
                  </ConfirmButton>
                )}
                {!closed && can(P.entregasExcluir) && d.status === "cancelada" && (
                  <ConfirmButton
                    variant="outline"
                    title="Reativar entrega"
                    description="A entrega volta como pendente."
                    onConfirm={async () => {
                      const r = await setDeliveryStatus(d.id, "pendente")
                      if (!r.ok) {
                        toast.error(r.error)
                        return false
                      }
                      toast.success(r.message ?? "Reativada.")
                      await refresh()
                    }}
                  >
                    <RotateCcw /> Reativar
                  </ConfirmButton>
                )}
                {closed && can(P.fechamentosCorrigir) && <ClosedCorrection delivery={d} onDone={refresh} />}
              </div>
            </TabsContent>

            <TabsContent value="valores" className="space-y-4">
              {showMoney && (
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Money label="Cobrança (área)" value={d.charge_amount} />
                  <Money label="Extras cobrados" value={d.extras_charge_total} />
                  <Money label="Total cobrado" value={d.charge_total} strong />
                  <Money label="Repasse (área)" value={d.repass_amount} />
                  <Money label="Extras de repasse" value={d.extras_repass_total} />
                  <Money label="Total bruto" value={d.repass_gross} />
                  <Money label="Ajustes / descontos" value={d.adjustments_total} />
                  <Money label="Líquido a pagar" value={d.repass_net} strong />
                </div>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#e8c98e]">Lançamentos</h3>
                {extras.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum extra lançado.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border text-sm">
                    {extras.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <div className={x.canceled_at ? "opacity-50 line-through" : ""}>
                          <span className="font-medium">{x.description}</span>{" "}
                          <Badge tone={x.kind === "desconto" ? "danger" : x.kind === "automatico" ? "info" : "gold"}>
                            {EXTRA_KIND[x.kind]}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTimeBR(x.created_at)}
                            {x.canceled_at && ` · cancelado: ${x.cancel_reason}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {showMoney && (
                            <span className="text-right text-xs tabular-nums">
                              cobra {formatBRL(x.charge_amount)}
                              <br />
                              repasse {formatBRL(x.repass_amount)}
                            </span>
                          )}
                          {!x.canceled_at && editable && can(P.extrasEditar) && x.kind !== "automatico" && d.payment_status !== "pago" && d.payment_status !== "aprovado" && (
                            <ConfirmButton
                              size="sm"
                              variant="ghost"
                              title="Cancelar lançamento"
                              reasonLabel="Motivo"
                              reasonMinLength={3}
                              onConfirm={async (reason) => {
                                const r = await cancelExtra(x.id, reason)
                                if (!r.ok) {
                        toast.error(r.error)
                        return false
                      }
                                toast.success(r.message ?? "Cancelado.")
                                await refresh()
                              }}
                            >
                              <Ban />
                            </ConfirmButton>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {editable && (can(P.extrasCriar) || can(P.financeiroAjustar)) && d.payment_status !== "pago" && d.payment_status !== "aprovado" && (
                <ExtraForm deliveryId={d.id} onDone={refresh} />
              )}
            </TabsContent>

            <TabsContent value="historico">
              <ol className="relative space-y-3 border-l border-border pl-4 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-[#800020]" />
                    <div className="flex flex-wrap items-center gap-2">
                      <History className="size-3.5 text-[#b48a4a]" />
                      {h.from_status
                        ? `${DELIVERY_STATUS[h.from_status as keyof typeof DELIVERY_STATUS]?.label ?? h.from_status} → `
                        : "Cadastro → "}
                      <strong>{DELIVERY_STATUS[h.to_status as keyof typeof DELIVERY_STATUS]?.label ?? h.to_status}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTimeBR(h.changed_at)}
                      {h.changed_by && names[h.changed_by] ? ` · ${names[h.changed_by]}` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="conferencia" className="space-y-4">
              {conferences.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conferência registrada.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {conferences.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="flex items-center gap-2">
                        <ConferenceStatusBadge status={c.status} />
                        {c.divergence_count > 0 && <Badge tone="danger">{c.divergence_count} divergência(s)</Badge>}
                        <span className="text-xs text-muted-foreground">{formatDateTimeBR(c.created_at)}</span>
                      </span>
                      {can(P.conferenciaVer) && (
                        <Link className="text-xs text-[#d4af37] underline" href={`/app/conferencia?id=${c.id}`}>
                          Abrir
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) =>
                    p.url ? (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="Foto da comanda" className="aspect-[3/4] w-full rounded-md object-cover" />
                      </a>
                    ) : null,
                  )}
                </div>
              )}
              {can(P.conferenciaCriar) && (
                <Button asChild variant="outline">
                  <Link href={`/app/fotos?entrega=${d.id}&comanda=${encodeURIComponent(d.comanda_number)}`}>
                    <Plus /> Conferir por foto
                  </Link>
                </Button>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${strong ? "font-bold text-[#d4af37]" : ""}`}>{formatBRL(value)}</div>
    </div>
  )
}

function StatusButton({
  id,
  status,
  label,
  icon,
  onDone,
  confirm,
}: {
  id: string
  status: "em_andamento" | "entregue"
  label: string
  icon: React.ReactNode
  onDone: () => Promise<void>
  confirm?: boolean
}) {
  const [pending, setPending] = useState(false)
  const run = async () => {
    const r = await setDeliveryStatus(id, status)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.message ?? "Atualizado.")
    await onDone()
  }
  if (confirm) {
    return (
      <ConfirmButton variant="secondary" title={`${label}?`} description="O registro fica no histórico da entrega." onConfirm={run}>
        {icon} {label}
      </ConfirmButton>
    )
  }
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await run()
        setPending(false)
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : icon} {label}
    </Button>
  )
}

function AssignControl({ delivery, motoboys, onDone }: { delivery: DeliveryRow; motoboys: Motoboy[]; onDone: () => Promise<void> }) {
  const [value, setValue] = useState(delivery.motoboy_id ?? "")
  const [pending, setPending] = useState(false)
  const changed = value !== (delivery.motoboy_id ?? "")
  return (
    <div className="flex items-center gap-2">
      <NativeSelect value={value} onChange={(e) => setValue(e.target.value)} className="w-48" aria-label="Motoboy">
        <option value="">Sem motoboy</option>
        {motoboys
          .filter((m) => m.active || m.id === delivery.motoboy_id)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </NativeSelect>
      <Button
        variant="secondary"
        disabled={!changed || pending}
        onClick={async () => {
          setPending(true)
          const r = await assignDelivery(delivery.id, value || null)
          setPending(false)
          if (!r.ok) return toast.error(r.error)
          toast.success(r.message ?? "Atribuído.")
          await onDone()
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Bike />}
        {delivery.motoboy_id ? "Reatribuir" : "Atribuir"}
      </Button>
    </div>
  )
}

function ExtraForm({ deliveryId, onDone }: { deliveryId: string; onDone: () => Promise<void> }) {
  const can = useCan()
  const kinds = [
    can(P.extrasCriar) && { value: "manual", label: "Extra manual" },
    can(P.financeiroAjustar) && { value: "ajuste", label: "Ajuste autorizado" },
    can(P.financeiroAjustar) && { value: "desconto", label: "Desconto autorizado" },
  ].filter(Boolean) as Array<{ value: "manual" | "ajuste" | "desconto"; label: string }>
  const [kind, setKind] = useState(kinds[0]?.value ?? "manual")
  const [description, setDescription] = useState("")
  const [charge, setCharge] = useState("")
  const [repass, setRepass] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    let c = parseMoneyInput(charge || "0") ?? NaN
    let r = parseMoneyInput(repass || "0") ?? NaN
    if (Number.isNaN(c) || Number.isNaN(r)) return toast.error("Valores inválidos.")
    if (kind === "desconto") {
      c = -Math.abs(c)
      r = -Math.abs(r)
    }
    setPending(true)
    const result = await addExtra({ delivery_id: deliveryId, kind, description, charge_amount: c, repass_amount: r })
    setPending(false)
    if (!result.ok) return toast.error(result.error)
    toast.success(result.message ?? "Lançado.")
    setDescription("")
    setCharge("")
    setRepass("")
    await onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold text-[#e8c98e]">Novo lançamento</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo">
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
        <Input placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-3" />
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Valor cobrado (R$)</Label>
          <Input inputMode="decimal" placeholder="0,00" value={charge} onChange={(e) => setCharge(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Valor de repasse (R$)</Label>
          <Input inputMode="decimal" placeholder="0,00" value={repass} onChange={(e) => setRepass(e.target.value)} />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={pending || description.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Lançar
          </Button>
        </div>
      </div>
      {kind === "ajuste" && <p className="text-xs text-muted-foreground">Ajustes aceitam valores positivos ou negativos.</p>}
      {kind === "desconto" && <p className="text-xs text-muted-foreground">Descontos são registrados como valores negativos.</p>}
    </form>
  )
}

function ClosedCorrection({ delivery, onDone }: { delivery: DeliveryRow; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState(delivery.address)
  const [number, setNumber] = useState(delivery.address_number ?? "")
  const [neighborhood, setNeighborhood] = useState(delivery.neighborhood ?? "")
  const [notes, setNotes] = useState(delivery.notes ?? "")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)

  async function submit() {
    const changes: Record<string, unknown> = {}
    if (address !== delivery.address) changes.address = address
    if (number !== (delivery.address_number ?? "")) changes.address_number = number || null
    if (neighborhood !== (delivery.neighborhood ?? "")) changes.neighborhood = neighborhood || null
    if (notes !== (delivery.notes ?? "")) changes.notes = notes || null
    if (!Object.keys(changes).length) return toast.error("Nenhuma alteração informada.")
    setPending(true)
    const r = await correctClosedDelivery(delivery.id, changes, reason)
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Corrigido.")
    setOpen(false)
    await onDone()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ShieldAlert /> Correção pós-fechamento
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correção em período encerrado</DialogTitle>
            <DialogDescription>
              Exige justificativa. A alteração e o motivo ficam registrados na auditoria e no fechamento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Endereço</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Número</Label>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Bairro</Label>
                <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="grid gap-1.5">
              <Label>Justificativa (mín. 10 caracteres)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={pending || reason.trim().length < 10}>
                {pending && <Loader2 className="animate-spin" />} Registrar correção
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MapLink({ d }: { d: DeliveryRow }) {
  if (d.latitude == null) return null
  return (
    <Link href={`/app/mapa?entrega=${d.id}`} className="inline-flex items-center gap-1 text-xs text-[#d4af37]">
      <MapPin className="size-3" /> mapa
    </Link>
  )
}
