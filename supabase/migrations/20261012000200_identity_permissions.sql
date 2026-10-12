-- OSSALA | 0002 - Identidade, perfis, papéis e permissões granulares.

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

-- Normaliza textos para comparação (minúsculas, sem acentos, espaços simples).
create or replace function app.normalize(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p, ''))),
        'áàâãäåéèêëíìîïóòôõöúùûüçñ',
        'aaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    ),
    ''
  )
$$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Papéis e catálogo de permissões
-- ---------------------------------------------------------------------------

create table if not exists public.roles (
  key text primary key check (key ~ '^[A-Z_]+$'),
  label text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.roles (key, label, description, sort_order) values
  ('ADMIN', 'Administrador', 'Acesso administrativo completo da empresa.', 10),
  ('GESTOR', 'Gestor', 'Gestão das operações, entregas, conferências, relatórios e fechamentos.', 20),
  ('ADMINISTRATIVO', 'Administrativo', 'Funções administrativas autorizadas, com restrições configuráveis.', 30),
  ('MOTOBOY', 'Motoboy', 'Acesso às próprias entregas, fotos e confirmações.', 40)
on conflict (key) do update
  set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

create table if not exists public.permissions (
  key text primary key,
  module text not null,
  action text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now()
);

-- Preserva as chaves usadas pela versão anterior (para manter as FKs válidas).
do $$
begin
  if to_regclass('public.permission_definitions') is not null then
    insert into public.permissions (key, module, action, label, is_legacy)
    select key, module, action, label, true from public.permission_definitions
    on conflict (key) do nothing;
  end if;
  if to_regclass('public.permission_catalog') is not null then
    insert into public.permissions (key, module, action, label, is_legacy, sort_order)
    select key, module, split_part(key, '.', 2), label, true, sort_order from public.permission_catalog
    on conflict (key) do nothing;
  end if;
end $$;

insert into public.permissions (key, module, action, label, sort_order) values
  ('dashboard.visualizar', 'Painel', 'visualizar', 'Visualizar painel Hoje', 10),
  ('entregas.visualizar', 'Entregas', 'visualizar', 'Visualizar entregas', 20),
  ('entregas.criar', 'Entregas', 'criar', 'Cadastrar entregas', 21),
  ('entregas.editar', 'Entregas', 'editar', 'Editar entregas', 22),
  ('entregas.excluir', 'Entregas', 'excluir', 'Cancelar / reativar entregas', 23),
  ('entregas.atribuir', 'Entregas', 'editar', 'Atribuir e reatribuir motoboy', 24),
  ('entregas.confirmar', 'Entregas', 'confirmar', 'Confirmar "Pedido entregue"', 25),
  ('entregas.corrigir_confirmacao', 'Entregas', 'aprovar', 'Corrigir confirmação de entrega', 26),
  ('entregas.exportar', 'Entregas', 'exportar', 'Exportar entregas', 27),
  ('motoboys.visualizar', 'Motoboys', 'visualizar', 'Visualizar motoboys', 30),
  ('motoboys.criar', 'Motoboys', 'criar', 'Cadastrar motoboys', 31),
  ('motoboys.editar', 'Motoboys', 'editar', 'Editar / desativar motoboys', 32),
  ('areas.visualizar', 'Áreas e cobrança', 'visualizar', 'Visualizar áreas, bairros e regras', 40),
  ('areas.editar', 'Áreas e cobrança', 'editar', 'Editar áreas, bairros, valores e regras de extras', 41),
  ('extras.visualizar', 'Extras', 'visualizar', 'Visualizar extras', 50),
  ('extras.criar', 'Extras', 'criar', 'Lançar extras manuais', 51),
  ('extras.editar', 'Extras', 'editar', 'Editar / cancelar extras', 52),
  ('financeiro.visualizar', 'Financeiro', 'visualizar', 'Acessar informações financeiras', 60),
  ('financeiro.ajustar', 'Financeiro', 'aprovar', 'Lançar ajustes e descontos autorizados', 61),
  ('pagamentos.visualizar', 'Pagamentos', 'visualizar', 'Visualizar pagamentos', 70),
  ('pagamentos.criar', 'Pagamentos', 'criar', 'Gerar pagamentos', 71),
  ('pagamentos.aprovar', 'Pagamentos', 'aprovar', 'Aprovar pagamentos', 72),
  ('pagamentos.confirmar', 'Pagamentos', 'confirmar', 'Registrar pagamento efetuado', 73),
  ('pagamentos.excluir', 'Pagamentos', 'excluir', 'Cancelar pagamentos', 74),
  ('fechamentos.visualizar', 'Fechamentos', 'visualizar', 'Visualizar fechamentos', 80),
  ('fechamentos.criar', 'Fechamentos', 'criar', 'Gerar consolidação', 81),
  ('fechamentos.aprovar', 'Fechamentos', 'aprovar', 'Aprovar fechamento', 82),
  ('fechamentos.confirmar', 'Fechamentos', 'confirmar', 'Encerrar período', 83),
  ('fechamentos.reabrir', 'Fechamentos', 'aprovar', 'Reabrir período encerrado', 84),
  ('fechamentos.corrigir', 'Fechamentos', 'editar', 'Corrigir registros de período encerrado', 85),
  ('mapa.visualizar', 'Mapa', 'visualizar', 'Visualizar mapa', 90),
  ('mapa.editar', 'Mapa', 'editar', 'Cadastrar endereços e corrigir marcadores', 91),
  ('fotos.visualizar', 'Fotos de comandas', 'visualizar', 'Visualizar fotos de comandas', 100),
  ('fotos.criar', 'Fotos de comandas', 'criar', 'Enviar fotos de comandas', 101),
  ('conferencia.visualizar', 'Conferência', 'visualizar', 'Visualizar conferências', 110),
  ('conferencia.criar', 'Conferência', 'criar', 'Iniciar conferência por foto', 111),
  ('conferencia.aprovar', 'Conferência', 'aprovar', 'Aprovar / rejeitar conferência', 112),
  ('relatorios.visualizar', 'Relatórios', 'visualizar', 'Visualizar relatórios', 120),
  ('relatorios.exportar', 'Relatórios', 'exportar', 'Exportar relatórios em PDF', 121),
  ('alertas.visualizar', 'Alertas', 'visualizar', 'Visualizar alertas operacionais', 130),
  ('usuarios.visualizar', 'Usuários', 'visualizar', 'Visualizar usuários', 140),
  ('usuarios.gerenciar', 'Usuários', 'gerenciar', 'Gerenciar usuários e permissões', 141),
  ('configuracoes.administrar', 'Configurações', 'administrar', 'Administrar configurações', 150),
  ('auditoria.visualizar', 'Auditoria', 'visualizar', 'Visualizar auditoria', 160)
on conflict (key) do update
  set module = excluded.module,
      action = excluded.action,
      label = excluded.label,
      sort_order = excluded.sort_order,
      is_legacy = false;

-- As chaves já usadas em role_permissions/user_permissions entram no catálogo
-- (as FKs são reapontadas na migration 0850).
insert into public.permissions (key, module, action, label, is_legacy)
select distinct rp.permission_key, 'Legado', split_part(rp.permission_key, '.', 2), rp.permission_key, true
  from public.role_permissions rp
 where not exists (select 1 from public.permissions p where p.key = rp.permission_key);

insert into public.permissions (key, module, action, label, is_legacy)
select distinct up.permission_key, 'Legado', split_part(up.permission_key, '.', 2), up.permission_key, true
  from public.user_permissions up
 where not exists (select 1 from public.permissions p where p.key = up.permission_key);

-- true = concede, false = revoga (sobrepõe o padrão do papel).
alter table public.user_permissions add column if not exists allowed boolean not null default true;

-- Restrições/concessões configuráveis por empresa para um papel inteiro.
create table if not exists public.company_role_overrides (
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, role, permission_key)
);
alter table public.company_role_overrides enable row level security;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.profiles
   set role = case lower(tipo)
                when 'admin' then 'ADMIN'
                when 'gestor' then 'GESTOR'
                when 'administrativo' then 'ADMINISTRATIVO'
                else 'MOTOBOY'
              end
 where role is null;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

