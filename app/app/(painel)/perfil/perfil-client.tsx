"use client"

import { KeyRound, Loader2, Save } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ossala/page-header"
import { useSession } from "@/components/ossala/session-provider"
import { changeOwnPassword, updateOwnProfile } from "@/lib/actions/account"
import { ROLE_LABELS } from "@/lib/domain"
import { homeFor } from "@/lib/permissions"

export function PerfilClient() {
  const { session } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const forceChange = session.must_change_password || params.get("trocar-senha") === "1"
  const [nome, setNome] = useState(session.nome)
  const [phone, setPhone] = useState(session.phone ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (savingProfile) return
    setSavingProfile(true)
    const r = await updateOwnProfile({ nome, phone: phone || null })
    setSavingProfile(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Salvo.")
    router.refresh()
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (savingPassword) return
    setSavingPassword(true)
    const r = await changeOwnPassword({ current, password, confirm })
    setSavingPassword(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Senha alterada.")
    setCurrent("")
    setPassword("")
    setConfirm("")
    if (session.must_change_password) {
      router.replace(homeFor(session.role))
    }
    router.refresh()
  }

  return (
    <>
      <PageHeader title="Meu perfil" description={`${ROLE_LABELS[session.role]} · matrícula ${session.matricula} · ${session.company.name}`} />
      {forceChange && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Defina uma nova senha para continuar usando o sistema.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold text-[#e8c98e]">Dados pessoais</h2>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-nome">Nome</Label>
            <Input id="pf-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-phone">Telefone</Label>
            <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="grid gap-1.5">
            <Label>Matrícula</Label>
            <Input value={session.matricula} disabled />
          </div>
          <Button type="submit" disabled={savingProfile || forceChange}>
            {savingProfile ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </form>

        <form onSubmit={savePassword} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold text-[#e8c98e]">Alterar senha</h2>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-current">Senha atual</Label>
            <Input id="pf-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-new">Nova senha</Label>
            <Input id="pf-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="text-xs text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-confirm">Confirmar nova senha</Label>
            <Input id="pf-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? <Loader2 className="animate-spin" /> : <KeyRound />} Alterar senha
          </Button>
        </form>
      </div>
    </>
  )
}
