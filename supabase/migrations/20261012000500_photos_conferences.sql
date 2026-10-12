-- OSSALA | 0005 - Fotos de comandas e conferência por OCR.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-photos', 'delivery-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Logotipo e identidade visual: leitura pública (exibido na tela de login).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.delivery_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  delivery_id uuid references public.deliveries(id) on delete set null,
  comanda_number text,
  motoboy_id uuid references public.motoboys(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  source text not null check (source in ('camera', 'galeria')),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists delivery_photos_company_idx on public.delivery_photos (company_id, created_at desc);
create index if not exists delivery_photos_delivery_idx on public.delivery_photos (delivery_id);
create index if not exists delivery_photos_expires_idx on public.delivery_photos (expires_at) where deleted_at is null;
alter table public.delivery_photos enable row level security;

create or replace function app.delivery_photos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention integer;
begin
  new.company_id := app.company_id();
  new.uploaded_by := (select auth.uid());
  if new.company_id is null or new.uploaded_by is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.company_id::text then
    raise exception 'Caminho de armazenamento inválido.' using errcode = '42501';
  end if;
  new.motoboy_id := coalesce(new.motoboy_id, app.motoboy_id());
  new.comanda_number := nullif(upper(trim(coalesce(new.comanda_number, ''))), '');
  select photo_retention_days into v_retention from public.app_settings where company_id = new.company_id;
  new.expires_at := now() + make_interval(days => coalesce(v_retention, 90));
  return new;
end;
$$;

create or replace trigger delivery_photos_before_insert before insert on public.delivery_photos
  for each row execute function app.delivery_photos_before_insert();

create table if not exists public.delivery_conferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  photo_id uuid references public.delivery_photos(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  status text not null default 'processando'
    check (status in ('processando', 'aguardando_revisao', 'falha_ocr', 'aprovada', 'rejeitada', 'nova_foto_solicitada')),
  ocr_provider text,
  ocr_model text,
  ocr_raw_text text,
  ocr_fields jsonb not null default '{}'::jsonb,
  ocr_confidence numeric(4, 3) check (ocr_confidence is null or ocr_confidence between 0 and 1),
  comparison jsonb not null default '[]'::jsonb,
  corrected_fields jsonb not null default '{}'::jsonb,
  divergence_count integer not null default 0,
  error_message text,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_conferences_company_idx on public.delivery_conferences (company_id, created_at desc);
create index if not exists delivery_conferences_delivery_idx on public.delivery_conferences (delivery_id);
create index if not exists delivery_conferences_status_idx on public.delivery_conferences (company_id, status);
alter table public.delivery_conferences enable row level security;

create or replace function app.delivery_conferences_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.company_id := app.company_id();
    new.created_by := v_actor;
    if new.company_id is null then
      raise exception 'Sessão inválida.' using errcode = '42501';
    end if;
    if new.status in ('aprovada', 'rejeitada', 'nova_foto_solicitada') then
      raise exception 'Uma conferência nova não pode nascer revisada.' using errcode = '23514';
    end if;
  else
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.photo_id := old.photo_id;
    new.created_at := old.created_at;
    if old.status in ('aprovada', 'rejeitada', 'nova_foto_solicitada') and v_actor is not null then
      raise exception 'Esta conferência já foi revisada.' using errcode = '23514';
    end if;
    if new.status in ('aprovada', 'rejeitada', 'nova_foto_solicitada') and new.status is distinct from old.status then
      if v_actor is not null and not app.has_perm('conferencia.aprovar') then
        raise exception 'Sem permissão para revisar conferências.' using errcode = '42501';
      end if;
      new.reviewed_by := v_actor;
      new.reviewed_at := now();
    end if;
  end if;

  if new.delivery_id is not null and not exists (
    select 1 from public.deliveries d where d.id = new.delivery_id and d.company_id = new.company_id
  ) then
    raise exception 'Entrega inválida.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace trigger delivery_conferences_before_write before insert or update on public.delivery_conferences
  for each row execute function app.delivery_conferences_before_write();

-- Reflete o resultado da conferência na entrega.
create or replace function app.delivery_conferences_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_id is null then
    return null;
  end if;
  perform set_config('app.internal_write', 'on', true);
  update public.deliveries
     set conference_status = case new.status
           when 'aprovada' then 'aprovada'
           when 'rejeitada' then 'rejeitada'
           when 'nova_foto_solicitada' then 'nova_foto'
           else 'aguardando'
         end,
         has_divergence = case new.status
           when 'aprovada' then false
           when 'rejeitada' then true
           else has_divergence or new.divergence_count > 0
         end
   where id = new.delivery_id;
  perform set_config('app.internal_write', 'off', true);
  return null;
end;
$$;

create or replace trigger delivery_conferences_after_write after insert or update on public.delivery_conferences
  for each row execute function app.delivery_conferences_after_write();

create or replace trigger audit_delivery_conferences after insert or update on public.delivery_conferences
  for each row execute function app.audit_row();
create or replace trigger audit_delivery_photos after insert or update on public.delivery_photos
  for each row execute function app.audit_row();
