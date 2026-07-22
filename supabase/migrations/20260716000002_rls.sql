-- ============================================================================
-- 20260716000002_rls.sql
-- Row Level Security en todas las tablas. Cada organización solo ve sus datos.
--
-- Modelo de acceso:
--   * El dashboard usa el rol `authenticated`; RLS lo confina a su organización
--     vía public.auth_org_id().
--   * El webhook y los jobs de servidor usan la service_role key, que bypasea
--     RLS por completo; ahí el filtrado por organization_id es responsabilidad
--     del código (se resuelve desde phone_number_id).
--
-- Notas de seguridad (trampas específicas de Supabase que evitamos aquí):
--   * `(select auth_org_id())` en vez de `auth_org_id()` para que el planner la
--     evalúe una vez por query, no por fila.
--   * UPDATE lleva USING *y* WITH CHECK, si no un usuario podría reasignar la
--     fila a otra organización.
--   * `TO authenticated` + predicado de propiedad; nunca `TO authenticated` solo.
-- ============================================================================

alter table public.organizations          enable row level security;
alter table public.profiles                enable row level security;
alter table public.whatsapp_configs        enable row level security;
alter table public.google_calendar_configs enable row level security;
alter table public.agent_configs           enable row level security;
alter table public.contacts                enable row level security;
alter table public.conversations           enable row level security;
alter table public.messages                enable row level security;
alter table public.appointments            enable row level security;

-- ── organizations ──
-- El usuario ve y edita solo su propia organización.
create policy "org_select" on public.organizations
  for select to authenticated
  using ( id = (select public.auth_org_id()) );

create policy "org_update" on public.organizations
  for update to authenticated
  using ( id = (select public.auth_org_id()) )
  with check ( id = (select public.auth_org_id()) );

-- No hay policy de INSERT/DELETE para organizations: la creación de la
-- organización en el signup ocurre vía una función SECURITY DEFINER
-- (public.create_organization_for_user, migración 0003) que bypasea RLS de
-- forma controlada. Así evitamos que un usuario cree orgs arbitrarias por API.

-- ── profiles ──
-- El usuario ve los perfiles de su organización (para vistas de equipo) y edita
-- solo el suyo.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using ( organization_id = (select public.auth_org_id()) );

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ── Tablas 1:1 con la organización (configs) ──
-- Patrón idéntico: select/insert/update/delete acotados a la propia org.
-- Se genera con un bloque para no repetir 4 policies × 3 tablas a mano.
do $$
declare t text;
begin
  foreach t in array array['whatsapp_configs','google_calendar_configs','agent_configs']
  loop
    execute format($p$
      create policy "%1$s_select" on public.%1$s
        for select to authenticated
        using ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_insert" on public.%1$s
        for insert to authenticated
        with check ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_update" on public.%1$s
        for update to authenticated
        using ( organization_id = (select public.auth_org_id()) )
        with check ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_delete" on public.%1$s
        for delete to authenticated
        using ( organization_id = (select public.auth_org_id()) );
    $p$, t);
  end loop;
end $$;

-- ── Tablas de datos operativos (contacts, conversations, messages, appointments) ──
-- Mismo patrón. El webhook las escribe con service_role (bypass RLS); el
-- dashboard las lee/edita bajo estas policies.
do $$
declare t text;
begin
  foreach t in array array['contacts','conversations','messages','appointments']
  loop
    execute format($p$
      create policy "%1$s_select" on public.%1$s
        for select to authenticated
        using ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_insert" on public.%1$s
        for insert to authenticated
        with check ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_update" on public.%1$s
        for update to authenticated
        using ( organization_id = (select public.auth_org_id()) )
        with check ( organization_id = (select public.auth_org_id()) );
      create policy "%1$s_delete" on public.%1$s
        for delete to authenticated
        using ( organization_id = (select public.auth_org_id()) );
    $p$, t);
  end loop;
end $$;
