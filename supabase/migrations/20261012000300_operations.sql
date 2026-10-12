-- OSSALA | 0003 - Configurações, auditoria, áreas, regras de extras e entregas.

-- ---------------------------------------------------------------------------
-- Configurações operacionais por empresa
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  store_name text,
  store_address text,
  store_lat double precision check (store_lat between -90 and 90),
  store_lng double precision check (store_lng between -180 and 180),
  default_city text,
  default_state text check (default_state is null or default_state ~ '^[A-Z]{2}$'),
  closing_split_day integer not null default 15 check (closing_split_day between 1 and 27),
  photo_retention_days integer not null default 90 check (photo_retention_days between 7 and 3650),
  pending_alert_minutes integer not null default 60 check (pending_alert_minutes between 5 and 1440),
  report_title text not null default 'OSSALA - BUSCAR EXPRESS',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

insert into public.app_settings (company_id, store_name)
select c.id, c.name from public.companies c
on conflict (company_id) do nothing;

create or replace trigger app_settings_touch before update on public.app_settings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);
alter table public.audit_logs enable row level security;

-- Grava auditoria genérica. Campos sensíveis nunca são registrados.
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_company uuid;
  v_id text;
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - 'updated_at';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - 'updated_at';
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
      from jsonb_object_keys(v_after) k
     where v_after -> k is distinct from v_before -> k;
    if v_changed is null then
      return new;
    end if;
  end if;

  v_company := coalesce(
    (coalesce(v_after, v_before) ->> 'company_id')::uuid,
    app.company_id()
  );
  v_id := coalesce(v_after, v_before) ->> 'id';

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, before_data, after_data, changed_fields, reason)
  values (v_company, (select auth.uid()), lower(tg_op), tg_table_name, v_id, v_before, v_after, v_changed, v_reason);

  return coalesce(new, old);
end;
$$;

-- Registra eventos de negócio que não são simples alterações de linha.
create or replace function app.audit_event(
  p_action text, p_entity text, p_entity_id text, p_data jsonb default null, p_reason text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, after_data, reason)
  values (app.company_id(), (select auth.uid()), p_action, p_entity, p_entity_id, p_data, p_reason);
$$;

-- ---------------------------------------------------------------------------
-- Áreas de entrega
-- ---------------------------------------------------------------------------

