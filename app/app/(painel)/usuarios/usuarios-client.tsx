"use client"

import { KeyRound, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, UserPlus } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { invalidateCatalog, useCatalog } from "@/hooks/use-catalog"
import { createUser, resetUserPassword, setRoleOverrides, setUserPermissions, updateUser } from "@/lib/actions/users"
import { formatDateTimeBR } from "@/lib/dates"
import { ROLE_LABELS, type Role } from "@/lib/domain"
import { friendlyError } from "@/lib/errors"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface UserRow {
  id: string
  matricula: string
  nome: string
  role: Role
  ativo: boolean
  phone: string | null
  email: string | null
  last_login_at: string | null
  must_change_password: boolean
  created_at: string
}

interface Permission {
  key: string
  module: string
  action: string
  label: string
  sort_order: number
}

type Tri = boolean | null

export function UsuariosClient({ adminConfigured }: { adminConfigured: boolean }) {
  const can = useCan()
  const { session } = useSession()
  const canManage = can(P.usuariosGerenciar)
  const [users, setUsers] = useState<UserRow[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [roleDefaults, setRoleDefaults] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [resetting, setResetting] = useState<UserRow | null>(null)
  const [permUser, setPermUser] = useState<UserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserSupabase()
    const [u, p, rp] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, matricula, nome, role, ativo, phone, email, last_login_at, must_change_password, created_at")
        .eq("company_id", session.company.id)
        .order("nome"),
      supabase.from("permissions").select("key, module, action, label, sort_order").eq("is_legacy", false).order("sort_order"),
      supabase.from("role_permissions").select("role, permission_key"),
    ])
    const err = u.error ?? p.error ?? rp.error
    if (err) setError(friendlyError(err))
    else {
      setUsers((u.data ?? []) as UserRow[])
      setPermissions((p.data ?? []) as Permission[])
      const defaults: Record<string, Set<string>> = {}
      for (const r of rp.data ?? []) (defaults[r.role] ??= new Set()).add(r.permission_key)
      setRoleDefaults(defaults)
      setError(null)
    }
    setLoading(false)
  }, [session.company.id])

  useEffect(() => {
    load()
  }, [load])

  const filtered = users.filter(
    (u) => u.nome.toLowerCase().includes(search.toLowerCase()) || u.matricula.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Contas de acesso por matrícula, funções e permissões."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
            </Button>
            {canManage && (
              <Button onClick={() => setCreating(true)} disabled={!adminConfigured}>
                <UserPlus /> Novo usuário
              </Button>
            )}
          </>
        }
      />
      {canManage && !adminConfigured && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Para criar usuários e redefinir senhas, configure <code>SUPABASE_SERVICE_ROLE_KEY</code> nas variáveis de ambiente do
          servidor (Vercel). A chave nunca é enviada ao navegador.
        </p>
      )}

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          {canManage && <TabsTrigger value="papeis">Permissões por função</TabsTrigger>}
        </TabsList>
        <TabsContent value="usuarios">
          <Input placeholder="Buscar por nome ou matrícula" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 max-w-sm" />
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 && !loading ? (
            <EmptyState title="Nenhum usuário" />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.nome}
                        {u.id === session.user_id && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
                        {u.must_change_password && <div className="text-xs text-amber-200">Troca de senha pendente</div>}
                      </TableCell>
                      <TableCell>{u.matricula}</TableCell>
                      <TableCell>
                        <Badge tone={u.role === "ADMIN" ? "gold" : u.role === "MOTOBOY" ? "info" : "outline"}>{ROLE_LABELS[u.role]}</Badge>
                      </TableCell>
                      <TableCell>{u.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</TableCell>
                      <TableCell className="text-xs">{u.last_login_at ? formatDateTimeBR(u.last_login_at) : "—"}</TableCell>
                      <TableCell className="text-right">
                        {canManage && u.id !== session.user_id && (u.role !== "ADMIN" || session.role === "ADMIN") && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                              <Pencil /> Editar
                            </Button>
                            {u.role !== "ADMIN" && (
                              <Button size="sm" variant="ghost" onClick={() => setPermUser(u)}>
                                <ShieldCheck /> Permissões
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setResetting(u)} disabled={!adminConfigured}>
                              <KeyRound /> Senha
                            </Button>
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
        {canManage && (
          <TabsContent value="papeis">
            <RoleOverrides permissions={permissions} roleDefaults={roleDefaults} />
          </TabsContent>
        )}
      </Tabs>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} onSaved={load} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={load} />
      <UserPermissionsDialog user={permUser} permissions={permissions} roleDefaults={roleDefaults} onClose={() => setPermUser(null)} />
    </>
  )
}

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
  const digits = "23456789"
  const bytes = crypto.getRandomValues(new Uint32Array(10))
  let out = ""
  for (let i = 0; i < 7; i++) out += chars[bytes[i] % chars.length]
  for (let i = 7; i < 10; i++) out += digits[bytes[i] % digits.length]
  return out
}

function CreateUserDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { session } = useSession()
  const { motoboys } = useCatalog()
  const [form, setForm] = useState({ nome: "", matricula: "", role: "MOTOBOY" as Role, password: "", phone: "", recovery_email: "", motoboy_id: "", must_change_password: true })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (open) setForm({ nome: "", matricula: "", role: "MOTOBOY", password: generatePassword(), phone: "", recovery_email: "", motoboy_id: "", must_change_password: true })
  }, [open])
  const unlinked = motoboys.filter((m) => !m.profile_id && m.active)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    const r = await createUser({ ...form, motoboy_id: form.role === "MOTOBOY" ? form.motoboy_id || null : null })
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(`Usuário criado. Matrícula ${form.matricula} · senha provisória ${form.password}`, { duration: 15000 })
    invalidateCatalog()
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>O acesso é feito com matrícula e senha. Anote a senha provisória para entregar ao usuário.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Matrícula *</Label>
              <Input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} required autoCapitalize="none" />
            </div>
            <div className="grid gap-1.5">
              <Label>Função *</Label>
              <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABELS) as Role[])
                  .filter((r) => r !== "ADMIN" || session.role === "ADMIN")
                  .map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
              </NativeSelect>
            </div>
          </div>
          {form.role === "MOTOBOY" && (
            <div className="grid gap-1.5">
              <Label>Cadastro de motoboy</Label>
              <NativeSelect value={form.motoboy_id} onChange={(e) => setForm({ ...form, motoboy_id: e.target.value })}>
                <option value="">Criar novo cadastro com este nome</option>
                {unlinked.map((m) => (
                  <option key={m.id} value={m.id}>
                    Vincular a: {m.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Senha provisória *</Label>
            <div className="flex gap-2">
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: generatePassword() })}>
                Gerar
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail de recuperação</Label>
              <Input type="email" value={form.recovery_email} onChange={(e) => setForm({ ...form, recovery_email: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.must_change_password} onCheckedChange={(v) => setForm({ ...form, must_change_password: v })} />
            Exigir troca de senha no primeiro acesso
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const { session } = useSession()
  const [form, setForm] = useState({ nome: "", role: "MOTOBOY" as Role, phone: "", ativo: true })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (user) setForm({ nome: user.nome, role: user.role, phone: user.phone ?? "", ativo: user.ativo })
  }, [user])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || pending) return
    if (!form.ativo && user.ativo && !confirm(`Desativar ${user.nome}? O acesso será bloqueado imediatamente.`)) return
    setPending(true)
    const r = await updateUser({ id: user.id, ...form, phone: form.phone || null })
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    invalidateCatalog()
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>Matrícula {user?.matricula}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Função</Label>
              <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABELS) as Role[])
                  .filter((r) => r !== "ADMIN" || session.role === "ADMIN")
                  .map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /> Usuário ativo
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

function ResetPasswordDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("")
  const [mustChange, setMustChange] = useState(true)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (user) {
      setPassword(generatePassword())
      setMustChange(true)
    }
  }, [user])
  async function submit() {
    if (!user || pending) return
    setPending(true)
    const r = await resetUserPassword(user.id, password, mustChange)
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(`Senha redefinida. Nova senha provisória: ${password}`, { duration: 15000 })
    onSaved()
    onClose()
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            {user?.nome} (matrícula {user?.matricula}). A senha atual deixa de funcionar imediatamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="outline" onClick={() => setPassword(generatePassword())}>
              Gerar
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={mustChange} onCheckedChange={setMustChange} /> Exigir troca no próximo acesso
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function groupByModule(permissions: Permission[]) {
  const map = new Map<string, Permission[]>()
  for (const p of permissions) map.set(p.module, [...(map.get(p.module) ?? []), p])
  return [...map.entries()]
}

function TriSelect({ value, onChange, effective }: { value: Tri; onChange: (v: Tri) => void; effective: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        value={value === null ? "" : value ? "1" : "0"}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "1")}
        className="h-8 w-40 text-xs"
      >
        <option value="">Padrão da função</option>
        <option value="1">Conceder</option>
        <option value="0">Revogar</option>
      </NativeSelect>
      <span className={cn("text-xs", effective ? "text-emerald-300" : "text-muted-foreground")}>{effective ? "Permitido" : "Negado"}</span>
    </div>
  )
}

