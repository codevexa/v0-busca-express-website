-- OSSALA | 0850 - Substituição das regras da versão anterior.
--
-- Esta é a ÚNICA migration com comandos destrutivos (DROP/DELETE). Ela não
-- apaga dados operacionais: remove políticas RLS, gatilhos e restrições da
-- versão anterior que conflitam com o novo modelo de segurança e as substitui.
--
--  * As políticas antigas de profiles/companies/áreas/notificações usavam
--    funções globais (is_staff/is_admin) que não isolam empresas.
--  * role_permissions/user_permissions passam a referenciar public.permissions.
--  * A permissão "entregas.criar" deixa de ser padrão do papel MOTOBOY.
--  * A restrição que limitava áreas a 4 nomes fixos é removida.

-- 1. Catálogo único de permissões -------------------------------------------
alter table public.role_permissions drop constraint if exists role_permissions_permission_key_fkey;
alter table public.user_permissions drop constraint if exists user_permissions_permission_key_fkey;

alter table public.role_permissions
  add constraint role_permissions_permission_key_fkey
  foreign key (permission_key) references public.permissions(key) on delete cascade;
alter table public.user_permissions
  add constraint user_permissions_permission_key_fkey
  foreign key (permission_key) references public.permissions(key) on delete cascade;

-- Permissões padrão de cada papel (ADMIN sempre tem acesso total).
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

-- Na versão anterior o MOTOBOY podia cadastrar entregas; no novo modelo isso é
-- função da operação. A permissão pode ser concedida individualmente se necessário.
delete from public.role_permissions where role = 'MOTOBOY' and permission_key = 'entregas.criar';

-- 2. Gatilhos legados substituídos -------------------------------------------
-- protect_profile_role_changes -> app.protect_profile_fields (0002)
drop trigger if exists protect_profile_role_changes on public.profiles;
-- set_notifications_company exigia sessão e sobrescrevia company_id -> app.notifications_fill_company (0006)
drop trigger if exists set_notifications_company on public.notifications;

-- 3. Áreas adicionais -----------------------------------------------------------
alter table public.delivery_areas drop constraint if exists delivery_areas_name_check;

-- 4. Políticas RLS das tabelas reaproveitadas ---------------------------------
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

-- ---------------------------------------------------------------------------
-- Correção de vazamento entre empresas em tabela legada
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.manual_delivery_addresses') is not null then
    drop policy if exists manual_addresses_select on public.manual_delivery_addresses;
    create policy manual_addresses_select on public.manual_delivery_addresses for select to authenticated
      using (exists (select 1 from public.profiles p where p.id = motoboy_id and p.company_id = app.company_id()));
  end if;
end $$;
