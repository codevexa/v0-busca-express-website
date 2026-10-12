"use client"

import { Camera, ImageIcon, Loader2, RefreshCw, RotateCcw, ScanSearch, Send, Upload } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { ComparisonTable } from "@/components/conference/comparison-table"
import { EmptyState } from "@/components/ossala/empty-state"
import { PageHeader } from "@/components/ossala/page-header"
import { Pagination } from "@/components/ossala/pagination"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { useCatalog } from "@/hooks/use-catalog"
import { addDays, formatDateTimeBR, todayISO } from "@/lib/dates"
import { friendlyError } from "@/lib/errors"
import { prepareImage } from "@/lib/image"
import type { ComparisonRow } from "@/lib/ocr/types"
import { P } from "@/lib/permissions"
import { getBrowserSupabase } from "@/lib/supabase/client"

interface OcrResponse {
  conference_id?: string
  status?: string
  error?: string
  comparison?: ComparisonRow[]
  divergences?: number
  delivery?: { id: string; comanda_number: string } | null
}

interface PhotoRow {
  id: string
  storage_path: string
  created_at: string
  source: string
  comanda_number: string | null
  delivery_id: string | null
  motoboy_id: string | null
  url?: string
}

const PAGE = 24

export function FotosClient() {
  const can = useCan()
  const { session } = useSession()
  const params = useSearchParams()
  const { motoboys } = useCatalog()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<"camera" | "galeria">("camera")
  const [preview, setPreview] = useState<string | null>(null)
  const [comanda, setComanda] = useState(params.get("comanda") ?? "")
  const deliveryId = params.get("entrega")
  const [sending, setSending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [result, setResult] = useState<OcrResponse | null>(null)

  // Histórico
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [hFrom, setHFrom] = useState(addDays(todayISO(), -7))
  const [hTo, setHTo] = useState(todayISO())
  const [hMotoboy, setHMotoboy] = useState("")
  const [hComanda, setHComanda] = useState("")
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function pick(f: File | undefined, src: "camera" | "galeria") {
    if (!f) return
    setPreparing(true)
    setResult(null)
    try {
      const prepared = await prepareImage(f)
      if (preview) URL.revokeObjectURL(preview)
      setFile(prepared)
      setSource(src)
      setPreview(URL.createObjectURL(prepared))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPreparing(false)
      if (cameraRef.current) cameraRef.current.value = ""
      if (galleryRef.current) galleryRef.current.value = ""
    }
  }

  async function send() {
    if (!file || sending) return
    if (!navigator.onLine) return toast.error("Sem conexão. A foto não foi enviada; tente quando a internet voltar.")
    setSending(true)
    const form = new FormData()
    form.append("file", file)
    form.append("source", source)
    if (comanda.trim()) form.append("comanda", comanda.trim())
    if (deliveryId) form.append("delivery_id", deliveryId)
    try {
      const res = await fetch("/api/conferencia/ocr", { method: "POST", body: form })
      const json = (await res.json().catch(() => ({}))) as OcrResponse
      if (!res.ok) {
        toast.error(json.error ?? "Falha ao enviar a foto.")
        return
      }
      setResult(json)
      if (json.status === "falha_ocr") {
        toast.warning("Foto enviada, mas o OCR falhou. A conferência poderá ser feita manualmente.")
      } else {
        toast.success(
          json.divergences ? `Foto conferida: ${json.divergences} divergência(s) para revisão.` : "Foto enviada para conferência.",
        )
      }
      setFile(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(null)
      loadHistory()
    } catch {
      toast.error("Falha de conexão. A foto não foi enviada; tente novamente.")
    } finally {
      setSending(false)
    }
  }

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const supabase = getBrowserSupabase()
    let q = supabase
      .from("delivery_photos")
      .select("id, storage_path, created_at, source, comanda_number, delivery_id, motoboy_id", { count: "exact" })
      .is("deleted_at", null)
      .gte("created_at", `${hFrom}T00:00:00-03:00`)
      .lte("created_at", `${hTo}T23:59:59-03:00`)
    if (hMotoboy) q = q.eq("motoboy_id", hMotoboy)
    if (hComanda.trim()) q = q.ilike("comanda_number", `%${hComanda.trim().replace(/[%_]/g, "")}%`)
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      toast.error(friendlyError(error))
      setLoadingHistory(false)
      return
    }
    const rows = (data ?? []) as PhotoRow[]
    if (rows.length) {
      const { data: signed } = await supabase.storage.from("delivery-photos").createSignedUrls(rows.map((r) => r.storage_path), 900)
      rows.forEach((r, i) => (r.url = signed?.[i]?.signedUrl ?? undefined))
    }
    setPhotos(rows)
    setCount(count ?? 0)
    setLoadingHistory(false)
  }, [hFrom, hTo, hMotoboy, hComanda, page])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const canSend = can(P.fotosCriar) && can(P.conferenciaCriar)
  const motoboyName = (id: string | null) => motoboys.find((m) => m.id === id)?.name

  return (
    <>
      <PageHeader title="Fotos de comandas" description="Fotografe ou selecione a comanda para conferência automática por OCR." />

      {canSend && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ph-comanda">Nº da comanda (opcional, ajuda a localizar)</Label>
                <Input id="ph-comanda" value={comanda} onChange={(e) => setComanda(e.target.value)} />
                {deliveryId && <span className="text-xs text-emerald-300">A foto será vinculada à entrega selecionada.</span>}
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0], "camera")}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0], "galeria")}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-14 text-base" onClick={() => cameraRef.current?.click()} disabled={sending || preparing}>
                  <Camera /> Fotografar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 text-base"
                  onClick={() => galleryRef.current?.click()}
                  disabled={sending || preparing}
                >
                  <ImageIcon /> Galeria
                </Button>
              </div>
              {preview && (
                <div className="flex gap-2">
                  <Button className="bg-ossala-gradient flex-1" onClick={send} disabled={sending}>
                    {sending ? <Loader2 className="animate-spin" /> : <Send />}
                    {sending ? "Enviando e lendo…" : "Enviar"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => (source === "camera" ? cameraRef.current?.click() : galleryRef.current?.click())}
                    disabled={sending}
                  >
                    <RotateCcw /> Repetir
                  </Button>
                </div>
              )}
            </div>
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-background/50">
              {preparing ? (
                <Loader2 className="size-6 animate-spin text-[#d4af37]" />
              ) : preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Pré-visualização da comanda" className="max-h-80 rounded-md object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <Upload className="size-6 text-[#b48a4a]" />
                  A pré-visualização aparece aqui antes do envio.
                </span>
              )}
            </div>
          </div>

          {result && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              {result.status === "falha_ocr" ? (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {result.error} A foto ficou registrada para conferência manual.
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    {result.delivery ? (
                      <>
                        Entrega localizada: <strong>comanda {result.delivery.comanda_number}</strong>.{" "}
                      </>
                    ) : (
                      <span className="text-amber-200">Nenhuma entrega cadastrada corresponde à comanda lida. </span>
                    )}
                    A aprovação é sempre manual.
                  </p>
                  {result.comparison && <ComparisonTable rows={result.comparison} />}
                </>
              )}
              {result.conference_id && can(P.conferenciaVer) && session.role !== "MOTOBOY" && (
                <Button asChild variant="secondary">
                  <Link href={`/app/conferencia?id=${result.conference_id}`}>
                    <ScanSearch /> Abrir conferência
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <h2 className="mr-auto font-semibold text-[#e8c98e]">Histórico de fotografias</h2>
          <Input type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} className="w-40" aria-label="De" />
          <Input type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} className="w-40" aria-label="Até" />
          {session.role !== "MOTOBOY" && (
            <NativeSelect value={hMotoboy} onChange={(e) => setHMotoboy(e.target.value)} className="w-44" aria-label="Motoboy">
              <option value="">Todos os motoboys</option>
              {motoboys.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <Input placeholder="Comanda" value={hComanda} onChange={(e) => setHComanda(e.target.value)} className="w-32" />
          <Button variant="outline" size="icon" onClick={loadHistory} aria-label="Atualizar">
            {loadingHistory ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
        {!loadingHistory && photos.length === 0 ? (
          <EmptyState icon={ImageIcon} title="Nenhuma foto no período" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Comanda ${p.comanda_number ?? ""}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">Indisponível</div>
                )}
                <div className="space-y-0.5 p-2 text-xs">
                  <div className="font-medium">{p.comanda_number ? `Comanda ${p.comanda_number}` : "Comanda não identificada"}</div>
                  <div className="text-muted-foreground">{formatDateTimeBR(p.created_at)}</div>
                  {motoboyName(p.motoboy_id) && <div className="text-muted-foreground">{motoboyName(p.motoboy_id)}</div>}
                  <Badge tone="muted">{p.source === "camera" ? "Câmera" : "Galeria"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE} count={count} onPage={setPage} />
      </section>
    </>
  )
}