alter table public.delivery_areas add column if not exists code text;
alter table public.delivery_areas add column if not exists charge_amount numeric(12, 2) not null default 0;
alter table public.delivery_areas add column if not exists repass_amount numeric(12, 2) not null default 0;
alter table public.delivery_areas add column if not exists is_special boolean not null default false;
alter table public.delivery_areas add column if not exists notes text;
alter table public.delivery_areas add column if not exists sort_order integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_areas_amounts_check') then
    alter table public.delivery_areas add constraint delivery_areas_amounts_check
      check (charge_amount >= 0 and repass_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_areas_name_len_check') then
    alter table public.delivery_areas add constraint delivery_areas_name_len_check
      check (char_length(trim(name)) between 1 and 60);
  end if;
end $$;

update public.delivery_areas set charge_amount = fee where fee is not null and charge_amount = 0;
update public.delivery_areas
   set is_special = (name ilike '%especial%'),
       sort_order = case name when 'Área 1' then 1 when 'Área 2' then 2 when 'Área 3' then 3 else 10 end
 where sort_order = 0;

-- Garante Área 1, 2 e 3 em todas as empresas (valores são configurados na tela).
insert into public.delivery_areas (company_id, name, color, sort_order)
select c.id, v.name, v.color, v.ord
  from public.companies c
 cross join (values ('Área 1', '#800020', 1), ('Área 2', '#b48a4a', 2), ('Área 3', '#d4af37', 3)) v(name, color, ord)
on conflict (company_id, name) do nothing;

alter table public.delivery_fee_history add column if not exists repass_amount numeric(12, 2);

create or replace function app.track_area_rates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.fee := new.charge_amount;
  new.updated_at := now();
  if tg_op = 'INSERT'
     or new.charge_amount is distinct from old.charge_amount
     or new.repass_amount is distinct from old.repass_amount then
    if tg_op = 'UPDATE' then
      update public.delivery_fee_history
         set valid_to = now()
       where area_id = new.id and valid_to is null;
    end if;
    insert into public.delivery_fee_history (company_id, area_id, fee, repass_amount, created_by)
    values (new.company_id, new.id, new.charge_amount, new.repass_amount, (select auth.uid()));
  end if;
  return new;
end;
$$;

-- AFTER para INSERT (precisa do id persistido) e BEFORE para UPDATE.
create or replace function app.track_area_rates_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.delivery_fee_history (company_id, area_id, fee, repass_amount, created_by)
  values (new.company_id, new.id, new.charge_amount, new.repass_amount, (select auth.uid()));
  return null;
end;
$$;

create or replace trigger delivery_areas_rates before update on public.delivery_areas
  for each row execute function app.track_area_rates();
create or replace trigger delivery_areas_rates_insert after insert on public.delivery_areas
  for each row execute function app.track_area_rates_insert();

-- Bairros: chave normalizada para associação automática com a área.
alter table public.neighborhoods add column if not exists city text;
alter table public.neighborhoods add column if not exists name_key text;
update public.neighborhoods set name_key = app.normalize(name) where name_key is null;

create or replace function app.neighborhood_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := trim(new.name);
  new.name_key := app.normalize(new.name);
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger neighborhoods_key before insert or update on public.neighborhoods
  for each row execute function app.neighborhood_key();

create unique index if not exists neighborhoods_company_key_idx on public.neighborhoods (company_id, name_key);

-- ---------------------------------------------------------------------------
-- Regras de extras (automáticos e modelos de extras manuais)
-- ---------------------------------------------------------------------------

create table if not exists public.extra_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text,
  kind text not null default 'automatico' check (kind in ('automatico', 'manual')),
  charge_amount numeric(12, 2) not null default 0 check (charge_amount >= 0),
  repass_amount numeric(12, 2) not null default 0 check (repass_amount >= 0),
  -- conditions: {"area_ids": [...], "neighborhood_ids": [...], "weekdays": [0-6],
  --              "start_time": "HH:MM", "end_time": "HH:MM"}  (todas opcionais, combinadas com E)
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
alter table public.extra_rules enable row level security;
create or replace trigger extra_rules_touch before update on public.extra_rules
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Entregas (comandas)
-- ---------------------------------------------------------------------------

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  comanda_number text not null check (char_length(trim(comanda_number)) between 1 and 40),
  delivery_date date not null,
  delivery_time time not null,
  address text not null check (char_length(trim(address)) between 3 and 200),
  address_number text check (address_number is null or char_length(address_number) <= 20),
  complement text check (complement is null or char_length(complement) <= 120),
  neighborhood text check (neighborhood is null or char_length(neighborhood) <= 120),
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  city text check (city is null or char_length(city) <= 120),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}-?[0-9]{3}$'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  geocode_source text check (geocode_source in ('nominatim', 'manual', 'mapa')),
  geocoded_at timestamptz,
  motoboy_id uuid references public.motoboys(id) on delete restrict,
  area_id uuid references public.delivery_areas(id) on delete restrict,
  -- Valores vigentes no momento do cadastro (preservados historicamente).
  charge_amount numeric(12, 2) not null default 0 check (charge_amount >= 0),
  repass_amount numeric(12, 2) not null default 0 check (repass_amount >= 0),
  -- Totais mantidos pelo banco a partir de delivery_extras.
  extras_charge_total numeric(12, 2) not null default 0,
  extras_repass_total numeric(12, 2) not null default 0,
  adjustments_total numeric(12, 2) not null default 0,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'entregue', 'cancelada')),
  payment_status text not null default 'pendente'
    check (payment_status in ('pendente', 'em_conferencia', 'aprovado', 'pago', 'cancelado')),
  has_divergence boolean not null default false,
  conference_status text
    check (conference_status in ('aguardando', 'aprovada', 'rejeitada', 'nova_foto')),
  notes text check (notes is null or char_length(notes) <= 1000),
  cancel_reason text,
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_latlng_pair check ((latitude is null) = (longitude is null)),
  constraint deliveries_cancel_reason check (status <> 'cancelada' or char_length(coalesce(cancel_reason, '')) >= 3)
);

-- Impede duplicidade acidental: mesma comanda no mesmo dia (exceto canceladas).
create unique index if not exists deliveries_unique_comanda_day
  on public.deliveries (company_id, delivery_date, lower(comanda_number))
  where status <> 'cancelada';
