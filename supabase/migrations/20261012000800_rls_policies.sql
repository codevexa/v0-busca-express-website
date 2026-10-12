-- OSSALA | 0008 - Políticas de Row Level Security.
--
-- Regra geral: todo registro privado pertence a uma empresa (company_id) e só é
-- visível para usuários ativos dessa empresa com a permissão correspondente.
-- As funções app.company_id(), app.has_perm() e app.motoboy_id() são
-- SECURITY DEFINER e leem o perfil do usuário autenticado.

-- ---------------------------------------------------------------------------
-- Catálogos globais (somente leitura)
-- ---------------------------------------------------------------------------
create policy roles_read on public.roles for select to authenticated using (true);
alter table public.roles enable row level security;

create policy permissions_read on public.permissions for select to authenticated using (true);
alter table public.permissions enable row level security;

-- ---------------------------------------------------------------------------
-- Empresa e configurações
-- ---------------------------------------------------------------------------

create policy app_settings_select on public.app_settings for select to authenticated
  using (company_id = app.company_id());
create policy app_settings_update on public.app_settings for update to authenticated
  using (company_id = app.company_id() and app.has_perm('configuracoes.administrar'))
  with check (company_id = app.company_id());

create policy company_role_overrides_select on public.company_role_overrides for select to authenticated
  using (company_id = app.company_id() and app.has_perm('usuarios.visualizar'));
create policy company_role_overrides_write on public.company_role_overrides for all to authenticated
  using (company_id = app.company_id() and app.has_perm('usuarios.gerenciar') and role <> 'ADMIN')
  with check (company_id = app.company_id() and app.has_perm('usuarios.gerenciar') and role <> 'ADMIN');

-- ---------------------------------------------------------------------------
-- Usuários
-- ---------------------------------------------------------------------------
-- Inserção e exclusão de perfis são feitas somente pelo servidor (service_role),
-- junto com a criação da conta no Supabase Auth.

-- ---------------------------------------------------------------------------
-- Motoboys
-- ---------------------------------------------------------------------------
create policy motoboys_select on public.motoboys for select to authenticated
  using (
    company_id = app.company_id()
    and (app.role() <> 'MOTOBOY' or profile_id = (select auth.uid()))
  );
create policy motoboys_insert on public.motoboys for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('motoboys.criar'));
create policy motoboys_update on public.motoboys for update to authenticated
  using (company_id = app.company_id() and app.has_perm('motoboys.editar'))
  with check (company_id = app.company_id());

-- ---------------------------------------------------------------------------
-- Áreas, bairros e regras
-- ---------------------------------------------------------------------------

create policy extra_rules_select on public.extra_rules for select to authenticated
  using (company_id = app.company_id() and app.role() <> 'MOTOBOY');
create policy extra_rules_insert on public.extra_rules for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('areas.editar'));
create policy extra_rules_update on public.extra_rules for update to authenticated
  using (company_id = app.company_id() and app.has_perm('areas.editar'))
  with check (company_id = app.company_id());

-- ---------------------------------------------------------------------------
-- Entregas
-- ---------------------------------------------------------------------------
create policy deliveries_select on public.deliveries for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and app.has_perm('entregas.visualizar'))
      or (motoboy_id is not null and motoboy_id = app.motoboy_id())
    )
  );
create policy deliveries_insert on public.deliveries for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('entregas.criar'));
-- Motoboys alteram status apenas pela função set_my_delivery_status().
create policy deliveries_update on public.deliveries for update to authenticated
  using (company_id = app.company_id() and app.role() <> 'MOTOBOY' and app.has_perm('entregas.editar'))
  with check (company_id = app.company_id());

create policy delivery_extras_select on public.delivery_extras for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and (app.has_perm('extras.visualizar') or app.has_perm('financeiro.visualizar')))
      or exists (select 1 from public.deliveries d where d.id = delivery_id and d.motoboy_id = app.motoboy_id())
    )
  );
create policy delivery_extras_insert on public.delivery_extras for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('extras.criar'));
create policy delivery_extras_update on public.delivery_extras for update to authenticated
  using (company_id = app.company_id() and app.has_perm('extras.editar'))
  with check (company_id = app.company_id());

create policy delivery_status_history_select on public.delivery_status_history for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and app.has_perm('entregas.visualizar'))
      or exists (select 1 from public.deliveries d where d.id = delivery_id and d.motoboy_id = app.motoboy_id())
    )
  );

