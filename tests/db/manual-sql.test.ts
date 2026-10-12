import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { MANUAL_MIGRATIONS, buildManualSql } from "../../scripts/gerar-sql-manual.mjs"
import { asAdmin, createDb } from "./harness"

const MANUAL_FILE = join(process.cwd(), "supabase", "manual", "aplicar_no_sql_editor.sql")

test("arquivo do SQL Editor está em dia com as migrations e não tem comentários", () => {
  const content = readFileSync(MANUAL_FILE, "utf8")
  expect(content).toBe(buildManualSql())
  expect(content).not.toContain("--")
})

test("arquivo do SQL Editor aplica sobre o banco no estado atual da produção e pode ser repetido", async () => {
  // Produção: todas as migrations aplicadas, exceto as que dependem do SQL Editor.
  const db = await createDb({ skip: MANUAL_MIGRATIONS })
  const before = await asAdmin<{ closing: string | null }>(db, `select to_regclass('public.closing_periods')::text as closing`)
  expect(before[0].closing).toBeNull()

  const sql = readFileSync(MANUAL_FILE, "utf8")
  await db.exec(sql)
  await db.exec(sql)

  const [state] = await asAdmin<Record<string, unknown>>(
    db,
    `select
       to_regclass('public.closing_periods') is not null as closing_periods,
       to_regclass('public.closing_items') is not null as closing_items,
       (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('closing_periods', 'closing_items')) as closing_policies,
       (select count(*)::int from pg_trigger where not tgisinternal and tgname in ('deliveries_period_lock', 'delivery_extras_period_lock')) as period_locks,
       (select count(*)::int from pg_trigger where not tgisinternal and tgname in ('protect_profile_role_changes', 'set_notifications_company')) as legacy_triggers,
       (select confrelid::regclass::text from pg_constraint where conname = 'role_permissions_permission_key_fkey') as role_fk,
       (select confrelid::regclass::text from pg_constraint where conname = 'user_permissions_permission_key_fkey') as user_fk,
       exists (select 1 from public.role_permissions where role = 'MOTOBOY' and permission_key = 'entregas.confirmar') as motoboy_confirma,
       exists (select 1 from public.role_permissions where role = 'MOTOBOY' and permission_key = 'entregas.criar') as motoboy_cria,
       (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'btree_gist') as btree_gist_schema`,
  )
  expect(state).toEqual({
    closing_periods: true,
    closing_items: true,
    closing_policies: 2,
    period_locks: 2,
    legacy_triggers: 0,
    role_fk: "permissions",
    user_fk: "permissions",
    motoboy_confirma: true,
    motoboy_cria: false,
    btree_gist_schema: "extensions",
  })
}, 120000)