create index if not exists deliveries_company_date_idx on public.deliveries (company_id, delivery_date desc, delivery_time desc);
create index if not exists deliveries_company_motoboy_idx on public.deliveries (company_id, motoboy_id, delivery_date desc);
create index if not exists deliveries_company_status_idx on public.deliveries (company_id, status, delivery_date desc);
create index if not exists deliveries_company_area_idx on public.deliveries (company_id, area_id, delivery_date desc);
create index if not exists deliveries_company_payment_idx on public.deliveries (company_id, payment_status, delivery_date desc);
create index if not exists deliveries_comanda_idx on public.deliveries (company_id, lower(comanda_number));
alter table public.deliveries enable row level security;

create table if not exists public.delivery_extras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  rule_id uuid references public.extra_rules(id) on delete restrict,
  kind text not null check (kind in ('automatico', 'manual', 'ajuste', 'desconto')),
  description text not null check (char_length(trim(description)) between 2 and 200),
  charge_amount numeric(12, 2) not null default 0,
  repass_amount numeric(12, 2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_extras_sign check (
    case kind
      when 'desconto' then charge_amount <= 0 and repass_amount <= 0
      when 'ajuste' then true
      else charge_amount >= 0 and repass_amount >= 0
    end
  ),
  constraint delivery_extras_auto_rule check (kind <> 'automatico' or rule_id is not null),
  constraint delivery_extras_cancel_reason check (canceled_at is null or char_length(coalesce(cancel_reason, '')) >= 3)
);
-- Um extra automático nunca é lançado duas vezes para a mesma entrega.
create unique index if not exists delivery_extras_rule_once
  on public.delivery_extras (delivery_id, rule_id)
  where rule_id is not null and canceled_at is null;
create index if not exists delivery_extras_delivery_idx on public.delivery_extras (delivery_id);
create index if not exists delivery_extras_company_idx on public.delivery_extras (company_id, created_at desc);
alter table public.delivery_extras enable row level security;

create table if not exists public.delivery_status_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists delivery_status_history_delivery_idx on public.delivery_status_history (delivery_id, changed_at);
alter table public.delivery_status_history enable row level security;

