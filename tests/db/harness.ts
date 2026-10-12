/**
 * Banco PostgreSQL local (PGlite) para testar as migrations, regras de negócio
 * e políticas RLS sem tocar no Supabase de produção.
 *
 * Simula o mínimo do Supabase: roles anon/authenticated/service_role,
 * auth.users + auth.uid(), storage.buckets/objects e a publicação realtime.
 */
import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SUPABASE_STUB = `
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$f$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text
);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $f$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$f$;
grant execute on function storage.foldername(text) to authenticated;

create publication supabase_realtime;
`

/** Estado legado do banco de produção que as migrations precisam respeitar. */
const LEGACY_FIXTURE = `
create table public.permission_definitions (key text primary key, label text not null, module text not null, action text not null, created_at timestamptz not null default now());
insert into public.permission_definitions values
  ('entregas.visualizar','Ver entregas','entregas','visualizar', now()),
  ('entregas.criar','Criar entregas','entregas','criar', now()),
  ('teles.visualizar','Ver teles','teles','visualizar', now());
create table public.permission_catalog (key text primary key, module text not null, label text not null, description text, sort_order integer not null default 0);
insert into public.permission_catalog values ('dashboard.view','DASHBOARD','Visualizar dashboard',null,10);
`

const LEGACY_AFTER_BASELINE = `
alter table public.role_permissions add constraint role_permissions_permission_key_fkey
  foreign key (permission_key) references public.permission_definitions(key) on delete cascade;
alter table public.user_permissions add constraint user_permissions_permission_key_fkey
  foreign key (permission_key) references public.permission_catalog(key) on delete cascade;
insert into public.role_permissions values ('MOTOBOY','entregas.criar'),('MOTOBOY','teles.visualizar'),('ADMIN','entregas.visualizar');
alter table public.delivery_areas add constraint delivery_areas_name_check
  check (name = any (array['Área 1','Área 2','Área 3','Área Especial']));
`

export type Db = PGlite

export async function createDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
  await db.exec(SUPABASE_STUB)
  await db.exec(LEGACY_FIXTURE)

  const dir = join(process.cwd(), "supabase", "migrations")
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8")
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`Falha ao aplicar ${file}: ${(error as Error).message}`)
    }
    if (file.includes("baseline")) {
      await db.exec(LEGACY_AFTER_BASELINE)
    }
  }
  return db
}

/** Executa SQL como um usuário autenticado (RLS ativa). */
export async function asUser<T = Record<string, unknown>>(
  db: Db,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true);`)
    } else {
      await tx.exec(`set local role anon; select set_config('request.jwt.claim.sub', '', true);`)
    }
    const res = await tx.query<T>(sql, params)
    return res.rows
  })
}

/** Executa como superusuário (equivalente ao service_role / migrations). */
export async function asAdmin<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(sql, params)
  return res.rows
}

export async function createUser(
  db: Db,
  opts: { id: string; companyId: string; matricula: string; nome: string; role: string },
) {
  await asAdmin(db, `insert into auth.users (id, email) values ($1, $2)`, [opts.id, `${opts.matricula}@ossala.internal`])
  await asAdmin(
    db,
    `insert into public.profiles (id, matricula, nome, login, tipo, role, company_id, email)
     values ($1, $2, $3, $2, lower($4), $4, $5, $2 || '@ossala.internal')`,
    [opts.id, opts.matricula, opts.nome, opts.role, opts.companyId],
  )
  if (opts.role === "MOTOBOY") {
    await asAdmin(db, `insert into public.motoboys (company_id, profile_id, name) values ($1, $2, $3)`, [
      opts.companyId,
      opts.id,
      opts.nome,
    ])
  }
}