alter table public.profiles alter column role set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_fkey') then
    alter table public.profiles add constraint profiles_role_fkey foreign key (role) references public.roles(key);
  end if;
end $$;

create unique index if not exists profiles_matricula_lower_key on public.profiles (lower(matricula));
create index if not exists profiles_company_role_idx on public.profiles (company_id, role);

-- Mantém as colunas da versão anterior (tipo/roles) coerentes com "role".
create or replace function app.sync_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Compatibilidade: uma alteração feita apenas em "tipo" (versão anterior) atualiza "role".
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.tipo is distinct from old.tipo then
    new.role := null;
  end if;
  if new.role is null then
    new.role := case lower(coalesce(new.tipo, 'motoboy'))
      when 'admin' then 'ADMIN'
      when 'gestor' then 'GESTOR'
      when 'administrativo' then 'ADMINISTRATIVO'
      else 'MOTOBOY'
    end;
  end if;
  new.tipo := lower(new.role);
  new.roles := array[new.role, lower(new.role)];
  if tg_op = 'UPDATE' and new.ativo is distinct from old.ativo then
    new.deactivated_at := case when new.ativo then null else now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger profiles_sync_role
  before insert or update on public.profiles
  for each row execute function app.sync_profile_role();

-- ---------------------------------------------------------------------------
-- Funções de contexto usadas pelas políticas RLS
-- ---------------------------------------------------------------------------

create or replace function app.company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id
    from public.profiles p
    join public.companies c on c.id = p.company_id and c.status in ('active', 'trial')
   where p.id = (select auth.uid()) and p.ativo
$$;

create or replace function app.role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.ativo
$$;

