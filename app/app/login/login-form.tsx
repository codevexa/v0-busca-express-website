"use client"

import { Eye, EyeOff, Loader2, LogIn } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/ossala/logo"

export function LoginForm({
  logoUrl,
  companyName,
  errorCode,
}: {
  logoUrl: string | null
  companyName: string
  errorCode: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()
  // Estados separados e componentes estáveis: digitar a matrícula nunca move o foco.
  const [matricula, setMatricula] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(
    errorCode === "link"
      ? "O link de recuperação é inválido ou expirou."
      : errorCode === "inativo"
        ? "Seu acesso está desativado ou sem empresa ativa. Procure o administrador."
        : null,
  )
  const [recoverOpen, setRecoverOpen] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    if (!matricula.trim() || !password) {
      setError("Informe a matrícula e a senha.")
      return
    }
    setPending(true)
    try {
      const next = params.get("next")
      const res = await fetch(`/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula: matricula.trim(), password }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string }
      if (!res.ok || !json.redirect) {
        setError(json.error ?? "Não foi possível entrar. Tente novamente.")
        setPending(false)
        return
      }
      router.replace(json.redirect)
      router.refresh()
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.")
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo url={logoUrl} name={companyName} size="lg" className="flex-col" />
        <p className="text-sm tracking-wide text-[#e8c98e]/80">Controle de Entregas</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[#2e2427] bg-[#141012] p-6 shadow-2xl" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="matricula">Matrícula</Label>
          <Input
            id="matricula"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            disabled={pending}
            aria-invalid={!!error && !matricula.trim()}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <Button type="submit" className="bg-ossala-gradient h-11 w-full text-base" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          Entrar
        </Button>

        <button
          type="button"
          onClick={() => setRecoverOpen(true)}
          className="w-full text-center text-sm text-[#d4af37] hover:underline"
        >
          Esqueci minha senha
        </button>
      </form>

      <RecoverDialog open={recoverOpen} onOpenChange={setRecoverOpen} initialMatricula={matricula} />
      <p className="mt-6 text-center text-xs text-muted-foreground">OSSALA - BUSCAR EXPRESS</p>
    </div>
  )
}

function RecoverDialog({
  open,
  onOpenChange,
  initialMatricula,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialMatricula: string
}) {
  const [matricula, setMatricula] = useState(initialMatricula)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (pending || !matricula.trim()) return
    setPending(true)
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula }),
      })
      const json = (await res.json()) as { message?: string }
      setMessage(json.message ?? "Solicitação registrada.")
    } catch {
      setMessage("Falha de conexão. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (o) {
          setMatricula(initialMatricula)
          setMessage(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recuperar acesso</DialogTitle>
          <DialogDescription>
            Se sua conta tiver um e-mail de recuperação, enviaremos um link. Caso contrário, o administrador pode
            definir uma senha provisória para você.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="recover-matricula">Matrícula</Label>
          <Input id="recover-matricula" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        </div>
        {message && <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={submit} disabled={pending || !matricula.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            Solicitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
