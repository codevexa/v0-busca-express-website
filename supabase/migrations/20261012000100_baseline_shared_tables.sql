-- OSSALA | Controle de Entregas
-- 0001 - Baseline das tabelas compartilhadas.
--
-- O projeto Supabase de produção já possui estas tabelas (criadas pela versão
-- anterior do sistema). Este arquivo garante que um projeto NOVO também tenha
-- a mesma base, usando apenas comandos idempotentes (IF NOT EXISTS). Em um
-- banco existente ele não altera nada.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  address text,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  display_name text,
  logo_path text,
  favicon_path text,
  background_path text,
  brand_primary text not null default '#800020',
  brand_secondary text not null default '#d4af37',
  theme text not null default 'dark',
  menu_style text not null default 'compact',
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  matricula text unique not null,
  nome text not null,
  login text unique,
  tipo text not null check (tipo in ('admin', 'motoboy', 'gestor', 'administrativo')),
  roles text[] not null default '{}',
  ativo boolean not null default true,
  motoboy_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid,
  role text not null default 'operador',
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null,
  fee numeric(10, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  area_id uuid references public.delivery_areas(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.delivery_fee_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  area_id uuid not null references public.delivery_areas(id) on delete cascade,
  fee numeric(10, 2) not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid references auth.users(id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  tele_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete restrict
);

create table if not exists public.role_permissions (
  role text not null,
  permission_key text not null,
  primary key (role, permission_key)
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.neighborhoods enable row level security;
alter table public.delivery_fee_history enable row level security;
alter table public.notifications enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- Primeira empresa (OSSALA). Em banco existente, renomeia a "Empresa principal".
insert into public.companies (name, slug)
values ('OSSALA', 'empresa-principal')
on conflict (slug) do nothing;

update public.companies
   set name = 'OSSALA', updated_at = now()
 where slug = 'empresa-principal' and name = 'Empresa principal';

insert into public.company_settings (company_id, display_name)
select id, 'OSSALA' from public.companies where slug = 'empresa-principal'
on conflict (company_id) do nothing;

update public.company_settings
   set display_name = 'OSSALA', updated_at = now()
 where display_name = 'Empresa principal';