create or replace function app.has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role, p.company_id
      from public.profiles p
      join public.companies c on c.id = p.company_id and c.status in ('active', 'trial')
     where p.id = (select auth.uid()) and p.ativo
  )
  select coalesce((
    select case
      when me.role = 'ADMIN' then true
      else coalesce(
        (select up.allowed from public.user_permissions up
          where up.user_id = me.id and up.permission_key = p_key),
        (select o.allowed from public.company_role_overrides o
          where o.company_id = me.company_id and o.role = me.role and o.permission_key = p_key),
        exists (select 1 from public.role_permissions rp
                 where rp.role = me.role and rp.permission_key = p_key)
      )
    end
    from me
  ), false)
$$;

-- Lista efetiva de permissões de um usuário (usada pela interface e pela API).
create or replace function app.effective_permissions(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role, p.company_id from public.profiles p where p.id = p_user and p.ativo
  )
  select coalesce(array_agg(perm.key order by perm.key), '{}')
    from public.permissions perm, me
   where perm.is_legacy = false
     and (
       me.role = 'ADMIN'
       or coalesce(
         (select up.allowed from public.user_permissions up
           where up.user_id = me.id and up.permission_key = perm.key),
         (select o.allowed from public.company_role_overrides o
           where o.company_id = me.company_id and o.role = me.role and o.permission_key = perm.key),
         exists (select 1 from public.role_permissions rp
                  where rp.role = me.role and rp.permission_key = perm.key)
       )
     )
$$;

grant execute on function app.normalize(text) to authenticated, anon, service_role;
grant execute on function app.company_id() to authenticated, service_role;
grant execute on function app.role() to authenticated, service_role;
grant execute on function app.has_perm(text) to authenticated, service_role;
revoke execute on function app.effective_permissions(uuid) from public, anon;
grant execute on function app.effective_permissions(uuid) to service_role;

-- Impede que usuários alterem campos sensíveis do próprio perfil.
create or replace function app.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- service_role (servidor) e migrations não possuem auth.uid().
  if v_actor is null then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Não é permitido trocar a empresa do usuário.' using errcode = '42501';
  end if;

  if new.id = v_actor then
    if new.role is distinct from old.role
       or new.tipo is distinct from old.tipo
       or new.ativo is distinct from old.ativo
       or new.matricula is distinct from old.matricula then
      raise exception 'Você não pode alterar a própria função, matrícula ou status.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not app.has_perm('usuarios.gerenciar') or old.company_id is distinct from app.company_id() then
    raise exception 'Operação não autorizada.' using errcode = '42501';
  end if;

  if (new.role = 'ADMIN' or old.role = 'ADMIN' or lower(new.tipo) = 'admin') and app.role() <> 'ADMIN' then
    raise exception 'Somente administradores podem alterar contas de administrador.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function app.protect_profile_fields();

-- O legado has_permission passa a respeitar revogações individuais.
create or replace function public.has_permission(permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.has_perm(permission)
      or exists (
        select 1 from public.profiles p
          join public.role_permissions rp on rp.role = any(p.roles)
         where p.id = (select auth.uid()) and p.ativo and rp.permission_key = permission
           and not exists (select 1 from public.user_permissions up
                            where up.user_id = p.id and up.permission_key = permission and up.allowed = false)
      )
$$;

-- ---------------------------------------------------------------------------
-- Motoboys
-- ---------------------------------------------------------------------------

create table if not exists public.motoboys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text,
  document text,
  vehicle text,
  plate text,
  pix_key text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motoboys_company_active_idx on public.motoboys (company_id, active, name);
alter table public.motoboys enable row level security;

create or replace trigger motoboys_touch before update on public.motoboys
  for each row execute function app.touch_updated_at();

-- Cria o cadastro de motoboy para perfis MOTOBOY já existentes.
insert into public.motoboys (company_id, profile_id, name, active, created_by)
select p.company_id, p.id, p.nome, p.ativo, null
  from public.profiles p
 where p.role = 'MOTOBOY' and p.company_id is not null
   and not exists (select 1 from public.motoboys m where m.profile_id = p.id);

create or replace function app.motoboy_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.motoboys m
   where m.profile_id = (select auth.uid()) and m.active
     and m.company_id = app.company_id()
$$;
grant execute on function app.motoboy_id() to authenticated, service_role;

-- Login por matrícula: devolve o e-mail interno do Auth para a matrícula ativa.
-- Executada apenas pelo servidor (rota /api/auth/login).
create or replace function public.resolve_login_email(p_matricula text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    join public.companies c on c.id = p.company_id and c.status in ('active', 'trial')
   where lower(p.matricula) = lower(trim(p_matricula)) and p.ativo
   limit 1
$$;
revoke execute on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated, service_role;

-- Contexto da sessão para a interface.
create or replace function public.my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'matricula', p.matricula,
    'nome', p.nome,
    'email', p.email,
    'phone', p.phone,
    'role', p.role,
    'must_change_password', p.must_change_password,
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug),
    'motoboy_id', (select m.id from public.motoboys m where m.profile_id = p.id and m.active limit 1),
    'permissions', to_jsonb(app.effective_permissions(p.id))
  )
  from public.profiles p
  join public.companies c on c.id = p.company_id and c.status in ('active', 'trial')
  where p.id = (select auth.uid()) and p.ativo
$$;
revoke execute on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated, service_role;
