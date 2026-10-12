"use client"

import { CheckCircle2, ImageUp, Loader2, Save, Trash2, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmButton } from "@/components/ossala/confirm-button"
import { Logo } from "@/components/ossala/logo"
import { PageHeader } from "@/components/ossala/page-header"
import { useSession } from "@/components/ossala/session-provider"
import { removeLogo, saveCompanyName, saveSettings, uploadLogo } from "@/lib/actions/account"

export function ConfiguracoesClient({
  integrations,
}: {
  integrations: { ocr: boolean; serviceRole: boolean; nominatimEmail: boolean; cronSecret: boolean }
}) {
  const router = useRouter()
  const { session, settings, logoUrl } = useSession()
  const [companyName, setCompanyName] = useState(session.company.name)
  const [form, setForm] = useState({
    store_name: settings?.store_name ?? "",
    store_address: settings?.store_address ?? "",
    store_lat: settings?.store_lat != null ? String(settings.store_lat) : "",
    store_lng: settings?.store_lng != null ? String(settings.store_lng) : "",
    default_city: settings?.default_city ?? "",
    default_state: settings?.default_state ?? "",
    closing_split_day: String(settings?.closing_split_day ?? 15),
    photo_retention_days: String(settings?.photo_retention_days ?? 90),
    pending_alert_minutes: String(settings?.pending_alert_minutes ?? 60),
    report_title: settings?.report_title ?? "OSSALA - BUSCAR EXPRESS",
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const r = await saveSettings({
      ...form,
      store_lat: form.store_lat ? Number(form.store_lat.replace(",", ".")) : null,
      store_lng: form.store_lng ? Number(form.store_lng.replace(",", ".")) : null,
    })
    let r2 = { ok: true as boolean, error: "" }
    if (companyName.trim() !== session.company.name) {
      const res = await saveCompanyName(companyName)
      r2 = res.ok ? { ok: true, error: "" } : { ok: false, error: res.error }
    }
    setSaving(false)
    if (!r.ok) return toast.error(r.error)
    if (!r2.ok) return toast.error(r2.error)
    toast.success("Configurações salvas.")
    router.refresh()
  }

  async function onLogo(file: File | undefined) {
    if (!file || uploading) return
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    const r = await uploadLogo(fd)
    setUploading(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(r.message ?? "Logotipo atualizado.")
    router.refresh()
  }

  return (
    <>
      <PageHeader title="Configurações" description="Identidade visual, loja, fechamento, retenção de fotos e integrações." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <form onSubmit={save} className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-[#e8c98e]">Empresa</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-company">Nome de exibição</Label>
              <Input id="cfg-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-report">Título oficial dos relatórios</Label>
              <Input id="cfg-report" value={form.report_title} onChange={set("report_title")} />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-[#e8c98e]">Loja</h2>
            <div className="grid gap-1.5">
              <Label>Nome da loja</Label>
              <Input value={form.store_name} onChange={set("store_name")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Endereço</Label>
              <Input value={form.store_address} onChange={set("store_address")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Latitude</Label>
                <Input inputMode="decimal" value={form.store_lat} onChange={set("store_lat")} placeholder="-30.0277" />
              </div>
              <div className="grid gap-1.5">
                <Label>Longitude</Label>
                <Input inputMode="decimal" value={form.store_lng} onChange={set("store_lng")} placeholder="-51.2287" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Também é possível posicionar a loja clicando no mapa (tela Mapa).</p>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div className="grid gap-1.5">
                <Label>Cidade padrão das entregas</Label>
                <Input value={form.default_city} onChange={set("default_city")} />
              </div>
              <div className="grid gap-1.5">
                <Label>UF</Label>
                <Input value={form.default_state} onChange={set("default_state")} maxLength={2} className="uppercase" />
              </div>
            </div>
          </section>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
            <h2 className="font-semibold text-[#e8c98e] sm:col-span-3">Operação</h2>
            <div className="grid gap-1.5">
              <Label>Dia de corte da quinzena</Label>
              <Input type="number" min={1} max={27} value={form.closing_split_day} onChange={set("closing_split_day")} />
              <span className="text-xs text-muted-foreground">
                1ª quinzena: dia 1 a {form.closing_split_day || 15}; 2ª: até o fim do mês.
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label>Retenção das fotos (dias)</Label>
              <Input type="number" min={7} max={3650} value={form.photo_retention_days} onChange={set("photo_retention_days")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Alerta de entrega pendente (min)</Label>
              <Input type="number" min={5} max={1440} value={form.pending_alert_minutes} onChange={set("pending_alert_minutes")} />
            </div>
          </section>

          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar configurações
          </Button>
        </form>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-[#e8c98e]">Logotipo oficial</h2>
            <div className="flex justify-center rounded-lg bg-[#100b0d] p-6">
              <Logo url={logoUrl} name={session.company.name} size="lg" className="flex-col" />
            </div>
            {!logoUrl && (
              <p className="text-xs text-muted-foreground">
                Nenhum arquivo enviado: a marca textual é usada no login, no cabeçalho e nos relatórios.
              </p>
            )}
            <label className="block">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => onLogo(e.target.files?.[0])}
              />
              <span className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                Enviar logotipo (PNG, JPG, WEBP ou SVG até 2 MB)
              </span>
            </label>
            {logoUrl && (
              <ConfirmButton
                variant="ghost"
                className="w-full"
                title="Remover logotipo?"
                onConfirm={async () => {
                  const r = await removeLogo()
                  if (!r.ok) {
                    toast.error(r.error)
                    return false
                  }
                  toast.success(r.message ?? "Removido.")
                  router.refresh()
                }}
              >
                <Trash2 /> Remover logotipo
              </ConfirmButton>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <h2 className="font-semibold text-[#e8c98e]">Integrações</h2>
            <Status ok={integrations.serviceRole} label="SUPABASE_SERVICE_ROLE_KEY (criar usuários e redefinir senhas)" />
            <Status ok={integrations.ocr} label="ANTHROPIC_API_KEY (OCR das comandas)" />
            <Status ok={integrations.nominatimEmail} label="NOMINATIM_EMAIL (identificação no OpenStreetMap)" />
            <Status ok={integrations.cronSecret} label="CRON_SECRET (limpeza automática de fotos expiradas)" />
            <p className="text-xs text-muted-foreground">Os valores ficam somente no servidor (variáveis de ambiente da Vercel).</p>
          </section>
        </aside>
      </div>
    </>
  )
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />}
      <span>
        {label}: <strong>{ok ? "configurada" : "não configurada"}</strong>
      </span>
    </p>
  )
}
