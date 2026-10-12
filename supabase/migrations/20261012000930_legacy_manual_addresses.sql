-- OSSALA | 0930 - Isolamento por empresa na tabela legada manual_delivery_addresses.
--
-- * Leitura: a versão da 0850 aplicada em produção resolvia "motoboy_id", dentro
--   do EXISTS, como a coluna profiles.motoboy_id, e ninguém via os registros.
--   A 0850 já foi corrigida; esta migration corrige bancos que receberam a versão antiga.
-- * Alteração (versão anterior): liberava qualquer admin/gestor, de qualquer
--   empresa. Passa a exigir a mesma empresa e mapa.editar (ou ser o próprio motoboy).
--
-- Usa ALTER POLICY: nenhuma política é removida.

do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'manual_delivery_addresses'
                and policyname = 'manual_addresses_select') then
    alter policy manual_addresses_select on public.manual_delivery_addresses
      using (exists (select 1 from public.profiles p
                      where p.id = manual_delivery_addresses.motoboy_id and p.company_id = app.company_id()));
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'manual_delivery_addresses'
                and policyname = 'manual_addresses_update') then
    alter policy manual_addresses_update on public.manual_delivery_addresses
      using (
        exists (select 1 from public.profiles p
                 where p.id = manual_delivery_addresses.motoboy_id and p.company_id = app.company_id())
        and (manual_delivery_addresses.motoboy_id = (select auth.uid()) or app.has_perm('mapa.editar'))
      )
      with check (
        exists (select 1 from public.profiles p
                 where p.id = manual_delivery_addresses.motoboy_id and p.company_id = app.company_id())
        and (manual_delivery_addresses.motoboy_id = (select auth.uid()) or app.has_perm('mapa.editar'))
      );
  end if;
end $$;