function UserPermissionsDialog({
  user,
  permissions,
  roleDefaults,
  onClose,
}: {
  user: UserRow | null
  permissions: Permission[]
  roleDefaults: Record<string, Set<string>>
  onClose: () => void
}) {
  const { session } = useSession()
  const [overrides, setOverrides] = useState<Record<string, Tri>>({})
  const [original, setOriginal] = useState<Record<string, Tri>>({})
  const [roleOverrides, setRoleOverridesState] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = getBrowserSupabase()
    Promise.all([
      supabase.from("user_permissions").select("permission_key, allowed").eq("user_id", user.id),
      supabase.from("company_role_overrides").select("permission_key, allowed").eq("company_id", session.company.id).eq("role", user.role),
    ]).then(([u, r]) => {
      const map: Record<string, Tri> = {}
      for (const row of u.data ?? []) map[row.permission_key] = row.allowed
      setOverrides(map)
      setOriginal(map)
      setRoleOverridesState(Object.fromEntries((r.data ?? []).map((x) => [x.permission_key, x.allowed])))
    })
  }, [user, session.company.id])

  const roleAllows = (key: string) => (key in roleOverrides ? roleOverrides[key] : !!roleDefaults[user?.role ?? ""]?.has(key))

  async function save() {
    if (!user || pending) return
    const changes: Record<string, Tri> = {}
    for (const p of permissions) {
      const now = overrides[p.key] ?? null
      const before = original[p.key] ?? null
      if (now !== before) changes[p.key] = now
    }
    if (!Object.keys(changes).length) return onClose()
    setPending(true)
    const r = await setUserPermissions(user.id, changes)
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    onClose()
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Permissões de {user?.nome}</DialogTitle>
          <DialogDescription>
            Função: {user ? ROLE_LABELS[user.role] : ""}. Ajustes individuais prevalecem sobre o padrão da função. As permissões
            também são verificadas no servidor e no banco de dados.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
          {groupByModule(permissions).map(([module, list]) => (
            <section key={module}>
              <h3 className="mb-1 text-sm font-semibold text-[#e8c98e]">{module}</h3>
              <ul className="divide-y divide-border rounded-md border border-border">
                {list.map((p) => {
                  const value = overrides[p.key] ?? null
                  const effective = value === null ? roleAllows(p.key) : value
                  return (
                    <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span>{p.label}</span>
                      <TriSelect value={value} effective={effective} onChange={(v) => setOverrides((o) => ({ ...o, [p.key]: v }))} />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salvar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RoleOverrides({ permissions, roleDefaults }: { permissions: Permission[]; roleDefaults: Record<string, Set<string>> }) {
  const { session } = useSession()
  const [role, setRole] = useState<"GESTOR" | "ADMINISTRATIVO" | "MOTOBOY">("ADMINISTRATIVO")
  const [overrides, setOverrides] = useState<Record<string, Tri>>({})
  const [original, setOriginal] = useState<Record<string, Tri>>({})
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const { data } = await getBrowserSupabase()
      .from("company_role_overrides")
      .select("permission_key, allowed")
      .eq("company_id", session.company.id)
      .eq("role", role)
    const map: Record<string, Tri> = Object.fromEntries((data ?? []).map((r) => [r.permission_key, r.allowed]))
    setOverrides(map)
    setOriginal(map)
  }, [role, session.company.id])

  useEffect(() => {
    load()
  }, [load])

  const grouped = useMemo(() => groupByModule(permissions), [permissions])

  async function save() {
    if (pending) return
    const changes: Record<string, Tri> = {}
    for (const p of permissions) {
      const now = overrides[p.key] ?? null
      if (now !== (original[p.key] ?? null)) changes[p.key] = now
    }
    if (!Object.keys(changes).length) return toast.info("Nenhuma alteração.")
    setPending(true)
    const r = await setRoleOverrides(role, changes)
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-56">
          <option value="GESTOR">Gestor</option>
          <option value="ADMINISTRATIVO">Administrativo</option>
          <option value="MOTOBOY">Motoboy</option>
        </NativeSelect>
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar
        </Button>
        <span className="text-xs text-muted-foreground">O Administrador sempre tem acesso completo.</span>
      </div>
      {grouped.map(([module, list]) => (
        <section key={module} className="rounded-xl border border-border bg-card p-3">
          <h3 className="mb-1 text-sm font-semibold text-[#e8c98e]">{module}</h3>
          <ul className="divide-y divide-border">
            {list.map((p) => {
              const value = overrides[p.key] ?? null
              const effective = value === null ? !!roleDefaults[role]?.has(p.key) : value
              return (
                <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                  <span>
                    {p.label}
                    <span className="ml-2 text-xs text-muted-foreground">padrão: {roleDefaults[role]?.has(p.key) ? "sim" : "não"}</span>
                  </span>
                  <TriSelect value={value} effective={effective} onChange={(v) => setOverrides((o) => ({ ...o, [p.key]: v }))} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
