-- OSSALA | 0009 - Funções de negócio expostas à aplicação.

-- Motoboy (ou operação) altera o status da entrega: em andamento / entregue.
create or replace function public.set_my_delivery_status(p_delivery_id uuid, p_status text, p_note text default null)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
  v_is_owner boolean;
begin
  if p_status not in ('em_andamento', 'entregue') then
    raise exception 'Status inválido para esta operação.' using errcode = '22023';
  end if;

  select * into d from public.deliveries where id = p_delivery_id and company_id = app.company_id() for update;
  if not found then
    raise exception 'Entrega não encontrada.' using errcode = '23503';
  end if;

  v_is_owner := d.motoboy_id is not null and d.motoboy_id = app.motoboy_id();
  if not (v_is_owner and app.has_perm('entregas.confirmar'))
     and not (app.role() <> 'MOTOBOY' and app.has_perm('entregas.editar')) then
    raise exception 'Você não pode alterar esta entrega.' using errcode = '42501';
  end if;

  if d.status = p_status then
    return d; -- idempotente (duplo clique)
  end if;
  if d.status = 'cancelada' then
    raise exception 'Entrega cancelada.' using errcode = '23514';
  end if;
  if d.status = 'entregue' then
    raise exception 'Entrega já confirmada. Para corrigir, solicite a um gestor.' using errcode = '23514';
  end if;

  perform set_config('app.change_reason', coalesce(nullif(trim(p_note), ''), case when v_is_owner then 'Confirmado pelo motoboy' else '' end), true);
  update public.deliveries set status = p_status where id = d.id returning * into d;
  return d;
end;
$$;

-- Corrige uma confirmação de entrega (volta para pendente/em andamento).
create or replace function public.correct_delivery_confirmation(p_delivery_id uuid, p_status text, p_reason text)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
begin
  if not app.has_perm('entregas.corrigir_confirmacao') then
    raise exception 'Sem permissão para corrigir confirmações.' using errcode = '42501';
  end if;
  if p_status not in ('pendente', 'em_andamento') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 5 then
    raise exception 'Informe o motivo da correção.' using errcode = '22023';
  end if;
  select * into d from public.deliveries where id = p_delivery_id and company_id = app.company_id() for update;
  if not found then
    raise exception 'Entrega não encontrada.' using errcode = '23503';
  end if;
  if d.status <> 'entregue' then
    raise exception 'A entrega não está confirmada.' using errcode = '23514';
  end if;
  if d.payment_status in ('aprovado', 'pago') then
    raise exception 'O repasse desta entrega já foi aprovado ou pago.' using errcode = '23514';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  update public.deliveries set status = p_status where id = d.id returning * into d;
  return d;
end;
$$;

