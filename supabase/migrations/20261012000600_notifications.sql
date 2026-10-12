-- OSSALA | 0006 - Central de notificações gerada por eventos reais.

alter table public.notifications add column if not exists category text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists entity_type text;
alter table public.notifications add column if not exists entity_id uuid;
alter table public.notifications add column if not exists dedupe_key text;

update public.notifications set category = coalesce(category, type, 'geral') where category is null;

create unique index if not exists notifications_dedupe_idx
  on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read_at, created_at desc);

-- O gatilho legado set_notifications_company é removido na migration 0850.
create or replace function app.notifications_fill_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is null then
    select company_id into new.company_id from public.profiles where id = new.recipient_id;
  end if;
  new.category := coalesce(new.category, new.type);
  return new;
end;
$$;

create or replace trigger notifications_fill_company before insert on public.notifications
  for each row execute function app.notifications_fill_company();

-- Usuário só pode marcar como lida; o conteúdo é imutável.
create or replace function app.notifications_protect()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_read timestamptz := new.read_at;
begin
  if (select auth.uid()) is not null then
    new := old;
    new.read_at := v_read;
  end if;
  return new;
end;
$$;

create or replace trigger notifications_protect before update on public.notifications
  for each row execute function app.notifications_protect();

-- Envia uma notificação a todos os usuários ativos da empresa com a permissão.
create or replace function app.notify_permission(
  p_company uuid,
  p_permission text,
  p_category text,
  p_title text,
  p_message text,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dedupe text default null,
  p_exclude uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notifications (company_id, recipient_id, sender_id, type, category, title, message, link,
                                    entity_type, entity_id, dedupe_key)
  select p_company, p.id, (select auth.uid()), p_category, p_category, p_title, p_message, p_link,
         p_entity_type, p_entity_id, p_dedupe
    from public.profiles p
   where p.company_id = p_company
     and p.ativo
     and p.id is distinct from p_exclude
     and p_permission = any(app.effective_permissions(p.id))
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app.notify_user(
  p_company uuid,
  p_user uuid,
  p_category text,
  p_title text,
  p_message text,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dedupe text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (company_id, recipient_id, sender_id, type, category, title, message, link,
                                    entity_type, entity_id, dedupe_key)
  select p_company, p_user, (select auth.uid()), p_category, p_category, p_title, p_message, p_link,
         p_entity_type, p_entity_id, p_dedupe
   where p_user is not null
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
$$;

-- Eventos de entregas: atribuição ao motoboy.
create or replace function app.notify_delivery_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if new.motoboy_id is not null and new.status in ('pendente', 'em_andamento')
     and (tg_op = 'INSERT' or new.motoboy_id is distinct from old.motoboy_id) then
    select profile_id into v_profile from public.motoboys where id = new.motoboy_id;
    perform app.notify_user(
      new.company_id, v_profile, 'entrega',
      'Nova entrega atribuída',
      format('Comanda %s — %s%s', new.comanda_number, new.address,
             coalesce(', ' || new.address_number, '')),
      '/app/minhas-entregas', 'delivery', new.id,
      format('delivery-assigned:%s:%s', new.id, new.motoboy_id)
    );
  end if;
  return null;
end;
$$;

create or replace trigger deliveries_notify after insert or update of motoboy_id on public.deliveries
  for each row execute function app.notify_delivery_events();

-- Eventos de conferência.
create or replace function app.notify_conference_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comanda text;
begin
  select comanda_number into v_comanda from public.deliveries where id = new.delivery_id;
  if new.status = 'aguardando_revisao' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.divergence_count > 0 then
      perform app.notify_permission(
        new.company_id, 'conferencia.aprovar', 'divergencia',
        'Divergência na conferência',
        format('%s campo(s) divergente(s) na comanda %s.', new.divergence_count, coalesce(v_comanda, 'não localizada')),
        '/app/conferencia?id=' || new.id, 'conference', new.id, 'conference-divergence:' || new.id
      );
    else
      perform app.notify_permission(
        new.company_id, 'conferencia.aprovar', 'conferencia',
        'Conferência aguardando aprovação',
        format('Comanda %s pronta para revisão.', coalesce(v_comanda, 'não localizada')),
        '/app/conferencia?id=' || new.id, 'conference', new.id, 'conference-review:' || new.id
      );
    end if;
  elsif new.status = 'falha_ocr' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform app.notify_permission(
      new.company_id, 'conferencia.aprovar', 'falha_ocr',
      'Falha no OCR',
      coalesce(new.error_message, 'Não foi possível ler a imagem enviada.'),
      '/app/conferencia?id=' || new.id, 'conference', new.id, 'conference-ocr-fail:' || new.id
    );
  elsif new.status = 'nova_foto_solicitada' and tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform app.notify_user(
      new.company_id, new.created_by, 'conferencia',
      'Nova foto solicitada',
      format('Envie uma nova foto da comanda %s.', coalesce(v_comanda, '')),
      '/app/fotos', 'conference', new.id, 'conference-new-photo:' || new.id
    );
  end if;
  return null;
end;
$$;

create or replace trigger delivery_conferences_notify after insert or update of status on public.delivery_conferences
  for each row execute function app.notify_conference_events();

-- Eventos de pagamento.
create or replace function app.notify_payment_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select name into v_name from public.motoboys where id = new.motoboy_id;
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    if new.status in ('pendente', 'em_conferencia') then
      perform app.notify_permission(
        new.company_id, 'pagamentos.aprovar', 'pagamento',
        'Pagamento pendente de aprovação',
        format('%s — R$ %s', v_name, to_char(new.amount, 'FM999G999G990D00')),
        '/app/pagamentos?id=' || new.id, 'payment', new.id, format('payment-%s:%s', new.status, new.id),
        (select auth.uid())
      );
    elsif new.status = 'aprovado' then
      perform app.notify_permission(
        new.company_id, 'pagamentos.confirmar', 'pagamento',
        'Pagamento aprovado aguardando quitação',
        format('%s — R$ %s', v_name, to_char(new.amount, 'FM999G999G990D00')),
        '/app/pagamentos?id=' || new.id, 'payment', new.id, 'payment-approved:' || new.id,
        (select auth.uid())
      );
    end if;
  end if;
  return null;
end;
$$;

create or replace trigger payments_notify after insert or update of status on public.payments
  for each row execute function app.notify_payment_events();

-- Registro de eventos reportados pela aplicação (erro ao salvar, falha de OCR,
-- operação não autorizada). Apenas categorias conhecidas são aceitas.
create or replace function public.report_app_event(
  p_category text,
  p_title text,
  p_message text,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.company_id();
  v_user uuid := (select auth.uid());
  v_permission text;
begin
  if v_company is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_category not in ('erro_salvar', 'falha_ocr', 'nao_autorizado', 'rede') then
    raise exception 'Categoria inválida.' using errcode = '22023';
  end if;

  v_permission := case p_category when 'falha_ocr' then 'conferencia.aprovar' else 'usuarios.gerenciar' end;

  perform app.notify_user(v_company, v_user, p_category, left(p_title, 120), left(p_message, 500), p_link,
                          null, null, format('%s:%s:%s', p_category, v_user, md5(p_message || date_trunc('minute', now())::text)));
  if p_category in ('nao_autorizado', 'falha_ocr') then
    perform app.notify_permission(v_company, v_permission, p_category, left(p_title, 120),
      left(format('%s (usuário: %s)', p_message, (select nome from public.profiles where id = v_user)), 500),
      p_link, null, null, format('%s:%s:%s', p_category, v_user, md5(p_message || date_trunc('minute', now())::text)), v_user);
  end if;
  perform app.audit_event('evento_' || p_category, 'app', null, jsonb_build_object('title', p_title, 'message', p_message, 'link', p_link));
end;
$$;
revoke execute on function public.report_app_event(text, text, text, text) from public, anon;
grant execute on function public.report_app_event(text, text, text, text) to authenticated;

-- Marca notificações como lidas (todas ou uma lista).
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = (select auth.uid())
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Alerta periódico de entregas pendentes há muito tempo (executado pelo pg_cron).
create or replace function app.scan_pending_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select d.id, d.company_id, d.comanda_number, d.address, s.pending_alert_minutes
      from public.deliveries d
      join public.app_settings s on s.company_id = d.company_id
      join public.companies c on c.id = d.company_id
     where d.status = 'pendente'
       and ((d.delivery_date + d.delivery_time) at time zone c.timezone)
           < now() - make_interval(mins => s.pending_alert_minutes)
       and d.delivery_date >= current_date - 2
  loop
    v_total := v_total + app.notify_permission(
      r.company_id, 'entregas.editar', 'entrega_pendente',
      'Entrega pendente',
      format('Comanda %s (%s) está pendente há mais de %s minutos.', r.comanda_number, r.address, r.pending_alert_minutes),
      '/app/entregas?id=' || r.id, 'delivery', r.id, 'delivery-pending:' || r.id
    );
  end loop;
  return v_total;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'ossala-pending-deliveries') then
      perform cron.unschedule('ossala-pending-deliveries');
    end if;
    perform cron.schedule('ossala-pending-deliveries', '*/10 * * * *', 'select app.scan_pending_deliveries()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;

alter table public.notifications replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.deliveries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.delivery_conferences;
  exception when duplicate_object then null;
  end;
end $$;
