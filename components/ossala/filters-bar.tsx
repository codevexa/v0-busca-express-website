"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { useSession } from "@/components/ossala/session-provider"
import type { Area, Motoboy } from "@/lib/domain"
import { DELIVERY_STATUS, PAYMENT_STATUS } from "@/lib/domain"
import { presetRange, todayISO } from "@/lib/dates"
import type { DeliveryFilters } from "@/lib/queries/deliveries"

export const PRESETS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana atual" },
  { key: "semana_anterior", label: "Semana anterior" },
  { key: "quinzena", label: "Quinzena atual" },
  { key: "quinzena_anterior", label: "Quinzena anterior" },
  { key: "mes", label: "Mês atual" },
  { key: "mes_anterior", label: "Mês anterior" },
] as const

export function FiltersBar({
  value,
  onChange,
  motoboys,
  areas,
  show = { dates: true, motoboy: true, area: true, status: true, payment: true, search: true },
}: {
  value: DeliveryFilters
  onChange: (f: DeliveryFilters) => void
  motoboys: Motoboy[]
  areas: Area[]
  show?: Partial<Record<"dates" | "motoboy" | "area" | "status" | "payment" | "search", boolean>>
}) {
  const { settings } = useSession()
  const split = settings?.closing_split_day ?? 15
  const set = (patch: Partial<DeliveryFilters>) => onChange({ ...value, ...patch })
  const hasExtra = value.motoboy || value.area || value.status || value.payment || value.search || value.divergence || value.noMotoboy || value.noArea

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-3">
      {show.dates !== false && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="f-from" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input id="f-from" type="date" value={value.from ?? ""} onChange={(e) => set({ from: e.target.value })} className="w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-to" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input id="f-to" type="date" value={value.to ?? ""} onChange={(e) => set({ to: e.target.value })} className="w-40" />
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => {
              const r = presetRange(p.key, todayISO(), split)
              const active = value.from === r.from && value.to === r.to
              return (
                <Button
                  key={p.key}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  className={active ? "text-[#d4af37]" : ""}
                  onClick={() => set({ from: r.from, to: r.to })}
                >
                  {p.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {show.search !== false && (
          <div className="relative lg:col-span-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Comanda, endereço ou bairro"
              value={value.search ?? ""}
              onChange={(e) => set({ search: e.target.value })}
              className="pl-9"
              aria-label="Pesquisar"
            />
          </div>
        )}
        {show.motoboy !== false && (
          <NativeSelect value={value.motoboy ?? ""} onChange={(e) => set({ motoboy: e.target.value || null })} aria-label="Motoboy">
            <option value="">Todos os motoboys</option>
            {motoboys.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {!m.active ? " (inativo)" : ""}
              </option>
            ))}
          </NativeSelect>
        )}
        {show.area !== false && (
          <NativeSelect value={value.area ?? ""} onChange={(e) => set({ area: e.target.value || null })} aria-label="Área">
            <option value="">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {show.status !== false && (
          <NativeSelect
            value={value.status ?? ""}
            onChange={(e) => set({ status: (e.target.value || null) as DeliveryFilters["status"] })}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            {Object.entries(DELIVERY_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        )}
        {show.payment !== false && (
          <NativeSelect
            value={value.payment ?? ""}
            onChange={(e) => set({ payment: (e.target.value || null) as DeliveryFilters["payment"] })}
            aria-label="Situação do pagamento"
          >
            <option value="">Todas as situações de pagamento</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {hasExtra && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {value.divergence && <span className="rounded bg-red-500/15 px-2 py-1 text-red-200">Somente com divergência</span>}
          {value.noMotoboy && <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-200">Sem motoboy</span>}
          {value.noArea && <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-200">Sem área</span>}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({ from: value.from, to: value.to })
            }
          >
            <X /> Limpar filtros
          </Button>
        </div>
      )}
    </div>
  )
}
