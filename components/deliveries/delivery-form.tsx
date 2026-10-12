"use client"

import { AlertTriangle, Loader2, MapPin, Save } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
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
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { AddressSearch, type GeoResult } from "@/components/ossala/address-search"
import { useCan, useSession } from "@/components/ossala/session-provider"
import { createDelivery, findDuplicates, updateDelivery } from "@/lib/actions/deliveries"
import { nowTimeHHMM, todayISO } from "@/lib/dates"
import type { Area, DeliveryRow, Motoboy, Neighborhood } from "@/lib/domain"
import { formatBRL } from "@/lib/money"
import { P } from "@/lib/permissions"
import { deliverySchema } from "@/lib/validation/schemas"

interface FormState {
  comanda_number: string
  delivery_date: string
  delivery_time: string
  address: string
  address_number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  postal_code: string
  latitude: string
  longitude: string
  geocode_source: "nominatim" | "manual" | "mapa" | ""
  motoboy_id: string
  area_id: string
  notes: string
}

function fromDelivery(d: DeliveryRow | null, defaults: { city?: string | null; state?: string | null }): FormState {
  return {
    comanda_number: d?.comanda_number ?? "",
    delivery_date: d?.delivery_date ?? todayISO(),
    delivery_time: d?.delivery_time?.slice(0, 5) ?? nowTimeHHMM(),
    address: d?.address ?? "",
    address_number: d?.address_number ?? "",
    complement: d?.complement ?? "",
    neighborhood: d?.neighborhood ?? "",
    city: d?.city ?? defaults.city ?? "",
    state: d?.state ?? defaults.state ?? "",
    postal_code: d?.postal_code ?? "",
    latitude: d?.latitude != null ? String(d.latitude) : "",
    longitude: d?.longitude != null ? String(d.longitude) : "",
    geocode_source: (d?.geocode_source as FormState["geocode_source"]) ?? "",
    motoboy_id: d?.motoboy_id ?? "",
    area_id: d?.area_id ?? "",
    notes: d?.notes ?? "",
  }
}

function normalizeKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function DeliveryFormDialog({
  open,
  onOpenChange,
  delivery,
  motoboys,
  areas,
  neighborhoods,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  delivery: DeliveryRow | null
  motoboys: Motoboy[]
  areas: Area[]
  neighborhoods: Neighborhood[]
  onSaved: (id: string) => void
}) {
  const { settings } = useSession()
  const can = useCan()
  const [form, setForm] = useState<FormState>(() =>
    fromDelivery(delivery, { city: settings?.default_city, state: settings?.default_state }),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [duplicates, setDuplicates] = useState<Array<{ id: string; comanda_number: string; delivery_date: string; address: string; reason: string }>>([])
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(fromDelivery(delivery, { city: settings?.default_city, state: settings?.default_state }))
      setErrors({})
      setDuplicates([])
      setConfirmDuplicate(false)
    }
  }, [open, delivery, settings?.default_city, settings?.default_state])

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  // Área sugerida pelo bairro cadastrado (o banco aplica a mesma regra).
  const matchedNeighborhood = useMemo(() => {
    const key = normalizeKey(form.neighborhood)
    return key ? neighborhoods.find((n) => n.active && normalizeKey(n.name) === key) : undefined
  }, [form.neighborhood, neighborhoods])

  const effectiveAreaId = form.area_id || matchedNeighborhood?.area_id || ""
  const effectiveArea = areas.find((a) => a.id === effectiveAreaId)
  const isEdit = !!delivery
  const canAssign = can(P.entregasAtribuir)
  const showMoney = can(P.financeiroVer)
  const priceLocked = isEdit && delivery && delivery.area_id === (form.area_id || null)

  function applyGeo(r: GeoResult) {
    set({
      address: r.address ?? form.address,
      address_number: r.address_number ?? form.address_number,
      neighborhood: r.neighborhood ?? form.neighborhood,
      city: r.city ?? form.city,
      state: r.state ?? form.state,
      postal_code: r.postal_code ?? form.postal_code,
      latitude: String(r.latitude),
      longitude: String(r.longitude),
      geocode_source: "nominatim",
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    const input = {
      ...form,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      geocode_source: form.geocode_source || null,
      motoboy_id: form.motoboy_id || null,
      area_id: form.area_id || null,
    }
    const parsed = deliverySchema.safeParse(input)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setErrors(errs)
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos destacados.")
      return
    }
    setErrors({})
    setPending(true)
    try {
      if (!confirmDuplicate) {
        const dup = await findDuplicates({
          comanda: form.comanda_number,
          date: form.delivery_date,
          address: form.address,
          number: form.address_number || null,
          exclude: delivery?.id ?? null,
        })
        if (dup.ok && dup.data.length > 0) {
          setDuplicates(dup.data)
          const sameComanda = dup.data.some((d) => d.reason === "mesma_comanda" && d.delivery_date === form.delivery_date)
          if (sameComanda) {
            toast.error("Já existe uma entrega com esta comanda nesta data.")
            return
          }
          setConfirmDuplicate(true)
          toast.warning("Possível duplicidade encontrada. Confira e salve novamente para confirmar.")
          return
        }
      }
      const result = isEdit ? await updateDelivery(delivery!.id, input) : await createDelivery(input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? "Salvo.")
      onSaved(result.data.id)
      onOpenChange(false)
    } catch {
      toast.error("Falha de conexão. Nada foi salvo; tente novamente.")
    } finally {
      setPending(false)
    }
  }

  const field = (name: keyof FormState) => ({
    id: `df-${name}`,
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set({ [name]: e.target.value } as Partial<FormState>),
    "aria-invalid": !!errors[name] || undefined,
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar comanda ${delivery!.comanda_number}` : "Nova entrega"}</DialogTitle>
          <DialogDescription>
            Os valores de cobrança e repasse são definidos pela área vigente no momento do cadastro.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 grid gap-1.5 sm:col-span-2">
              <Label htmlFor="df-comanda_number">Nº da comanda *</Label>
              <Input {...field("comanda_number")} autoComplete="off" inputMode="text" />
              <FieldError msg={errors.comanda_number} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="df-delivery_date">Data *</Label>
              <Input type="date" {...field("delivery_date")} />
              <FieldError msg={errors.delivery_date} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="df-delivery_time">Horário *</Label>
              <Input type="time" {...field("delivery_time")} />
              <FieldError msg={errors.delivery_time} />
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border p-3">
            <Label className="text-[#e8c98e]">Localizar endereço</Label>
            <AddressSearch
              initialQuery={[form.address, form.address_number, form.neighborhood].filter(Boolean).join(", ")}
              city={form.city}
              state={form.state}
              onSelect={applyGeo}
            />
            {form.latitude && form.longitude ? (
              <p className="flex items-center gap-1 text-xs text-emerald-300">
                <MapPin className="size-3" /> Posição: {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                {form.geocode_source ? ` (${form.geocode_source})` : ""}
                <button
                  type="button"
                  className="ml-2 text-muted-foreground underline"
                  onClick={() => set({ latitude: "", longitude: "", geocode_source: "" })}
                >
                  remover
                </button>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sem posição no mapa. Busque o endereço acima ou ajuste depois na tela Mapa.
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-4 grid gap-1.5 sm:col-span-3">
              <Label htmlFor="df-address">Endereço *</Label>
              <Input {...field("address")} autoComplete="off" />
              <FieldError msg={errors.address} />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="df-address_number">Número</Label>
              <Input {...field("address_number")} inputMode="numeric" />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-2">
              <Label htmlFor="df-complement">Complemento</Label>
              <Input {...field("complement")} />
            </div>
            <div className="col-span-4 grid gap-1.5 sm:col-span-2">
              <Label htmlFor="df-neighborhood">Bairro</Label>
              <Input {...field("neighborhood")} list="df-neighborhood-list" autoComplete="off" />
              <datalist id="df-neighborhood-list">
                {neighborhoods
                  .filter((n) => n.active)
                  .map((n) => (
                    <option key={n.id} value={n.name} />
                  ))}
              </datalist>
              {form.neighborhood && (
                <span className="text-xs text-muted-foreground">
                  {matchedNeighborhood
                    ? `Bairro cadastrado${matchedNeighborhood.area_id ? ` → ${areas.find((a) => a.id === matchedNeighborhood.area_id)?.name ?? "área"}` : " (sem área)"}`
                    : "Bairro não cadastrado: selecione a área manualmente."}
                </span>
              )}
            </div>
            <div className="col-span-3 grid gap-1.5 sm:col-span-3">
              <Label htmlFor="df-city">Cidade</Label>
              <Input {...field("city")} />
            </div>
            <div className="col-span-1 grid gap-1.5">
              <Label htmlFor="df-state">UF</Label>
              <Input {...field("state")} maxLength={2} className="uppercase" />
              <FieldError msg={errors.state} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="df-area_id">Área de entrega</Label>
              <NativeSelect {...field("area_id")}>
                <option value="">{matchedNeighborhood?.area_id ? "Automática (pelo bairro)" : "Selecione"}</option>
                {areas
                  .filter((a) => a.active || a.id === delivery?.area_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {showMoney ? ` — cobra ${formatBRL(a.charge_amount)} / repasse ${formatBRL(a.repass_amount)}` : ""}
                    </option>
                  ))}
              </NativeSelect>
              {showMoney && effectiveArea && !priceLocked && (
                <span className="text-xs text-muted-foreground">
                  Valores vigentes: cobrança {formatBRL(effectiveArea.charge_amount)} · repasse{" "}
                  {formatBRL(effectiveArea.repass_amount)}
                </span>
              )}
              {showMoney && priceLocked && (
                <span className="text-xs text-muted-foreground">
                  Valores preservados do cadastro: cobrança {formatBRL(delivery!.charge_amount)} · repasse{" "}
                  {formatBRL(delivery!.repass_amount)}
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="df-motoboy_id">Motoboy responsável</Label>
              <NativeSelect {...field("motoboy_id")} disabled={!canAssign}>
                <option value="">Sem motoboy</option>
                {motoboys
                  .filter((m) => m.active || m.id === delivery?.motoboy_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </NativeSelect>
              {!canAssign && <span className="text-xs text-muted-foreground">Sem permissão para atribuir.</span>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="df-notes">Observações</Label>
            <Textarea {...field("notes")} rows={2} />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" /> Possíveis duplicidades
              </p>
              <ul className="list-inside list-disc text-xs">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    Comanda {d.comanda_number} em {d.delivery_date.split("-").reverse().join("/")} — {d.address} (
                    {d.reason === "mesma_comanda" ? "mesmo número" : "mesmo endereço"})
                  </li>
                ))}
              </ul>
              {confirmDuplicate && <p className="mt-2 text-xs">Clique em salvar novamente para confirmar o cadastro.</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {confirmDuplicate ? "Confirmar e salvar" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <span className="text-xs text-red-300">{msg}</span> : null
}
