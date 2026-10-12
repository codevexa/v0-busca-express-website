import "server-only"

/**
 * Geocodificação com Nominatim (OpenStreetMap), respeitando a política de uso:
 * no máximo 1 requisição por segundo, identificação do cliente (User-Agent e
 * e-mail de contato) e cache das respostas (~5 minutos).
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org"
const CACHE_TTL = 5 * 60_000
const MIN_INTERVAL = 1100

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

const cache = new Map<string, { at: number; value: GeoResult[] }>()
let queue: Promise<unknown> = Promise.resolve()
let lastRequest = 0

const UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
}

function toUF(state?: string, iso?: string): string | null {
  if (iso && /^BR-[A-Z]{2}$/.test(iso)) return iso.slice(3)
  if (!state) return null
  const key = state.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  return UF[key] ?? null
}

interface NominatimItem {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

function mapItem(item: NominatimItem): GeoResult {
  const a = item.address ?? {}
  return {
    label: item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    address: a.road ?? a.pedestrian ?? a.footway ?? a.street ?? null,
    address_number: a.house_number ?? null,
    neighborhood: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    state: toUF(a.state, a["ISO3166-2-lvl4"]),
    postal_code: a.postcode ?? null,
  }
}

function headers() {
  const contact = process.env.NOMINATIM_EMAIL
  return {
    "User-Agent": `OSSALA-Controle-de-Entregas/1.0${contact ? ` (${contact})` : ""}`,
    "Accept-Language": "pt-BR",
    Referer: process.env.NEXT_PUBLIC_APP_URL ?? "https://ossala.app",
  }
}

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_INTERVAL - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequest = Date.now()
    return fn()
  })
  queue = run.catch(() => undefined)
  return run
}

async function request(path: string, params: Record<string, string>): Promise<GeoResult[]> {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  if (process.env.NOMINATIM_EMAIL) url.searchParams.set("email", process.env.NOMINATIM_EMAIL)
  const key = url.toString()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value

  const value = await throttled(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(key, { headers: headers(), signal: controller.signal, cache: "no-store" })
      if (res.status === 429) throw new GeocodeError("O serviço de mapas limitou as consultas. Aguarde alguns segundos.")
      if (!res.ok) throw new GeocodeError(`Serviço de geocodificação indisponível (HTTP ${res.status}).`)
      const json = (await res.json()) as NominatimItem | NominatimItem[] | { error?: string }
      if (Array.isArray(json)) return json.map(mapItem)
      if ("error" in json && json.error) return []
      return [mapItem(json as NominatimItem)]
    } catch (error) {
      if (error instanceof GeocodeError) throw error
      if ((error as Error).name === "AbortError") throw new GeocodeError("A busca de endereço demorou demais. Tente novamente.")
      throw new GeocodeError("Não foi possível consultar o serviço de mapas.")
    } finally {
      clearTimeout(timer)
    }
  })

  cache.set(key, { at: Date.now(), value })
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100)
    for (const [k] of oldest) cache.delete(k)
  }
  return value
}

export class GeocodeError extends Error {}

export function searchAddress(query: string, opts: { city?: string | null; state?: string | null } = {}) {
  const q = [query, opts.city, opts.state].filter(Boolean).join(", ")
  return request("/search", { q, format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "br" })
}

export function reverseGeocode(latitude: number, longitude: number) {
  return request("/reverse", {
    lat: latitude.toFixed(6),
    lon: longitude.toFixed(6),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
  })
}
