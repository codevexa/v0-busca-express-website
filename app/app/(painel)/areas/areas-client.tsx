"use client"

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { EmptyState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan } from "@/components/ossala/session-provider"
import { invalidateCatalog, useCatalog } from "@/hooks/use-catalog"
import { removeNeighborhood, saveArea, saveExtraRule, saveNeighborhood } from "@/lib/actions/catalog"
import { formatDateTimeBR } from "@/lib/dates"
import type { Area, ExtraRule, Neighborhood } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { formatBRL, parseMoneyInput } from "@/lib/money"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function AreasClient() {
  const can = useCan()
  const canEdit = can(P.areasEditar)
  const showMoney = can(P.financeiroVer) || canEdit
  const { areas, neighborhoods, reload } = useCatalog()
  const [areaEdit, setAreaEdit] = useState<Area | "nova" | null>(null)
  const [nbEdit, setNbEdit] = useState<Neighborhood | "novo" | null>(null)
  const [rules, setRules] = useState<ExtraRule[]>([])
  const [ruleEdit, setRuleEdit] = useState<ExtraRule | "nova" | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; area_id: string; fee: number; repass_amount: number | null; valid_from: string; valid_to: string | null }>>([])
  const [nbFilter, setNbFilter] = useState("")

  const refresh = useCallback(() => {
    invalidateCatalog()
    reload()
  }, [reload])

  const loadRules = useCallback(async () => {
    const supabase = getBrowserSupabase()
    const { data, error } = await supabase.from("extra_rules").select("*").order("sort_order").order("name")
    if (error) toast.error(friendlyError(error))
    setRules(((data ?? []) as ExtraRule[]).map((r) => ({ ...r, charge_amount: Number(r.charge_amount), repass_amount: Number(r.repass_amount) })))
    if (can(P.financeiroVer)) {
      const { data: h } = await supabase.from("delivery_fee_history").select("*").order("valid_from", { ascending: false }).limit(100)
      setHistory((h ?? []) as typeof history)
    }
  }, [can])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? "Sem área"

  return (
    <>
      <PageHeader
        title="Áreas e cobrança"
        description="Valores de cobrança e repasse por área, bairros associados e regras de extras. Alterações valem para novas entregas; entregas já registradas mantêm os valores da época."
      />
      <Tabs defaultValue="areas">
        <TabsList>
          <TabsTrigger value="areas">Áreas</TabsTrigger>
          <TabsTrigger value="bairros">Bairros</TabsTrigger>
          <TabsTrigger value="regras">Regras de extras</TabsTrigger>
          {can(P.financeiroVer) && <TabsTrigger value="historico">Histórico de valores</TabsTrigger>}
        </TabsList>

        <TabsContent value="areas">
          {canEdit && (
            <Button className="mb-3" onClick={() => setAreaEdit("nova")}>
              <Plus /> Nova área
            </Button>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: a.color }} />
                    <span className="font-semibold">{a.name}</span>
                    {a.is_special && <Badge tone="gold">Especial</Badge>}
                    {!a.active && <Badge tone="muted">Inativa</Badge>}
                  </div>
                  {canEdit && (
                    <Button size="icon-sm" variant="ghost" onClick={() => setAreaEdit(a)} aria-label="Editar área">
                      <Pencil />
                    </Button>
                  )}
                </div>
                {showMoney && (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Valor cobrado</dt>
                      <dd className="font-bold text-[#d4af37]">{formatBRL(a.charge_amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Repasse ao motoboy</dt>
                      <dd className="font-bold text-[#d4af37]">{formatBRL(a.repass_amount)}</dd>
                    </div>
                  </dl>
                )}
                {(a.charge_amount === 0 || a.repass_amount === 0) && a.active && (
                  <p className="mt-2 text-xs text-amber-200">Valores ainda não configurados.</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {neighborhoods.filter((n) => n.area_id === a.id).length} bairro(s) associado(s)
                </p>
                {a.notes && <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bairros">
          <div className="mb-3 flex flex-wrap gap-2">
            <Input placeholder="Filtrar bairro" value={nbFilter} onChange={(e) => setNbFilter(e.target.value)} className="w-56" />
            {canEdit && (
              <Button onClick={() => setNbEdit("novo")}>
                <Plus /> Novo bairro
              </Button>
            )}
          </div>
          {neighborhoods.length === 0 ? (
            <EmptyState title="Nenhum bairro cadastrado" description="Associe bairros a áreas para que as entregas recebam a área automaticamente." />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bairro</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {neighborhoods
                    .filter((n) => n.name.toLowerCase().includes(nbFilter.toLowerCase()))
                    .map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium">{n.name}</TableCell>
                        <TableCell>{n.city ?? "—"}</TableCell>
                        <TableCell>
                          {canEdit ? (
                            <NativeSelect
                              value={n.area_id ?? ""}
                              onChange={async (e) => {
                                const r = await saveNeighborhood({ ...n, area_id: e.target.value || null })
                                if (!r.ok) return toast.error(r.error)
                                toast.success(`Bairro ${n.name} → ${areaName(e.target.value || null)}`)
                                refresh()
                              }}
                              className="w-44"
                              aria-label={`Área de ${n.name}`}
                            >
                              <option value="">Sem área</option>
                              {areas.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </NativeSelect>
                          ) : (
                            areaName(n.area_id)
                          )}
                        </TableCell>
                        <TableCell>{n.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</TableCell>
                        <TableCell className="text-right">
                          {canEdit && (
                            <div className="flex justify-end gap-1">
                              <Button size="icon-sm" variant="ghost" onClick={() => setNbEdit(n)} aria-label="Editar">
                                <Pencil />
                              </Button>
                              <ConfirmButton
                                size="icon-sm"
                                variant="ghost"
                                title={`Remover o bairro ${n.name}?`}
                                description="Entregas já cadastradas mantêm o nome do bairro e a área."
                                confirmLabel="Remover"
                                onConfirm={async () => {
                                  const r = await removeNeighborhood(n.id)
                                  if (!r.ok) {
                                    toast.error(r.error)
                                    return false
                                  }
                                  toast.success(r.message ?? "Removido.")
                                  refresh()
                                }}
                              >
                                <Trash2 />
                              </ConfirmButton>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="regras">
          <p className="mb-3 text-sm text-muted-foreground">
            Regras automáticas são aplicadas pelo banco no cadastro/alteração da entrega (uma única vez por entrega). Regras
            manuais servem de modelo para lançamentos.
          </p>
          {canEdit && (
            <Button className="mb-3" onClick={() => setRuleEdit("nova")}>
              <Plus /> Nova regra
            </Button>
          )}
          {rules.length === 0 ? (
            <EmptyState title="Nenhuma regra de extra" />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regra</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Condições</TableHead>
                    {showMoney && <TableHead className="text-right">Cobrado</TableHead>}
                    {showMoney && <TableHead className="text-right">Repasse</TableHead>}
                    <TableHead>Situação</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.name}
                        {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                      </TableCell>
                      <TableCell>{r.kind === "automatico" ? <Badge tone="info">Automático</Badge> : <Badge tone="gold">Manual</Badge>}</TableCell>
                      <TableCell className="text-xs">{describeConditions(r, areas, neighborhoods)}</TableCell>
                      {showMoney && <TableCell className="text-right tabular-nums">{formatBRL(r.charge_amount)}</TableCell>}
                      {showMoney && <TableCell className="text-right tabular-nums">{formatBRL(r.repass_amount)}</TableCell>}
                      <TableCell>{r.active ? <Badge tone="success">Ativa</Badge> : <Badge tone="muted">Inativa</Badge>}</TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <Button size="icon-sm" variant="ghost" onClick={() => setRuleEdit(r)} aria-label="Editar regra">
                            <Pencil />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {can(P.financeiroVer) && (
          <TabsContent value="historico">
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                    <TableHead className="text-right">Repasse</TableHead>
                    <TableHead>Vigência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{areaName(h.area_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(h.fee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.repass_amount != null ? formatBRL(h.repass_amount) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {formatDateTimeBR(h.valid_from)} → {h.valid_to ? formatDateTimeBR(h.valid_to) : "atual"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <AreaDialog value={areaEdit} onClose={() => setAreaEdit(null)} onSaved={() => (refresh(), loadRules())} />
      <NeighborhoodDialog value={nbEdit} areas={areas} onClose={() => setNbEdit(null)} onSaved={refresh} />
      <RuleDialog value={ruleEdit} areas={areas} neighborhoods={neighborhoods} onClose={() => setRuleEdit(null)} onSaved={loadRules} />
    </>
  )
}

function describeConditions(r: ExtraRule, areas: Area[], neighborhoods: Neighborhood[]) {
  const c = r.conditions ?? {}
  const parts: string[] = []
  if (c.area_ids?.length) parts.push(`Áreas: ${c.area_ids.map((id) => areas.find((a) => a.id === id)?.name ?? "?").join(", ")}`)
  if (c.neighborhood_ids?.length)
    parts.push(`Bairros: ${c.neighborhood_ids.map((id) => neighborhoods.find((n) => n.id === id)?.name ?? "?").join(", ")}`)
  if (c.weekdays?.length) parts.push(`Dias: ${c.weekdays.map((d) => WEEKDAYS[d]).join(", ")}`)
  if (c.start_time && c.end_time) parts.push(`Horário: ${c.start_time}–${c.end_time}`)
  return parts.length ? parts.join(" · ") : r.kind === "automatico" ? "Todas as entregas" : "—"
}

function AreaDialog({ value, onClose, onSaved }: { value: Area | "nova" | null; onClose: () => void; onSaved: () => void }) {
  const a = value && value !== "nova" ? value : null
  const [form, setForm] = useState({ name: "", code: "", color: "#800020", charge: "", repass: "", is_special: false, active: true, notes: "", sort_order: "0" })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!value) return
    setForm({
      name: a?.name ?? "",
      code: a?.code ?? "",
      color: a?.color ?? "#800020",
      charge: a ? String(a.charge_amount).replace(".", ",") : "",
      repass: a ? String(a.repass_amount).replace(".", ",") : "",
      is_special: a?.is_special ?? false,
      active: a?.active ?? true,
      notes: a?.notes ?? "",
      sort_order: String(a?.sort_order ?? 0),
    })
  }, [value, a])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    const charge = parseMoneyInput(form.charge || "0")
    const repass = parseMoneyInput(form.repass || "0")
    if (charge === null || repass === null || charge < 0 || repass < 0) return toast.error("Valores inválidos.")
    setPending(true)
    const r = await saveArea({
      id: a?.id,
      name: form.name,
      code: form.code || null,
      color: form.color,
      charge_amount: charge,
      repass_amount: repass,
      is_special: form.is_special,
      active: form.active,
      notes: form.notes || null,
      sort_order: Number(form.sort_order) || 0,
    })
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a ? `Editar ${a.name}` : "Nova área"}</DialogTitle>
          <DialogDescription>Novos valores passam a valer a partir de agora; entregas já registradas não mudam.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-[1fr_100px_70px] gap-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cor</Label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Valor cobrado (R$)</Label>
              <Input inputMode="decimal" value={form.charge} onChange={(e) => setForm({ ...form, charge: e.target.value })} placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label>Repasse ao motoboy (R$)</Label>
              <Input inputMode="decimal" value={form.repass} onChange={(e) => setForm({ ...form, repass: e.target.value })} placeholder="0,00" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_special} onCheckedChange={(v) => setForm({ ...form, is_special: v })} /> Área especial
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativa
            </label>
            <label className="flex items-center gap-2 text-sm">
              Ordem <Input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="w-16" />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NeighborhoodDialog({
  value,
  areas,
  onClose,
  onSaved,
}: {
  value: Neighborhood | "novo" | null
  areas: Area[]
  onClose: () => void
  onSaved: () => void
}) {
  const n = value && value !== "novo" ? value : null
  const [form, setForm] = useState({ name: "", city: "", area_id: "", active: true })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (value) setForm({ name: n?.name ?? "", city: n?.city ?? "", area_id: n?.area_id ?? "", active: n?.active ?? true })
  }, [value, n])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    const r = await saveNeighborhood({ id: n?.id, name: form.name, city: form.city || null, area_id: form.area_id || null, active: form.active })
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{n ? "Editar bairro" : "Novo bairro"}</DialogTitle>
          <DialogDescription>O bairro informado na entrega é comparado sem acentos e sem diferenciar maiúsculas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Bairro *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid gap-1.5">
            <Label>Cidade</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Área</Label>
            <NativeSelect value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
              <option value="">Sem área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativo
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RuleDialog({
  value,
  areas,
  neighborhoods,
  onClose,
  onSaved,
}: {
  value: ExtraRule | "nova" | null
  areas: Area[]
  neighborhoods: Neighborhood[]
  onClose: () => void
  onSaved: () => void
}) {
  const r = value && value !== "nova" ? value : null
  const [form, setForm] = useState({
    name: "",
    description: "",
    kind: "automatico" as "automatico" | "manual",
    charge: "",
    repass: "",
    active: true,
    area_ids: [] as string[],
    neighborhood_ids: [] as string[],
    weekdays: [] as number[],
    start_time: "",
    end_time: "",
  })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!value) return
    setForm({
      name: r?.name ?? "",
      description: r?.description ?? "",
      kind: r?.kind ?? "automatico",
      charge: r ? String(r.charge_amount).replace(".", ",") : "",
      repass: r ? String(r.repass_amount).replace(".", ",") : "",
      active: r?.active ?? true,
      area_ids: r?.conditions?.area_ids ?? [],
      neighborhood_ids: r?.conditions?.neighborhood_ids ?? [],
      weekdays: r?.conditions?.weekdays ?? [],
      start_time: r?.conditions?.start_time ?? "",
      end_time: r?.conditions?.end_time ?? "",
    })
  }, [value, r])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    const charge = parseMoneyInput(form.charge || "0")
    const repass = parseMoneyInput(form.repass || "0")
    if (charge === null || repass === null) return toast.error("Valores inválidos.")
    setPending(true)
    const res = await saveExtraRule({
      id: r?.id,
      name: form.name,
      description: form.description || null,
      kind: form.kind,
      charge_amount: charge,
      repass_amount: repass,
      active: form.active,
      conditions: {
        area_ids: form.area_ids,
        neighborhood_ids: form.neighborhood_ids,
        weekdays: form.weekdays,
        start_time: form.start_time,
        end_time: form.end_time,
      },
    })
    setPending(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(res.message ?? "Salvo.")
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{r ? "Editar regra de extra" : "Nova regra de extra"}</DialogTitle>
          <DialogDescription>Condições combinadas com "e". Sem condições, a regra automática vale para todas as entregas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-[1fr_160px] gap-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "automatico" | "manual" })}>
                <option value="automatico">Automático</option>
                <option value="manual">Manual (modelo)</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição / regra de aplicação</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Valor cobrado (R$)</Label>
              <Input inputMode="decimal" value={form.charge} onChange={(e) => setForm({ ...form, charge: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Repasse (R$)</Label>
              <Input inputMode="decimal" value={form.repass} onChange={(e) => setForm({ ...form, repass: e.target.value })} />
            </div>
          </div>
          {form.kind === "automatico" && (
            <>
              <div className="grid gap-1.5">
                <Label>Áreas</Label>
                <div className="flex flex-wrap gap-3">
                  {areas.map((a) => (
                    <label key={a.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={form.area_ids.includes(a.id)} onCheckedChange={() => setForm({ ...form, area_ids: toggle(form.area_ids, a.id) })} />
                      {a.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Bairros</Label>
                <div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto">
                  {neighborhoods.map((n) => (
                    <label key={n.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={form.neighborhood_ids.includes(n.id)}
                        onCheckedChange={() => setForm({ ...form, neighborhood_ids: toggle(form.neighborhood_ids, n.id) })}
                      />
                      {n.name}
                    </label>
                  ))}
                  {neighborhoods.length === 0 && <span className="text-xs text-muted-foreground">Nenhum bairro cadastrado.</span>}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((w, i) => (
                    <label key={w} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={form.weekdays.includes(i)} onCheckedChange={() => setForm({ ...form, weekdays: toggle(form.weekdays, i) })} />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>Horário inicial</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Horário final</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativa
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