create policy manual_addresses_select on public.manual_addresses for select to authenticated
  using (company_id = app.company_id() and app.has_perm('mapa.visualizar') and app.role() <> 'MOTOBOY');
create policy manual_addresses_insert on public.manual_addresses for insert to authenticated
  with check (company_id = app.company_id() and app.has_perm('mapa.editar'));
create policy manual_addresses_update on public.manual_addresses for update to authenticated
  using (company_id = app.company_id() and app.has_perm('mapa.editar'))
  with check (company_id = app.company_id());
create policy manual_addresses_delete on public.manual_addresses for delete to authenticated
  using (company_id = app.company_id() and app.has_perm('mapa.editar'));

-- ---------------------------------------------------------------------------
-- Financeiro (escrita somente via funções create_payment/set_payment_status)
-- ---------------------------------------------------------------------------
create policy payments_select on public.payments for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and (app.has_perm('pagamentos.visualizar') or app.has_perm('financeiro.visualizar')))
      or motoboy_id = app.motoboy_id()
    )
  );
create policy payment_items_select on public.payment_items for select to authenticated
  using (
    company_id = app.company_id()
    and exists (select 1 from public.payments p where p.id = payment_id)
  );


-- ---------------------------------------------------------------------------
-- Fotos e conferências
-- ---------------------------------------------------------------------------
create policy delivery_photos_select on public.delivery_photos for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and app.has_perm('fotos.visualizar'))
      or uploaded_by = (select auth.uid())
    )
  );
create policy delivery_photos_insert on public.delivery_photos for insert to authenticated
  with check (company_id = app.company_id() and uploaded_by = (select auth.uid()) and app.has_perm('fotos.criar'));
create policy delivery_photos_update on public.delivery_photos for update to authenticated
  using (company_id = app.company_id() and (uploaded_by = (select auth.uid()) or app.has_perm('conferencia.aprovar')))
  with check (company_id = app.company_id());

create policy delivery_conferences_select on public.delivery_conferences for select to authenticated
  using (
    company_id = app.company_id()
    and (
      (app.role() <> 'MOTOBOY' and app.has_perm('conferencia.visualizar'))
      or created_by = (select auth.uid())
    )
  );
create policy delivery_conferences_insert on public.delivery_conferences for insert to authenticated
  with check (company_id = app.company_id() and created_by = (select auth.uid()) and app.has_perm('conferencia.criar'));
create policy delivery_conferences_update on public.delivery_conferences for update to authenticated
  using (company_id = app.company_id() and (created_by = (select auth.uid()) or app.has_perm('conferencia.aprovar')))
  with check (company_id = app.company_id());

-- ---------------------------------------------------------------------------
-- Notificações e auditoria
-- ---------------------------------------------------------------------------

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (company_id = app.company_id() and app.has_perm('auditoria.visualizar'));

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
create policy delivery_photos_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'delivery-photos'
    and (storage.foldername(name))[1] = app.company_id()::text
    and app.has_perm('fotos.criar')
  );
create policy delivery_photos_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-photos'
    and (storage.foldername(name))[1] = app.company_id()::text
    and (
      (app.role() <> 'MOTOBOY' and app.has_perm('fotos.visualizar'))
      or owner_id = (select auth.uid())::text
    )
  );

create policy branding_storage_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = app.company_id()::text
    and app.has_perm('configuracoes.administrar')
  );
create policy branding_storage_update on storage.objects for update to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = app.company_id()::text
    and app.has_perm('configuracoes.administrar')
  );
create policy branding_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = app.company_id()::text
    and app.has_perm('configuracoes.administrar')
  );

-- ---------------------------------------------------------------------------
-- Privilégios de tabela (RLS continua obrigatória)
-- ---------------------------------------------------------------------------
revoke all on public.audit_logs from anon;
revoke all on public.payments, public.payment_items from anon;
revoke insert, update, delete on public.payments, public.payment_items from authenticated;
revoke insert, update, delete on public.audit_logs, public.delivery_status_history, public.delivery_fee_history from authenticated;
revoke all on public.deliveries, public.delivery_extras, public.motoboys, public.delivery_photos,
             public.delivery_conferences, public.app_settings, public.manual_addresses, public.extra_rules from anon;
grant select on public.delivery_financials to authenticated;
revoke all on public.delivery_financials from anon;
