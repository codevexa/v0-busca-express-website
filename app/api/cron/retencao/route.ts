import { NextResponse, type NextRequest } from "next/server"
import { AdminUnavailableError, getAdminSupabase } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Remove do Storage as fotos de comandas com retenção vencida
 * (app_settings.photo_retention_days). Executado diariamente pelo Vercel Cron
 * (vercel.json) com Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }
  let admin
  try {
    admin = getAdminSupabase()
  } catch (error) {
    if (error instanceof AdminUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 })
    throw error
  }

  const { data, error } = await admin
    .from("delivery_photos")
    .select("id, storage_path, company_id")
    .is("deleted_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ removed: 0 })

  const { error: rmError } = await admin.storage.from("delivery-photos").remove(data.map((p) => p.storage_path))
  if (rmError) return NextResponse.json({ error: rmError.message }, { status: 500 })

  const ids = data.map((p) => p.id)
  await admin.from("delivery_photos").update({ deleted_at: new Date().toISOString() }).in("id", ids)
  await admin.from("audit_logs").insert(
    Array.from(new Set(data.map((p) => p.company_id))).map((company_id) => ({
      company_id,
      action: "retencao_fotos",
      entity: "delivery_photos",
      after_data: { removidas: data.filter((p) => p.company_id === company_id).length },
    })),
  )
  return NextResponse.json({ removed: ids.length })
}
