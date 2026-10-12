-- OSSALA | 0920 - Endurecimento de permissões de execução.
--
-- resolve_login_email passa a ser chamada somente pelo servidor (service_role),
-- evitando que qualquer pessoa descubra o e-mail associado a uma matrícula.
-- Funções legadas de gatilho/RLS não precisam ser executáveis por anônimos.

revoke execute on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

do $$
begin
  if to_regprocedure('public.prevent_self_role_change()') is not null then
    revoke execute on function public.prevent_self_role_change() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.set_operational_company_id()') is not null then
    revoke execute on function public.set_operational_company_id() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.user_is_company_member(uuid)') is not null then
    revoke execute on function public.user_is_company_member(uuid) from public, anon;
  end if;
end $$;
