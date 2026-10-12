import { NextResponse, type NextRequest } from "next/server"
import { UnauthenticatedError, assertPermission } from "@/lib/auth"
import { GeocodeError, reverseGeocode, searchAddress } from "@/lib/geo/nominatim"
import { P } from "@/lib/permissions"
import { rateLimit } from "@/lib/rate-limit"

/**
 * GET /api/geocode?q=Rua X, 10&city=Porto Alegre&state=RS  -> busca
 * GET /api/geocode?lat=-30.03&lon=-51.22                  -> endereço da posição
 * As consultas passam pelo servidor para respeitar limites e cache do Nominatim.
 */
export async function GET(request: NextRequest) {
  let ctx
  try {
    ctx = await assertPermission([P.mapaVer, P.entregasCriar, P.entregasEditar])
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof UnauthenticatedError ? 401 : 403 })
  }

  const limit = rateLimit(`geocode:${ctx.user_id}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Muitas buscas seguidas. Aguarde ${limit.retryAfter}s.` }, { status: 429 })
  }

  const sp = request.nextUrl.searchParams
  try {
    const lat = sp.get("lat")
    const lon = sp.get("lon")
    if (lat && lon) {
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 })
      }
      return NextResponse.json({ results: await reverseGeocode(la, lo) })
    }
    const q = (sp.get("q") ?? "").trim()
    if (q.length < 3) return NextResponse.json({ error: "Digite ao menos 3 caracteres." }, { status: 400 })
    if (q.length > 200) return NextResponse.json({ error: "Endereço muito longo." }, { status: 400 })
    const results = await searchAddress(q, { city: sp.get("city"), state: sp.get("state") })
    return NextResponse.json({
      results,
      message: results.length ? undefined : "Endereço não localizado. Confira os dados ou marque a posição no mapa.",
    })
  } catch (error) {
    const message = error instanceof GeocodeError ? error.message : "Falha na busca de endereço."
    return NextResponse.json({ error: message, results: [] }, { status: 502 })
  }
}