-- Endereços cadastrados manualmente no mapa.
create table if not exists public.manual_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  address text not null check (char_length(trim(address)) between 3 and 200),
  address_number text,
  neighborhood text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  delivery_id uuid references public.deliveries(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manual_addresses_company_idx on public.manual_addresses (company_id, created_at desc);
alter table public.manual_addresses enable row level security;
create or replace trigger manual_addresses_touch before update on public.manual_addresses
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Regras de negócio das entregas
-- ---------------------------------------------------------------------------

-- Verifica se uma regra automática se aplica à entrega.
create or replace function app.rule_matches(p_rule public.extra_rules, p_delivery public.deliveries)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  c jsonb := p_rule.conditions;
  v_start time;
  v_end time;
begin
  if c ? 'area_ids' and jsonb_array_length(c -> 'area_ids') > 0 then
    if p_delivery.area_id is null or not (c -> 'area_ids') ? p_delivery.area_id::text then
      return false;
    end if;
  end if;
  if c ? 'neighborhood_ids' and jsonb_array_length(c -> 'neighborhood_ids') > 0 then
    if p_delivery.neighborhood_id is null or not (c -> 'neighborhood_ids') ? p_delivery.neighborhood_id::text then
      return false;
    end if;
  end if;
  if c ? 'weekdays' and jsonb_array_length(c -> 'weekdays') > 0 then
    if not (c -> 'weekdays') @> to_jsonb(extract(dow from p_delivery.delivery_date)::int) then
      return false;
    end if;
  end if;
  if nullif(c ->> 'start_time', '') is not null and nullif(c ->> 'end_time', '') is not null then
    v_start := (c ->> 'start_time')::time;
    v_end := (c ->> 'end_time')::time;
    if v_start <= v_end then
      if not (p_delivery.delivery_time >= v_start and p_delivery.delivery_time < v_end) then
        return false;
      end if;
    else -- intervalo que atravessa a meia-noite (ex.: 22:00 - 06:00)
      if not (p_delivery.delivery_time >= v_start or p_delivery.delivery_time < v_end) then
        return false;
      end if;
    end if;
  end if;
  return true;
end;
$$;

-- Recalcula os totais de extras da entrega (fonte única dos valores).
create or replace function app.recalc_delivery_totals(p_delivery uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.deliveries d
     set extras_charge_total = coalesce(t.charge, 0),
         extras_repass_total = coalesce(t.repass, 0),
         adjustments_total = coalesce(t.adjust, 0)
    from (
      select
        sum(e.charge_amount) as charge,
        sum(e.repass_amount) filter (where e.kind in ('automatico', 'manual')) as repass,
        sum(e.repass_amount) filter (where e.kind in ('ajuste', 'desconto')) as adjust
      from public.delivery_extras e
      where e.delivery_id = p_delivery and e.canceled_at is null
    ) t
   where d.id = p_delivery
     and (d.extras_charge_total, d.extras_repass_total, d.adjustments_total)
         is distinct from (coalesce(t.charge, 0), coalesce(t.repass, 0), coalesce(t.adjust, 0));
$$;

-- Aplica/cancela extras automáticos conforme as regras vigentes.
create or replace function app.apply_auto_extras(p_delivery uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
  r public.extra_rules;
begin
  select * into d from public.deliveries where id = p_delivery;
  if not found or d.status = 'cancelada' or d.payment_status in ('aprovado', 'pago') then
    return;
  end if;

  for r in
    select * from public.extra_rules
     where company_id = d.company_id and kind = 'automatico' and active
  loop
    if app.rule_matches(r, d) then
      insert into public.delivery_extras (company_id, delivery_id, rule_id, kind, description, charge_amount, repass_amount, created_by)
      values (d.company_id, d.id, r.id, 'automatico', r.name, r.charge_amount, r.repass_amount, (select auth.uid()))
      on conflict (delivery_id, rule_id) where rule_id is not null and canceled_at is null do nothing;
    else
      update public.delivery_extras
         set canceled_at = now(),
             canceled_by = (select auth.uid()),
             cancel_reason = 'Regra automática deixou de se aplicar após alteração da entrega.'
       where delivery_id = d.id and rule_id = r.id and kind = 'automatico' and canceled_at is null;
    end if;
  end loop;
end;
$$;

-- BEFORE INSERT/UPDATE: normalização, área, valores vigentes e status.
create or replace function app.deliveries_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_nb public.neighborhoods;
  v_area public.delivery_areas;
  v_area_changed boolean;
begin
  new.comanda_number := upper(trim(new.comanda_number));
  new.address := trim(new.address);
  new.neighborhood := nullif(trim(coalesce(new.neighborhood, '')), '');
  new.city := nullif(trim(coalesce(new.city, '')), '');
  new.state := nullif(upper(trim(coalesce(new.state, ''))), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.company_id := coalesce(app.company_id(), new.company_id);
    new.created_by := coalesce(v_actor, new.created_by);
    new.status := coalesce(new.status, 'pendente');
    new.payment_status := 'pendente';
    new.extras_charge_total := 0;
    new.extras_repass_total := 0;
    new.adjustments_total := 0;
  else
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(v_actor, new.updated_by);
    -- Totais e situação de pagamento são mantidos exclusivamente pelo banco.
    if current_setting('app.internal_write', true) is distinct from 'on' then
      new.extras_charge_total := old.extras_charge_total;
      new.extras_repass_total := old.extras_repass_total;
      new.adjustments_total := old.adjustments_total;
      new.payment_status := old.payment_status;
    end if;
  end if;

  -- Bairro -> associação automática à área cadastrada.
  if new.neighborhood is not null
     and (tg_op = 'INSERT' or new.neighborhood is distinct from old.neighborhood or new.neighborhood_id is null) then
    select * into v_nb from public.neighborhoods
     where company_id = new.company_id and name_key = app.normalize(new.neighborhood) and active
     limit 1;
    if found then
      new.neighborhood_id := v_nb.id;
      if new.area_id is null or (tg_op = 'UPDATE' and new.area_id is not distinct from old.area_id and v_nb.area_id is not null) then
        new.area_id := coalesce(v_nb.area_id, new.area_id);
      end if;
    elsif tg_op = 'UPDATE' and new.neighborhood is distinct from old.neighborhood then
      new.neighborhood_id := null;
    end if;
  end if;

  if new.motoboy_id is not null and (tg_op = 'INSERT' or new.motoboy_id is distinct from old.motoboy_id) then
    if not exists (
      select 1 from public.motoboys m where m.id = new.motoboy_id and m.company_id = new.company_id and m.active
    ) then
      raise exception 'Motoboy inválido ou inativo.' using errcode = '23514';
    end if;
    if v_actor is not null and not app.has_perm('entregas.atribuir') then
      raise exception 'Sem permissão para atribuir entregas.' using errcode = '42501';
    end if;
  end if;

  if new.area_id is not null then
    select * into v_area from public.delivery_areas where id = new.area_id and company_id = new.company_id;
    if not found then
      raise exception 'Área de entrega inválida.' using errcode = '23514';
    end if;
  end if;

  -- Valores vigentes da área no momento da operação.
  v_area_changed := tg_op = 'INSERT' or new.area_id is distinct from old.area_id;
  if v_area_changed then
    if tg_op = 'UPDATE' and old.payment_status in ('aprovado', 'pago') then
      raise exception 'A área não pode ser alterada: o repasse desta entrega já foi aprovado ou pago.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.area_id is not null and not v_area.active then
      raise exception 'Área inativa.' using errcode = '23514';
    end if;
    new.charge_amount := coalesce(v_area.charge_amount, 0);
    new.repass_amount := coalesce(v_area.repass_amount, 0);
  elsif tg_op = 'UPDATE' then
    new.charge_amount := old.charge_amount;
    new.repass_amount := old.repass_amount;
  end if;

  if tg_op = 'UPDATE' and new.motoboy_id is distinct from old.motoboy_id then
    if old.payment_status in ('aprovado', 'pago') then
      raise exception 'O motoboy não pode ser alterado: o repasse desta entrega já foi aprovado ou pago.' using errcode = '23514';
    end if;
    if new.motoboy_id is null and v_actor is not null and not app.has_perm('entregas.atribuir') then
      raise exception 'Sem permissão para atribuir entregas.' using errcode = '42501';
    end if;
  end if;

  -- Transições de status.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'entregue' and new.status in ('pendente', 'em_andamento')
       and v_actor is not null and not app.has_perm('entregas.corrigir_confirmacao') then
      raise exception 'Sem permissão para corrigir uma confirmação de entrega.' using errcode = '42501';
    end if;
    if (new.status = 'cancelada' or old.status = 'cancelada')
       and v_actor is not null and not app.has_perm('entregas.excluir') then
      raise exception 'Sem permissão para cancelar ou reativar entregas.' using errcode = '42501';
    end if;
    if new.status = 'cancelada' and old.payment_status in ('aprovado', 'pago') then
      raise exception 'Entrega com repasse aprovado ou pago não pode ser cancelada.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'entregue' and (tg_op = 'INSERT' or old.status <> 'entregue') then
    new.delivered_at := now();
    new.delivered_by := v_actor;
  elsif new.status <> 'entregue' then
    new.delivered_at := null;
    new.delivered_by := null;
  end if;

  if new.status = 'cancelada' and (tg_op = 'INSERT' or old.status <> 'cancelada') then
    new.canceled_at := now();
    new.canceled_by := v_actor;
  elsif new.status <> 'cancelada' then
    new.canceled_at := null;
    new.canceled_by := null;
    new.cancel_reason := null;
  end if;

  if new.latitude is not null and (tg_op = 'INSERT' or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
    new.geocoded_at := now();
    new.geocode_source := coalesce(new.geocode_source, 'manual');
  end if;

  return new;
end;
$$;

create or replace function app.deliveries_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.delivery_status_history (company_id, delivery_id, from_status, to_status, changed_by, note)
    values (new.company_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            (select auth.uid()), nullif(current_setting('app.change_reason', true), ''));
  end if;

  if tg_op = 'INSERT'
     or new.area_id is distinct from old.area_id
     or new.neighborhood_id is distinct from old.neighborhood_id
     or new.delivery_time is distinct from old.delivery_time
     or new.delivery_date is distinct from old.delivery_date then
    perform app.apply_auto_extras(new.id);
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada' then
    perform set_config('app.internal_write', 'on', true);
    update public.deliveries set payment_status = 'cancelado' where id = new.id and payment_status <> 'cancelado';
    perform set_config('app.internal_write', 'off', true);
  elsif tg_op = 'UPDATE' and old.status = 'cancelada' and new.status <> 'cancelada' then
    perform set_config('app.internal_write', 'on', true);
    update public.deliveries set payment_status = 'pendente' where id = new.id and payment_status = 'cancelado';
    perform set_config('app.internal_write', 'off', true);
  end if;

  return null;
end;
$$;

create or replace trigger deliveries_before_write before insert or update on public.deliveries
  for each row execute function app.deliveries_before_write();
create or replace trigger deliveries_after_write after insert or update on public.deliveries
  for each row execute function app.deliveries_after_write();

-- Extras: validação e recálculo.
create or replace function app.delivery_extras_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  d public.deliveries;
begin
  select * into d from public.deliveries where id = new.delivery_id;
  if not found then
    raise exception 'Entrega não encontrada.' using errcode = '23503';
  end if;

  new.company_id := d.company_id;
  new.description := trim(new.description);
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_actor, new.created_by);
    if d.status = 'cancelada' then
      raise exception 'Não é possível lançar extras em entrega cancelada.' using errcode = '23514';
    end if;
    if d.payment_status in ('aprovado', 'pago') then
      raise exception 'O repasse desta entrega já foi aprovado ou pago. Lance o ajuste no próximo período.' using errcode = '23514';
    end if;
    if v_actor is not null and new.kind in ('ajuste', 'desconto') and not app.has_perm('financeiro.ajustar') then
      raise exception 'Sem permissão para lançar ajustes ou descontos.' using errcode = '42501';
    end if;
    if v_actor is not null and new.kind = 'automatico' then
      -- Extras automáticos só podem ser criados pelo próprio banco (apply_auto_extras).
      if pg_trigger_depth() < 2 then
        raise exception 'Extras automáticos são calculados pelo sistema.' using errcode = '42501';
      end if;
    end if;
  else
    -- Apenas descrição, valores (manuais/ajustes) e cancelamento podem mudar.
    new.company_id := old.company_id;
    new.delivery_id := old.delivery_id;
    new.rule_id := old.rule_id;
    new.kind := old.kind;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(v_actor, new.updated_by);
    if old.canceled_at is not null and new.canceled_at is null then
      raise exception 'Um extra cancelado não pode ser reativado. Lance um novo extra.' using errcode = '23514';
    end if;
    if old.kind = 'automatico' and pg_trigger_depth() < 2
       and (new.charge_amount is distinct from old.charge_amount or new.repass_amount is distinct from old.repass_amount) then
      raise exception 'Valores de extras automáticos seguem a regra cadastrada.' using errcode = '23514';
    end if;
    if d.payment_status in ('aprovado', 'pago') and pg_trigger_depth() < 2 then
      raise exception 'O repasse desta entrega já foi aprovado ou pago.' using errcode = '23514';
    end if;
    if new.canceled_at is not null and old.canceled_at is null then
      new.canceled_by := coalesce(v_actor, new.canceled_by);
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.delivery_extras_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.internal_write', 'on', true);
  perform app.recalc_delivery_totals(coalesce(new.delivery_id, old.delivery_id));
  perform set_config('app.internal_write', 'off', true);
  return null;
end;
$$;

create or replace trigger delivery_extras_before_write before insert or update on public.delivery_extras
  for each row execute function app.delivery_extras_before_write();
create or replace trigger delivery_extras_after_write after insert or update or delete on public.delivery_extras
  for each row execute function app.delivery_extras_after_write();

-- Visão financeira centralizada (mesma fórmula para telas, relatórios e fechamentos).
create or replace view public.delivery_financials
with (security_invoker = true)
as
select
  d.*,
  (d.charge_amount + d.extras_charge_total)::numeric(12, 2) as charge_total,
  (d.repass_amount + d.extras_repass_total)::numeric(12, 2) as repass_gross,
  (d.repass_amount + d.extras_repass_total + d.adjustments_total)::numeric(12, 2) as repass_net,
  m.name as motoboy_name,
  a.name as area_name,
  a.color as area_color
from public.deliveries d
left join public.motoboys m on m.id = d.motoboy_id
left join public.delivery_areas a on a.id = d.area_id;

-- Auditoria das tabelas críticas desta etapa.
create or replace trigger audit_deliveries after insert or update or delete on public.deliveries
  for each row execute function app.audit_row();
create or replace trigger audit_delivery_extras after insert or update or delete on public.delivery_extras
  for each row execute function app.audit_row();
create or replace trigger audit_delivery_areas after insert or update or delete on public.delivery_areas
  for each row execute function app.audit_row();
create or replace trigger audit_neighborhoods after insert or update or delete on public.neighborhoods
  for each row execute function app.audit_row();
create or replace trigger audit_extra_rules after insert or update or delete on public.extra_rules
  for each row execute function app.audit_row();
create or replace trigger audit_motoboys after insert or update or delete on public.motoboys
  for each row execute function app.audit_row();
create or replace trigger audit_app_settings after insert or update on public.app_settings
  for each row execute function app.audit_row();
create or replace trigger audit_user_permissions after insert or update or delete on public.user_permissions
  for each row execute function app.audit_row();
create or replace trigger audit_company_role_overrides after insert or update or delete on public.company_role_overrides
  for each row execute function app.audit_row();
create or replace trigger audit_profiles after insert or update on public.profiles
  for each row execute function app.audit_row();
