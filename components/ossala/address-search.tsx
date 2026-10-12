"use client"

import { Loader2, MapPin, Search } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface GeoResult {
  label: string
  latitude: number
  longitude: number
  address: string | null
  address_number: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

export async function geocodeSearch(q: string, city?: string | null, state?: string | null) {
  const params = new URLSearchParams({ q })
  if (city) params.set("city", city)
  if (state) params.set("state", state)
  const res = await fetch(`/api/geocode?${params}`)
  const json = (await res.json().catch(() => ({}))) as { results?: GeoResult[]; error?: string; message?: string }
  if (!res.ok) throw new Error(json.error ?? "Falha na busca de endereço.")
  return { results: json.results ?? [], message: json.message }
}

export async function geocodeReverse(lat: number, lon: number) {
  const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
  const json = (await res.json().catch(() => ({}))) as { results?: GeoResult[]; error?: string }
  if (!res.ok) throw new Error(json.error ?? "Falha ao identificar o endereço.")
  return json.results?.[0] ?? null
}

/** Busca de endereços brasileiros (Nominatim via servidor). */
export function AddressSearch({
  initialQuery = "",
  city,
  state,
  onSelect,
  placeholder = "Rua, número, bairro, cidade",
}: {
  initialQuery?: string
  city?: string | null
  state?: string | null
  onSelect: (r: GeoResult) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<GeoResult[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function search() {
    if (pending || q.trim().length < 3) {
      setMessage("Digite ao menos 3 caracteres.")
      return
    }
    setPending(true)
    setMessage(null)
    try {
      const { results, message } = await geocodeSearch(q.trim(), city, state)
      setResults(results)
      setMessage(message ?? (results.length ? null : "Endereço não localizado."))
    } catch (e) {
      setResults([])
      setMessage((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              search()
            }
          }}
          aria-label="Buscar endereço"
        />
        <Button type="button" variant="secondary" onClick={search} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />}
          Buscar
        </Button>
      </div>
      {message && <p className="text-xs text-amber-200">{message}</p>}
      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
          {results.map((r, i) => (
            <li key={`${r.latitude}-${r.longitude}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r)
                  setResults([])
                  setMessage("Endereço selecionado. Confira os campos preenchidos.")
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#d4af37]" />
                <span>{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
