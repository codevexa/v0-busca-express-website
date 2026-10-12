begin;

do $$
begin
  if to_regnamespace('extensions') is not null then
    create extension if not exists btree_gist with schema extensions;
  else
    create extension if not exists btree_gist;
  end if;
end $$;

create table if not exists public.closing_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'aberto'
    check (status in ('aberto', 'consolidado', 'aprovado', 'encerrado', 'reaberto')),
  totals jsonb not null default '{}'::jsonb,
  divergences jsonb not null default '[]'::jsonb,
  source_fingerprint text,
  corrections jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  generated_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopen_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closing_periods_range check (end_date >= start_date and end_date - start_date <= 62),
  constraint closing_periods_no_overlap exclude using gist (
    company_id with =, daterange(start_date, end_date, '[]') with &&
  )
);
create index if not exists closing_periods_company_idx on public.closing_periods (company_id, start_date desc);
alter table public.closing_periods enable row level security;

create or replace trigger closing_periods_touch before update on public.closing_periods
  for each row execute function app.touch_updated_at();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_closing_period_id_fkey') then
    alter table public.payments add constraint payments_closing_period_id_fkey
      foreign key (closing_period_id) references public.closing_periods(id) on delete set null;
  end if;
end $$;

create table if not exists public.closing_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  closing_id uuid not null references public.closing_periods(id) on delete cascade,
  motoboy_id uuid not null references public.motoboys(id) on delete restrict,
  motoboy_name text not null,
  deliveries_count integer not null default 0,
  by_area jsonb not null default '{}'::jsonb,
  charge_total numeric(12, 2) not null default 0,
  repass_base numeric(12, 2) not null default 0,
  extras_total numeric(12, 2) not null default 0,
  adjustments_total numeric(12, 2) not null default 0,
  gross_total numeric(12, 2) not null default 0,
  net_total numeric(12, 2) not null default 0,
  paid_total numeric(12, 2) not null default 0,
  pending_total numeric(12, 2) not null default 0,
  divergences_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (closing_id, motoboy_id)
);
create index if not exists closing_items_closing_idx on public.closing_items (closing_id);
alter table public.closing_items enable row level security;

create or replace function app.closed_period_for(p_company uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.closing_periods
   where company_id = p_company and status = 'encerrado'
     and p_date between start_date and end_date
   limit 1
$$;

create or replace function app.assert_period_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_dates date[];
  v_date date;
begin
  if current_setting('app.internal_write', true) = 'on' then
    return coalesce(new, old);
  end if;
  if current_setting('app.closing_override', true) = 'on' and app.has_perm('fechamentos.corrigir') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'deliveries' then
    v_company := coalesce(new.company_id, old.company_id);
    v_dates := array_remove(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.delivery_date end,
      case when tg_op in ('INSERT', 'UPDATE') then new.delivery_date end
    ], null);
  else
    select d.company_id, array[d.delivery_date] into v_company, v_dates
      from public.deliveries d where d.id = coalesce(new.delivery_id, old.delivery_id);
  end if;

  foreach v_date in array coalesce(v_dates, '{}') loop
    if app.closed_period_for(v_company, v_date) is not null then
      raise exception 'O período de % está encerrado. Correções exigem autorização e justificativa.',
        to_char(v_date, 'DD/MM/YYYY') using errcode = '42501';
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace trigger deliveries_period_lock before insert or update or delete on public.deliveries
  for each row execute function app.assert_period_open();
create or replace trigger delivery_extras_period_lock before insert or update or delete on public.delivery_extras
  for each row execute function app.assert_period_open();

create or replace function app.closing_fingerprint(p_company uuid, p_start date, p_end date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(
           d.id::text || d.updated_at::text || d.payment_status || d.status
           || d.extras_repass_total::text || d.adjustments_total::text, '|' order by d.id), ''))
    from public.deliveries d
   where d.company_id = p_company and d.delivery_date between p_start and p_end
$$;

