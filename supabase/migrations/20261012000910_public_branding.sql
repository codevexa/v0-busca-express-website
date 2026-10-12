-- OSSALA | 0910 - Identidade visual pública para a tela de login.
-- Expõe apenas nome de exibição, cores e caminho do logotipo (dados não sensíveis).

create or replace function public.login_branding(p_slug text default 'empresa-principal')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(s.display_name, c.name),
    'logo_path', s.logo_path,
    'brand_primary', s.brand_primary,
    'brand_secondary', s.brand_secondary
  )
  from public.companies c
  left join public.company_settings s on s.company_id = c.id
  where c.slug = p_slug and c.status in ('active', 'trial')
$$;

revoke execute on function public.login_branding(text) from public;
grant execute on function public.login_branding(text) to anon, authenticated;
