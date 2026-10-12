-- OSSALA | 0004 - Pagamentos de repasse aos motoboys.
--
-- Um pagamento agrupa entregas concluídas de um motoboy. O valor é sempre
-- calculado pelo banco (soma do repasse líquido das entregas), nunca digitado.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  motoboy_id uuid not null references public.motoboys(id) on delete restrict,
  closing_period_id uuid,
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'pendente'
    check (status in ('pendente', 'em_conferencia', 'aprovado', 'pago', 'cancelado')),
  method text check (method is null or char_length(method) <= 40),
  reference text check (reference is null or char_length(reference) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  paid_at timestamptz,
  idempotency_key text not null,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  canceled_by uuid references public.profiles(id) on delete set null,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  constraint payments_paid_at check (status <> 'pago' or paid_at is not null),
  constraint payments_cancel_reason check (status <> 'cancelado' or char_length(coalesce(cancel_reason, '')) >= 3)
);
create index if not exists payments_company_status_idx on public.payments (company_id, status, created_at desc);
create index if not exists payments_company_motoboy_idx on public.payments (company_id, motoboy_id, created_at desc);
alter table public.payments enable row level security;

create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  amount numeric(12, 2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Uma entrega só pode estar em um pagamento ativo (evita pagamento em dobro).
create unique index if not exists payment_items_delivery_active on public.payment_items (delivery_id) where active;
create index if not exists payment_items_payment_idx on public.payment_items (payment_id);
alter table public.payment_items enable row level security;

create or replace trigger payments_touch before update on public.payments
  for each row execute function app.touch_updated_at();

-- Propaga a situação do pagamento para as entregas.
create or replace function app.sync_payment_to_deliveries(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.payments where id = p_payment;
  perform set_config('app.internal_write', 'on', true);
  if v_status = 'cancelado' then
    update public.payment_items set active = false where payment_id = p_payment and active;
    update public.deliveries d
       set payment_status = case when d.status = 'cancelada' then 'cancelado' else 'pendente' end
      from public.payment_items i
     where i.payment_id = p_payment and i.delivery_id = d.id
       and not exists (select 1 from public.payment_items j where j.delivery_id = d.id and j.active);
  else
    update public.deliveries d
       set payment_status = v_status
      from public.payment_items i
     where i.payment_id = p_payment and i.active and i.delivery_id = d.id
       and d.payment_status is distinct from v_status;
  end if;
  perform set_config('app.internal_write', 'off', true);
end;
$$;

-- Cria um pagamento para entregas concluídas de um motoboy.
create or replace function public.create_payment(
  p_motoboy_id uuid,
  p_delivery_ids uuid[],
  p_idempotency_key text,
  p_description text default null,
  p_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.company_id();
  v_existing public.payments;
  v_payment public.payments;
  v_count integer;
  v_valid integer;
  v_total numeric(12, 2);
begin
  if v_company is null or not app.has_perm('pagamentos.criar') then
    raise exception 'Sem permissão para gerar pagamentos.' using errcode = '42501';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Chave de idempotência obrigatória.' using errcode = '22023';
  end if;

  -- Requisição repetida (duplo clique / nova tentativa) devolve o mesmo pagamento.
  select * into v_existing from public.payments
   where company_id = v_company and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if not exists (select 1 from public.motoboys where id = p_motoboy_id and company_id = v_company) then
    raise exception 'Motoboy não encontrado.' using errcode = '23503';
  end if;

  v_count := coalesce(array_length(p_delivery_ids, 1), 0);
  if v_count = 0 then
    raise exception 'Selecione ao menos uma entrega.' using errcode = '22023';
  end if;

  -- Bloqueia as entregas para evitar corrida entre dois pagamentos simultâneos.
  perform 1 from public.deliveries where id = any(p_delivery_ids) for update;

  select count(*), coalesce(sum(f.repass_net), 0)
    into v_valid, v_total
    from public.delivery_financials f
   where f.id = any(p_delivery_ids)
     and f.company_id = v_company
     and f.motoboy_id = p_motoboy_id
     and f.status = 'entregue'
     and not exists (select 1 from public.payment_items i where i.delivery_id = f.id and i.active);

  if v_valid <> (select count(distinct x) from unnest(p_delivery_ids) x) then
    raise exception 'Há entregas inválidas na seleção (não concluídas, de outro motoboy ou já incluídas em outro pagamento).'
      using errcode = '23514';
  end if;

  insert into public.payments (company_id, motoboy_id, description, amount, method, reference, notes, idempotency_key, created_by)
  values (v_company, p_motoboy_id, nullif(trim(p_description), ''), v_total, nullif(trim(p_method), ''),
          nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), p_idempotency_key, (select auth.uid()))
  returning * into v_payment;

  insert into public.payment_items (company_id, payment_id, delivery_id, amount)
  select v_company, v_payment.id, f.id, f.repass_net
    from public.delivery_financials f
   where f.id = any(p_delivery_ids);

  perform app.sync_payment_to_deliveries(v_payment.id);
  return v_payment;
end;
$$;

-- Altera a situação de um pagamento validando transições e permissões.
create or replace function public.set_payment_status(
  p_payment_id uuid,
  p_status text,
  p_paid_at timestamptz default null,
  p_method text default null,
  p_reference text default null,
  p_reason text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.company_id();
  p public.payments;
  v_allowed text[];
  v_perm text;
begin
  select * into p from public.payments where id = p_payment_id and company_id = v_company for update;
  if not found then
    raise exception 'Pagamento não encontrado.' using errcode = '23503';
  end if;
  if p.status = p_status then
    return p; -- idempotente
  end if;

  v_allowed := case p.status
    when 'pendente' then array['em_conferencia', 'aprovado', 'cancelado']
    when 'em_conferencia' then array['pendente', 'aprovado', 'cancelado']
    when 'aprovado' then array['em_conferencia', 'pago', 'cancelado']
    when 'pago' then array['cancelado']
    else array[]::text[]
  end;
  if not p_status = any(v_allowed) then
    raise exception 'Transição inválida: % → %.', p.status, p_status using errcode = '23514';
  end if;

  v_perm := case p_status
    when 'aprovado' then 'pagamentos.aprovar'
    when 'pago' then 'pagamentos.confirmar'
    when 'cancelado' then 'pagamentos.excluir'
    else 'pagamentos.criar'
  end;
  if not app.has_perm(v_perm) then
    raise exception 'Sem permissão para esta operação.' using errcode = '42501';
  end if;
  if p.status = 'pago' and app.role() <> 'ADMIN' then
    raise exception 'Somente administradores podem estornar um pagamento já efetuado.' using errcode = '42501';
  end if;
  if p_status = 'cancelado' and char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;

  perform set_config('app.change_reason', coalesce(p_reason, ''), true);

  update public.payments
     set status = p_status,
         approved_by = case when p_status = 'aprovado' then (select auth.uid()) else approved_by end,
         approved_at = case when p_status = 'aprovado' then now() else approved_at end,
         paid_by = case when p_status = 'pago' then (select auth.uid()) else paid_by end,
         paid_at = case when p_status = 'pago' then coalesce(p_paid_at, now()) else paid_at end,
         method = coalesce(nullif(trim(p_method), ''), method),
         reference = coalesce(nullif(trim(p_reference), ''), reference),
         canceled_by = case when p_status = 'cancelado' then (select auth.uid()) else canceled_by end,
         canceled_at = case when p_status = 'cancelado' then now() else canceled_at end,
         cancel_reason = case when p_status = 'cancelado' then trim(p_reason) else cancel_reason end
   where id = p.id
   returning * into p;

  perform app.sync_payment_to_deliveries(p.id);
  return p;
end;
$$;

revoke execute on function public.create_payment(uuid, uuid[], text, text, text, text, text) from public, anon;
grant execute on function public.create_payment(uuid, uuid[], text, text, text, text, text) to authenticated;
revoke execute on function public.set_payment_status(uuid, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.set_payment_status(uuid, text, timestamptz, text, text, text) to authenticated;

create or replace trigger audit_payments after insert or update or delete on public.payments
  for each row execute function app.audit_row();
create or replace trigger audit_payment_items after insert or update or delete on public.payment_items
  for each row execute function app.audit_row();
