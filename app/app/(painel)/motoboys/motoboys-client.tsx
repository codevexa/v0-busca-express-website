"use client"

import { Bike, Loader2, Pencil, Plus, UserCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan } from "@/components/ossala/session-provider"
import { invalidateCatalog, useCatalog } from "@/hooks/use-catalog"
import { saveMotoboy } from "@/lib/actions/catalog"
import type { Motoboy } from "@/lib/domain"
import { P } from "@/lib/permissions"

export function MotoboysClient() {
  const can = useCan()
  const { motoboys, loading, reload } = useCatalog()
  const [editing, setEditing] = useState<Motoboy | "novo" | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const list = motoboys.filter((m) => showInactive || m.active)

  return (
    <>
      <PageHeader
        title="Motoboys"
        description="Cadastro administrativo dos motoboys. O acesso ao aplicativo é criado em Usuários (perfil Motoboy)."
        actions={
          can(P.motoboysCriar) && (
            <Button onClick={() => setEditing("novo")}>
              <Plus /> Novo motoboy
            </Button>
          )
        }
      />
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Switch id="inativos" checked={showInactive} onCheckedChange={setShowInactive} />
        <Label htmlFor="inativos">Mostrar inativos</Label>
      </div>
      {list.length === 0 && !loading ? (
        <EmptyState icon={Bike} title="Nenhum motoboy cadastrado" />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Veículo / placa</TableHead>
                <TableHead>Acesso ao app</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.phone ?? "—"}</TableCell>
                  <TableCell>{[m.vehicle, m.plate].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell>
                    {m.profile_id ? (
                      <Badge tone="success">
                        <UserCheck /> Vinculado
                      </Badge>
                    ) : (
                      <Badge tone="muted">Sem usuário</Badge>
                    )}
                  </TableCell>
                  <TableCell>{m.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {can(P.motoboysEditar) && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                        <Pencil /> Editar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <MotoboyDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidateCatalog()
          reload()
        }}
      />
    </>
  )
}

function MotoboyDialog({ value, onClose, onSaved }: { value: Motoboy | "novo" | null; onClose: () => void; onSaved: () => void }) {
  const m = value && value !== "novo" ? value : null
  const [form, setForm] = useState({ name: "", phone: "", document: "", vehicle: "", plate: "", pix_key: "", notes: "", active: true })
  const [pending, setPending] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = value === "novo" ? "novo" : (m?.id ?? null)
  if (key !== lastKey) {
    setLastKey(key)
    setForm({
      name: m?.name ?? "",
      phone: m?.phone ?? "",
      document: m?.document ?? "",
      vehicle: m?.vehicle ?? "",
      plate: m?.plate ?? "",
      pix_key: m?.pix_key ?? "",
      notes: m?.notes ?? "",
      active: m?.active ?? true,
    })
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    const r = await saveMotoboy({ ...form, id: m?.id })
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
          <DialogTitle>{m ? "Editar motoboy" : "Novo motoboy"}</DialogTitle>
          <DialogDescription>Dados usados na atribuição de entregas, pagamentos e relatórios.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mb-name">Nome *</Label>
            <Input id="mb-name" value={form.name} onChange={set("name")} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mb-phone">Telefone</Label>
              <Input id="mb-phone" value={form.phone} onChange={set("phone")} inputMode="tel" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-doc">Documento</Label>
              <Input id="mb-doc" value={form.document} onChange={set("document")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-vehicle">Veículo</Label>
              <Input id="mb-vehicle" value={form.vehicle} onChange={set("vehicle")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-plate">Placa</Label>
              <Input id="mb-plate" value={form.plate} onChange={set("plate")} className="uppercase" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mb-pix">Chave PIX</Label>
            <Input id="mb-pix" value={form.pix_key} onChange={set("pix_key")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mb-notes">Observações</Label>
            <Textarea id="mb-notes" value={form.notes} onChange={set("notes")} rows={2} />
          </div>
          {m && (
            <div className="flex items-center gap-2">
              <Switch id="mb-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label htmlFor="mb-active">Ativo (inativos não recebem novas entregas)</Label>
            </div>
          )}
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