create or replace function app.closing_build(p_closing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.closing_periods;
  v_totals jsonb;
  v_divergences jsonb;
begin
  select * into c from public.closing_periods where id = p_closing;

  delete from public.closing_items where closing_id = c.id;

  insert into public.closing_items (
    company_id, closing_id, motoboy_id, motoboy_name, deliveries_count, by_area, charge_total,
    repass_base, extras_total, adjustments_total, gross_total, net_total, paid_total, pending_total, divergences_count)
  select
    c.company_id, c.id, f.motoboy_id, max(f.motoboy_name), count(*),
    (select coalesce(jsonb_object_agg(x.area, x.qtd), '{}'::jsonb) from (
       select coalesce(g.area_name, 'Sem área') as area, count(*) as qtd
         from public.delivery_financials g
        where g.company_id = c.company_id and g.motoboy_id = f.motoboy_id and g.status = 'entregue'
          and g.delivery_date between c.start_date and c.end_date
        group by 1) x),
    sum(f.charge_total), sum(f.repass_amount), sum(f.extras_repass_total), sum(f.adjustments_total),
    sum(f.repass_gross), sum(f.repass_net),
    coalesce(sum(f.repass_net) filter (where f.payment_status = 'pago'), 0),
    sum(f.repass_net) - coalesce(sum(f.repass_net) filter (where f.payment_status = 'pago'), 0),
    count(*) filter (where f.has_divergence)
  from public.delivery_financials f
  where f.company_id = c.company_id
    and f.delivery_date between c.start_date and c.end_date
    and f.status = 'entregue'
    and f.motoboy_id is not null
  group by f.motoboy_id;

  select jsonb_build_object(
    'motoboys', count(*),
    'deliveries_count', coalesce(sum(deliveries_count), 0),
    'charge_total', coalesce(sum(charge_total), 0),
    'repass_base', coalesce(sum(repass_base), 0),
    'extras_total', coalesce(sum(extras_total), 0),
    'adjustments_total', coalesce(sum(adjustments_total), 0),
    'gross_total', coalesce(sum(gross_total), 0),
    'net_total', coalesce(sum(net_total), 0),
    'paid_total', coalesce(sum(paid_total), 0),
    'pending_total', coalesce(sum(pending_total), 0),
    'by_area', (
      select coalesce(jsonb_object_agg(x.area, x.qtd), '{}'::jsonb) from (
        select coalesce(g.area_name, 'Sem área') as area, count(*) as qtd
          from public.delivery_financials g
         where g.company_id = c.company_id and g.status = 'entregue'
           and g.delivery_date between c.start_date and c.end_date
         group by 1) x)
  ) into v_totals
  from public.closing_items where closing_id = c.id;

  select coalesce(jsonb_agg(x order by x ->> 'type', x ->> 'date'), '[]'::jsonb) into v_divergences
  from (
    select jsonb_build_object('type', 'nao_concluida', 'delivery_id', d.id, 'comanda', d.comanda_number,
                              'date', d.delivery_date, 'message', 'Entrega ainda ' || replace(d.status, '_', ' ')) as x
      from public.deliveries d
     where d.company_id = c.company_id and d.delivery_date between c.start_date and c.end_date
       and d.status in ('pendente', 'em_andamento')
    union all
    select jsonb_build_object('type', 'sem_motoboy', 'delivery_id', d.id, 'comanda', d.comanda_number,
                              'date', d.delivery_date, 'message', 'Entrega concluída sem motoboy')
      from public.deliveries d
     where d.company_id = c.company_id and d.delivery_date between c.start_date and c.end_date
       and d.status = 'entregue' and d.motoboy_id is null
    union all
    select jsonb_build_object('type', 'sem_area', 'delivery_id', d.id, 'comanda', d.comanda_number,
                              'date', d.delivery_date, 'message', 'Entrega concluída sem área definida')
      from public.deliveries d
     where d.company_id = c.company_id and d.delivery_date between c.start_date and c.end_date
       and d.status = 'entregue' and d.area_id is null
    union all
    select jsonb_build_object('type', 'divergencia', 'delivery_id', d.id, 'comanda', d.comanda_number,
                              'date', d.delivery_date, 'message', 'Divergência de conferência em aberto')
      from public.deliveries d
     where d.company_id = c.company_id and d.delivery_date between c.start_date and c.end_date
       and d.status <> 'cancelada' and d.has_divergence
    union all
    select jsonb_build_object('type', 'conferencia_pendente', 'delivery_id', d.id, 'comanda', d.comanda_number,
                              'date', d.delivery_date, 'message', 'Conferência aguardando revisão')
      from public.deliveries d
     where d.company_id = c.company_id and d.delivery_date between c.start_date and c.end_date
       and d.status <> 'cancelada' and d.conference_status = 'aguardando'
  ) q;

  update public.closing_periods
     set totals = v_totals,
         divergences = v_divergences,
         source_fingerprint = app.closing_fingerprint(c.company_id, c.start_date, c.end_date)
   where id = c.id;
end;
$$;

create or replace function public.closing_generate(p_start date, p_end date, p_label text default null)
returns public.closing_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.company_id();
  c public.closing_periods;
begin
  if v_company is null or not app.has_perm('fechamentos.criar') then
    raise exception 'Sem permissão para gerar fechamentos.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;

  select * into c from public.closing_periods
   where company_id = v_company and start_date = p_start and end_date = p_end
   for update;

  if not found then
    insert into public.closing_periods (company_id, label, start_date, end_date, status)
    values (v_company,
            coalesce(nullif(trim(p_label), ''), to_char(p_start, 'DD/MM/YYYY') || ' a ' || to_char(p_end, 'DD/MM/YYYY')),
            p_start, p_end, 'aberto')
    returning * into c;
  elsif c.status in ('aprovado', 'encerrado') then
    raise exception 'Este fechamento está %. Reabra o período para gerar novamente.', c.status using errcode = '23514';
  end if;

  perform app.closing_build(c.id);

  update public.closing_periods
     set status = 'consolidado', generated_at = now(), generated_by = (select auth.uid())
   where id = c.id
   returning * into c;

  perform app.notify_permission(
    v_company, 'fechamentos.aprovar', 'fechamento',
    'Fechamento aguardando aprovação',
    format('%s — %s entregas, total líquido R$ %s', c.label, c.totals ->> 'deliveries_count',
           to_char((c.totals ->> 'net_total')::numeric, 'FM999G999G990D00')),
    '/app/fechamentos?id=' || c.id, 'closing', c.id,
    'closing-review:' || c.id || ':' || c.source_fingerprint, (select auth.uid())
  );
  return c;
end;
$$;

create or replace function app.closing_assert_fresh(c public.closing_periods)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if c.source_fingerprint is distinct from app.closing_fingerprint(c.company_id, c.start_date, c.end_date) then
    raise exception 'Os registros do período foram alterados após a consolidação. Gere a consolidação novamente.'
      using errcode = '40001';
  end if;
end;
$$;

create or replace function public.closing_approve(p_closing uuid)
returns public.closing_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.closing_periods;
begin
  if not app.has_perm('fechamentos.aprovar') then
    raise exception 'Sem permissão para aprovar fechamentos.' using errcode = '42501';
  end if;
  select * into c from public.closing_periods where id = p_closing and company_id = app.company_id() for update;
  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = '23503';
  end if;
  if c.status <> 'consolidado' then
    raise exception 'Somente fechamentos consolidados podem ser aprovados (situação atual: %).', c.status using errcode = '23514';
  end if;
  perform app.closing_assert_fresh(c);
  update public.closing_periods
     set status = 'aprovado', approved_at = now(), approved_by = (select auth.uid())
   where id = c.id returning * into c;
  return c;
end;
$$;

create or replace function public.closing_close(p_closing uuid)
returns public.closing_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.closing_periods;
begin
  if not app.has_perm('fechamentos.confirmar') then
    raise exception 'Sem permissão para encerrar períodos.' using errcode = '42501';
  end if;
  select * into c from public.closing_periods where id = p_closing and company_id = app.company_id() for update;
  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = '23503';
  end if;
  if c.status <> 'aprovado' then
    raise exception 'Aprove o fechamento antes de encerrar o período (situação atual: %).', c.status using errcode = '23514';
  end if;
  perform app.closing_assert_fresh(c);
  update public.closing_periods
     set status = 'encerrado', closed_at = now(), closed_by = (select auth.uid())
   where id = c.id returning * into c;
  return c;
end;
$$;

create or replace function public.closing_reopen(p_closing uuid, p_reason text)
returns public.closing_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.closing_periods;
begin
  if not app.has_perm('fechamentos.reabrir') then
    raise exception 'Sem permissão para reabrir períodos.' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then
    raise exception 'Informe uma justificativa com pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  select * into c from public.closing_periods where id = p_closing and company_id = app.company_id() for update;
  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = '23503';
  end if;
  if c.status not in ('aprovado', 'encerrado') then
    raise exception 'Somente fechamentos aprovados ou encerrados podem ser reabertos.' using errcode = '23514';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  update public.closing_periods
     set status = 'reaberto', reopened_at = now(), reopened_by = (select auth.uid()), reopen_reason = trim(p_reason)
   where id = c.id returning * into c;
  return c;
end;
$$;

create or replace function public.correct_closed_delivery(p_delivery_id uuid, p_changes jsonb, p_reason text)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
  v_closing uuid;
  v_allowed text[] := array['comanda_number', 'address', 'address_number', 'complement', 'neighborhood', 'city',
                            'state', 'motoboy_id', 'area_id', 'status', 'cancel_reason', 'notes'];
  v_key text;
begin
  if not app.has_perm('fechamentos.corrigir') then
    raise exception 'Sem permissão para corrigir períodos encerrados.' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then
    raise exception 'Informe uma justificativa com pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any(v_allowed) then
      raise exception 'Campo não permitido na correção: %', v_key using errcode = '22023';
    end if;
  end loop;

  select * into d from public.deliveries where id = p_delivery_id and company_id = app.company_id() for update;
  if not found then
    raise exception 'Entrega não encontrada.' using errcode = '23503';
  end if;
  v_closing := app.closed_period_for(d.company_id, d.delivery_date);
  if v_closing is null then
    raise exception 'A entrega não pertence a um período encerrado; edite-a normalmente.' using errcode = '23514';
  end if;

  perform set_config('app.change_reason', 'Correção pós-fechamento: ' || trim(p_reason), true);
  perform set_config('app.closing_override', 'on', true);

  update public.deliveries t
     set comanda_number = coalesce(p_changes ->> 'comanda_number', t.comanda_number),
         address = coalesce(p_changes ->> 'address', t.address),
         address_number = case when p_changes ? 'address_number' then p_changes ->> 'address_number' else t.address_number end,
         complement = case when p_changes ? 'complement' then p_changes ->> 'complement' else t.complement end,
         neighborhood = case when p_changes ? 'neighborhood' then p_changes ->> 'neighborhood' else t.neighborhood end,
         city = case when p_changes ? 'city' then p_changes ->> 'city' else t.city end,
         state = case when p_changes ? 'state' then p_changes ->> 'state' else t.state end,
         motoboy_id = case when p_changes ? 'motoboy_id' then (p_changes ->> 'motoboy_id')::uuid else t.motoboy_id end,
         area_id = case when p_changes ? 'area_id' then (p_changes ->> 'area_id')::uuid else t.area_id end,
         status = coalesce(p_changes ->> 'status', t.status),
         cancel_reason = case when p_changes ? 'cancel_reason' then p_changes ->> 'cancel_reason' else t.cancel_reason end,
         notes = case when p_changes ? 'notes' then p_changes ->> 'notes' else t.notes end
   where t.id = d.id
   returning * into d;

  perform set_config('app.closing_override', 'off', true);

  perform app.closing_build(v_closing);
  update public.closing_periods
     set corrections = corrections || jsonb_build_array(jsonb_build_object(
           'delivery_id', d.id, 'comanda', d.comanda_number, 'changes', p_changes, 'reason', trim(p_reason),
           'by', (select auth.uid()), 'at', now()))
   where id = v_closing;

  return d;
end;
$$;

revoke execute on function public.closing_generate(date, date, text) from public, anon;
revoke execute on function public.closing_approve(uuid) from public, anon;
revoke execute on function public.closing_close(uuid) from public, anon;
revoke execute on function public.closing_reopen(uuid, text) from public, anon;
revoke execute on function public.correct_closed_delivery(uuid, jsonb, text) from public, anon;
grant execute on function public.closing_generate(date, date, text) to authenticated;
grant execute on function public.closing_approve(uuid) to authenticated;
grant execute on function public.closing_close(uuid) to authenticated;
grant execute on function public.closing_reopen(uuid, text) to authenticated;
grant execute on function public.correct_closed_delivery(uuid, jsonb, text) to authenticated;

create or replace trigger audit_closing_periods after insert or update or delete on public.closing_periods
  for each row execute function app.audit_row();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'closing_periods_select') then
    create policy closing_periods_select on public.closing_periods for select to authenticated
      using (company_id = app.company_id() and app.has_perm('fechamentos.visualizar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'closing_items_select') then
    create policy closing_items_select on public.closing_items for select to authenticated
      using (company_id = app.company_id() and app.has_perm('fechamentos.visualizar'));
  end if;
end $$;
revoke all on public.closing_periods, public.closing_items from anon;
revoke insert, update, delete on public.closing_periods, public.closing_items from authenticated;

alter table public.role_permissions drop constraint if exists role_permissions_permission_key_fkey;
alter table public.user_permissions drop constraint if exists user_permissions_permission_key_fkey;

alter table public.role_permissions
  add constraint role_permissions_permission_key_fkey
  foreign key (permission_key) references public.permissions(key) on delete cascade;
alter table public.user_permissions
  add constraint user_permissions_permission_key_fkey
  foreign key (permission_key) references public.permissions(key) on delete cascade;

insert into public.role_permissions (role, permission_key)
select r.role, p.key
  from (values
    ('GESTOR', array[
      'dashboard.visualizar', 'entregas.visualizar', 'entregas.criar', 'entregas.editar', 'entregas.excluir',
      'entregas.atribuir', 'entregas.confirmar', 'entregas.corrigir_confirmacao', 'entregas.exportar',
      'motoboys.visualizar', 'motoboys.criar', 'motoboys.editar', 'areas.visualizar', 'areas.editar',
      'extras.visualizar', 'extras.criar', 'extras.editar', 'financeiro.visualizar', 'financeiro.ajustar',
      'pagamentos.visualizar', 'pagamentos.criar', 'pagamentos.aprovar', 'pagamentos.confirmar',
      'fechamentos.visualizar', 'fechamentos.criar', 'fechamentos.aprovar', 'fechamentos.confirmar',
      'mapa.visualizar', 'mapa.editar', 'fotos.visualizar', 'fotos.criar', 'conferencia.visualizar',
      'conferencia.criar', 'conferencia.aprovar', 'relatorios.visualizar', 'relatorios.exportar',
      'alertas.visualizar', 'usuarios.visualizar', 'auditoria.visualizar']),
    ('ADMINISTRATIVO', array[
      'dashboard.visualizar', 'entregas.visualizar', 'entregas.criar', 'entregas.editar', 'entregas.atribuir',
      'entregas.exportar', 'motoboys.visualizar', 'areas.visualizar', 'extras.visualizar', 'extras.criar',
      'financeiro.visualizar', 'pagamentos.visualizar', 'pagamentos.criar', 'fechamentos.visualizar',
      'mapa.visualizar', 'mapa.editar', 'fotos.visualizar', 'fotos.criar', 'conferencia.visualizar',
      'conferencia.criar', 'relatorios.visualizar', 'relatorios.exportar', 'alertas.visualizar']),
    ('MOTOBOY', array[
      'entregas.visualizar', 'entregas.confirmar', 'mapa.visualizar', 'fotos.criar', 'fotos.visualizar',
      'conferencia.criar', 'conferencia.visualizar', 'alertas.visualizar'])
  ) as r(role, keys)
  cross join lateral unnest(r.keys) as k(key)
  join public.permissions p on p.key = k.key
on conflict do nothing;

delete from public.role_permissions where role = 'MOTOBOY' and permission_key = 'entregas.criar';

drop trigger if exists protect_profile_role_changes on public.profiles;
drop trigger if exists set_notifications_company on public.notifications;

alter table public.delivery_areas drop constraint if exists delivery_areas_name_check;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_company on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists companies_member_select on public.companies;
drop policy if exists companies_select on public.companies;
drop policy if exists companies_update on public.companies;
drop policy if exists settings_member_select on public.company_settings;
drop policy if exists settings_admin_update on public.company_settings;
drop policy if exists company_settings_select on public.company_settings;
drop policy if exists company_settings_update on public.company_settings;
drop policy if exists areas_member_select on public.delivery_areas;
drop policy if exists areas_manager_write on public.delivery_areas;
drop policy if exists areas_select on public.delivery_areas;
drop policy if exists areas_insert on public.delivery_areas;
drop policy if exists areas_update on public.delivery_areas;
drop policy if exists neighborhoods_member_select on public.neighborhoods;
drop policy if exists neighborhoods_manager_write on public.neighborhoods;
drop policy if exists neighborhoods_select on public.neighborhoods;
drop policy if exists neighborhoods_insert on public.neighborhoods;
drop policy if exists neighborhoods_update on public.neighborhoods;
drop policy if exists neighborhoods_delete on public.neighborhoods;
drop policy if exists fee_history_member_select on public.delivery_fee_history;
drop policy if exists fee_history_select on public.delivery_fee_history;
drop policy if exists notification_select on public.notifications;
drop policy if exists notification_insert on public.notifications;
drop policy if exists notification_update on public.notifications;
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists role_permissions_admin on public.role_permissions;
drop policy if exists role_permissions_read on public.role_permissions;
drop policy if exists user_permissions_admin on public.user_permissions;
drop policy if exists user_permissions_admin_all on public.user_permissions;
drop policy if exists user_permissions_select on public.user_permissions;
drop policy if exists user_permissions_write on public.user_permissions;

create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy companies_select on public.companies for select to authenticated
  using (id = app.company_id());
create policy companies_update on public.companies for update to authenticated
  using (id = app.company_id() and app.has_perm('configuracoes.administrar'))
  with check (id = app.company_id());
create policy company_settings_select on public.company_settings for select to authenticated
  using (company_id = app.company_id());
create policy company_settings_update on public.company_settings for update to authenticated
  using (company_id = app.company_id() and app.has_perm('configuracoes.administrar'))
  with check (company_id = app.company_id());
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_company on public.profiles for select to authenticated
  using (company_id = app.company_id() and app.role() <> 'MOTOBOY');
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (company_id = app.company_id() and app.has_perm('usuarios.gerenciar'))
  with check (company_id = app.company_id());
create policy user_permissions_select on public.user_permissions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (app.has_perm('usuarios.visualizar')
        and exists (select 1 from public.profiles p where p.id = user_id and p.company_id = app.company_id()))
  );
create policy user_permissions_write on public.user_permissions for all to authenticated
  using (
    app.has_perm('usuarios.gerenciar') and user_id <> (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = user_id and p.company_id = app.company_id() and p.role <> 'ADMIN')
  )
  with check (
    app.has_perm('usuarios.gerenciar') and user_id <> (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = user_id and p.company_id = app.company_id() and p.role <> 'ADMIN')
  );
create policy areas_select on public.delivery_areas for select to authenticated
  using (company_id = app.company_id());
create policy areas_insert on public.delivery_areas for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('areas.editar'));
create policy areas_update on public.delivery_areas for update to authenticated
  using (company_id = app.company_id() and app.has_perm('areas.editar'))
  with check (company_id = app.company_id());
create policy neighborhoods_select on public.neighborhoods for select to authenticated
  using (company_id = app.company_id());
create policy neighborhoods_insert on public.neighborhoods for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('areas.editar'));
create policy neighborhoods_update on public.neighborhoods for update to authenticated
  using (company_id = app.company_id() and app.has_perm('areas.editar'))
  with check (company_id = app.company_id());
create policy neighborhoods_delete on public.neighborhoods for delete to authenticated
  using (company_id = app.company_id() and app.has_perm('areas.editar'));
create policy fee_history_select on public.delivery_fee_history for select to authenticated
  using (company_id = app.company_id() and app.has_perm('financeiro.visualizar'));
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

do $$
begin
  if to_regclass('public.manual_delivery_addresses') is not null then
    drop policy if exists manual_addresses_select on public.manual_delivery_addresses;
    create policy manual_addresses_select on public.manual_delivery_addresses for select to authenticated
      using (exists (select 1 from public.profiles p
                      where p.id = manual_delivery_addresses.motoboy_id and p.company_id = app.company_id()));
  end if;
end $$;

commit;

