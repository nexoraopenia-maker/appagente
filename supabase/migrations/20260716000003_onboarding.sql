-- ============================================================================
-- 20260716000003_onboarding.sql
-- Onboarding atómico: crea organización + profile + agent_config en una sola
-- transacción. Invocada por la Server Action de signup vía RPC.
--
-- SECURITY DEFINER porque necesita insertar en organizations (que no tiene
-- policy de INSERT para authenticated). Es segura porque:
--   * Siempre usa auth.uid() del JWT como id del profile — un usuario no puede
--     crear un profile para otro.
--   * Es no-op si el usuario ya tiene profile (evita duplicar orgs).
--   * search_path fijado para prevenir secuestro de resolución de nombres.
-- ============================================================================

create or replace function public.create_organization_for_user(
  org_name text,
  org_slug text,
  full_name text default null,
  org_timezone text default 'America/Mexico_City'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_org_id uuid;
  default_prompt text;
begin
  if uid is null then
    raise exception 'no authenticated user';
  end if;

  -- Si ya tiene organización, devolverla (idempotente).
  select organization_id into new_org_id from public.profiles where id = uid;
  if new_org_id is not null then
    return new_org_id;
  end if;

  insert into public.organizations (name, slug, timezone)
  values (org_name, org_slug, org_timezone)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, new_org_id, full_name, 'owner');

  -- Prompt por defecto orientado a clínica dental; el dueño lo edita en /personalizacion.
  default_prompt :=
    'Eres el asistente de atención al cliente de una clínica dental por WhatsApp. ' ||
    'Tu trabajo es responder dudas y agendar citas. Sé breve y claro: es un chat, ' ||
    'no un correo. Pregunta el motivo de la consulta, ofrece los servicios ' ||
    'disponibles y, cuando el cliente quiera una cita, sugiere 3 horarios libres ' ||
    'de la próxima semana y recoge los datos necesarios antes de confirmar. ' ||
    'Si no entiendes algo o el cliente pide hablar con una persona, deriva a un humano.';

  insert into public.agent_configs (organization_id, system_prompt, services, business_hours, business_info)
  values (
    new_org_id,
    default_prompt,
    '[
      {"name":"limpieza","duration_minutes":30,"description":"Limpieza dental de rutina"},
      {"name":"empaste","duration_minutes":45,"description":"Empaste de caries"},
      {"name":"blanqueamiento","duration_minutes":60,"description":"Blanqueamiento dental"}
    ]'::jsonb,
    '{
      "mon":[{"start":"09:00","end":"18:00"}],
      "tue":[{"start":"09:00","end":"18:00"}],
      "wed":[{"start":"09:00","end":"18:00"}],
      "thu":[{"start":"09:00","end":"18:00"}],
      "fri":[{"start":"09:00","end":"18:00"}],
      "sat":[{"start":"09:00","end":"13:00"}],
      "sun":[]
    }'::jsonb,
    '{"address":"","phone":"","faq":"","cancellation_policy":""}'::jsonb
  );

  return new_org_id;
end;
$$;

-- Revocar el EXECUTE que Postgres concede a PUBLIC por defecto y concederlo
-- solo a usuarios autenticados.
revoke execute on function public.create_organization_for_user(text, text, text, text) from public;
grant execute on function public.create_organization_for_user(text, text, text, text) to authenticated;