-- Possíveis duplicidades antes de cadastrar.
create or replace function public.find_delivery_duplicates(
  p_comanda text, p_date date, p_address text, p_number text default null, p_exclude uuid default null
)
returns table (id uuid, comanda_number text, delivery_date date, address text, address_number text, status text, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, d.comanda_number, d.delivery_date, d.address, d.address_number, d.status,
         case when lower(d.comanda_number) = lower(trim(p_comanda)) then 'mesma_comanda' else 'mesmo_endereco' end
    from public.deliveries d
   where d.company_id = app.company_id()
     and d.status <> 'cancelada'
     and (p_exclude is null or d.id <> p_exclude)
     and (
       (lower(d.comanda_number) = lower(trim(p_comanda)) and d.delivery_date between p_date - 1 and p_date + 1)
       or (d.delivery_date = p_date
           and app.normalize(d.address) = app.normalize(p_address)
           and coalesce(app.normalize(d.address_number), '') = coalesce(app.normalize(p_number), ''))
     )
   order by d.delivery_date desc
   limit 10
$$;

-- Indicadores do painel calculados no banco (respeitando RLS).
create or replace function public.dashboard_summary(
  p_from date,
  p_to date,
  p_motoboy uuid default null,
  p_area uuid default null,
  p_status text default null,
  p_payment_status text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select * from public.delivery_financials d
     where d.delivery_date between p_from and p_to
       and (p_motoboy is null or d.motoboy_id = p_motoboy)
       and (p_area is null or d.area_id = p_area)
       and (p_status is null or d.status = p_status)
       and (p_payment_status is null or d.payment_status = p_payment_status)
  ),
  valid as (select * from f where status <> 'cancelada')
  select jsonb_build_object(
    'total', (select count(*) from f),
    'comandas', (select count(distinct lower(comanda_number)) from f),
    'pendentes', (select count(*) from f where status = 'pendente'),
    'em_andamento', (select count(*) from f where status = 'em_andamento'),
    'concluidas', (select count(*) from f where status = 'entregue'),
    'canceladas', (select count(*) from f where status = 'cancelada'),
    'divergencias', (select count(*) from valid where has_divergence),
    'conferencias_aguardando', (select count(*) from valid where conference_status = 'aguardando'),
    'extras_qtd', (
      select count(*) from public.delivery_extras e
       where e.canceled_at is null and e.delivery_id in (select id from valid)),
    'charge_total', (select coalesce(sum(charge_total), 0) from valid),
    'repass_total', (select coalesce(sum(repass_net), 0) from valid where status = 'entregue'),
    'pagamentos_pendentes_valor', (
      select coalesce(sum(repass_net), 0) from valid where status = 'entregue' and payment_status <> 'pago'),
    'pagamentos_pendentes_qtd', (
      select count(*) from valid where status = 'entregue' and payment_status <> 'pago'),
    'por_motoboy', (
      select coalesce(jsonb_agg(x order by x ->> 'nome'), '[]'::jsonb) from (
        select jsonb_build_object('motoboy_id', motoboy_id, 'nome', coalesce(motoboy_name, 'Sem motoboy'),
                                  'total', count(*), 'concluidas', count(*) filter (where status = 'entregue'),
                                  'repasse', coalesce(sum(repass_net) filter (where status = 'entregue'), 0)) as x
          from valid group by motoboy_id, motoboy_name) s),
    'por_area', (
      select coalesce(jsonb_agg(x order by x ->> 'nome'), '[]'::jsonb) from (
        select jsonb_build_object('area_id', area_id, 'nome', coalesce(area_name, 'Sem área'),
                                  'cor', area_color, 'total', count(*),
                                  'cobrado', coalesce(sum(charge_total), 0)) as x
          from valid group by area_id, area_name, area_color) s)
  )
$$;

-- Alertas operacionais calculados (não são notificações persistidas).
create or replace function public.operational_alerts(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from public.app_settings where company_id = app.company_id()),
       c as (select timezone from public.companies where id = app.company_id())
  select coalesce(jsonb_agg(a), '[]'::jsonb) from (
    select jsonb_build_object('type', 'entrega_atrasada', 'severity', 'warning',
             'message', format('%s entrega(s) pendente(s) há mais de %s min', count(*), max(s.pending_alert_minutes)),
             'link', '/app/entregas?status=pendente') as a
      from public.deliveries d, s, c
     where d.delivery_date = p_date and d.status = 'pendente'
       and ((d.delivery_date + d.delivery_time) at time zone c.timezone) < now() - make_interval(mins => s.pending_alert_minutes)
    having count(*) > 0
    union all
    select jsonb_build_object('type', 'sem_motoboy', 'severity', 'warning',
             'message', format('%s entrega(s) sem motoboy atribuído', count(*)),
             'link', '/app/entregas?sem_motoboy=1')
      from public.deliveries d
     where d.delivery_date = p_date and d.status in ('pendente', 'em_andamento') and d.motoboy_id is null
    having count(*) > 0
    union all
    select jsonb_build_object('type', 'sem_area', 'severity', 'info',
             'message', format('%s entrega(s) sem área definida', count(*)),
             'link', '/app/entregas?sem_area=1')
      from public.deliveries d
     where d.delivery_date = p_date and d.status <> 'cancelada' and d.area_id is null
    having count(*) > 0
    union all
    select jsonb_build_object('type', 'divergencia', 'severity', 'danger',
             'message', format('%s entrega(s) com divergência', count(*)),
             'link', '/app/entregas?divergencia=1')
      from public.deliveries d
     where d.delivery_date = p_date and d.status <> 'cancelada' and d.has_divergence
    having count(*) > 0
    union all
    select jsonb_build_object('type', 'area_sem_valor', 'severity', 'danger',
             'message', format('%s área(s) ativa(s) sem valores de cobrança/repasse configurados', count(*)),
             'link', '/app/areas')
      from public.delivery_areas a
     where a.company_id = app.company_id() and a.active and (a.charge_amount = 0 or a.repass_amount = 0)
    having count(*) > 0
    union all
    select jsonb_build_object('type', 'loja_sem_posicao', 'severity', 'info',
             'message', 'Posição da loja não configurada no mapa', 'link', '/app/configuracoes')
      from s where s.store_lat is null
  ) q
$$;

revoke execute on function public.set_my_delivery_status(uuid, text, text) from public, anon;
revoke execute on function public.correct_delivery_confirmation(uuid, text, text) from public, anon;
revoke execute on function public.find_delivery_duplicates(text, date, text, text, uuid) from public, anon;
revoke execute on function public.dashboard_summary(date, date, uuid, uuid, text, text) from public, anon;
revoke execute on function public.operational_alerts(date) from public, anon;
grant execute on function public.set_my_delivery_status(uuid, text, text) to authenticated;
grant execute on function public.correct_delivery_confirmation(uuid, text, text) to authenticated;
grant execute on function public.find_delivery_duplicates(text, date, text, text, uuid) to authenticated;
grant execute on function public.dashboard_summary(date, date, uuid, uuid, text, text) to authenticated;
grant execute on function public.operational_alerts(date) to authenticated;

-- Funções internas não devem ser chamadas diretamente pela API.
revoke execute on all functions in schema app from public, anon;
grant execute on function app.normalize(text) to authenticated, service_role;
grant execute on function app.company_id() to authenticated, service_role;
grant execute on function app.role() to authenticated, service_role;
grant execute on function app.has_perm(text) to authenticated, service_role;
grant execute on function app.motoboy_id() to authenticated, service_role;
grant execute on function app.effective_permissions(uuid) to service_role;
