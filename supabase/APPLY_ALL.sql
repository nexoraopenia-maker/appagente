-- ============================================================
-- APPLY_ALL.sql — todas las migraciones en orden.
-- Pega TODO este archivo en Supabase → SQL Editor → Run.
-- Generado a partir de supabase/migrations/*.sql
-- ============================================================

-- ┌─────────────────────────────────────────
-- │ supabase/migrations/20260716000001_init_schema.sql
-- └─────────────────────────────────────────
-- ============================================================================
-- 20260716000001_init_schema.sql
-- Esquema base multi-tenant. Todas las tablas de negocio llevan organization_id.
-- RLS y políticas se definen en la migración 20260716000002_rls.sql.
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ── organizations: la cuenta del negocio ──
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now()
);

-- ── profiles: extiende auth.users, vincula al usuario con su organización ──
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);
create index profiles_organization_id_idx on public.profiles(organization_id);

-- ── whatsapp_configs: credenciales de Meta Cloud API por organización ──
-- Los tokens y el app_secret se guardan CIFRADOS (AES-256-GCM, ver lib/crypto.ts).
create table public.whatsapp_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  phone_number_id text not null,
  waba_id text not null,
  access_token_encrypted text not null,
  verify_token text not null,
  app_secret_encrypted text not null,
  updated_at timestamptz not null default now()
);
-- El webhook resuelve la organización a partir del phone_number_id entrante.
create unique index whatsapp_configs_phone_number_id_idx
  on public.whatsapp_configs(phone_number_id);

-- ── google_calendar_configs: tokens OAuth por organización ──
create table public.google_calendar_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  calendar_id text not null,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ── agent_configs: personalización del agente y datos del negocio ──
create table public.agent_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  system_prompt text not null,
  tone text not null default 'profesional y cálido',
  business_info jsonb not null default '{}'::jsonb,
  services jsonb not null default '[]'::jsonb,       -- [{name, duration_minutes, description}]
  business_hours jsonb not null default '{}'::jsonb, -- {mon:[{start,end}], ...}
  collect_new_patient boolean not null default true, -- si otro negocio no lo necesita, se apaga
  handoff_message text not null default 'Te paso con un humano en un momento.',
  updated_at timestamptz not null default now()
);

-- ── contacts: clientes que han escrito por WhatsApp ──
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wa_phone text not null,               -- E.164, ej. +5218112345678
  full_name text,
  is_new_patient boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, wa_phone)
);
create index contacts_organization_id_idx on public.contacts(organization_id);

-- ── conversations: un hilo por contacto ──
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  bot_active boolean not null default true, -- toggle handoff humano
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index conversations_org_last_message_idx
  on public.conversations(organization_id, last_message_at desc);
create unique index conversations_contact_idx on public.conversations(contact_id);

-- ── messages: cada mensaje entrante o saliente ──
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wa_message_id text,                   -- id de Meta, para idempotencia
  direction text not null check (direction in ('inbound','outbound')),
  sender text not null check (sender in ('contact','bot','human')),
  content text,
  raw jsonb,                            -- payload original de Meta
  created_at timestamptz not null default now(),
  unique (wa_message_id)
);
create index messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);

-- ── appointments: citas agendadas ──
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  service text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_event_id text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  is_new_patient boolean,
  full_name text not null,
  phone text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index appointments_org_starts_idx
  on public.appointments(organization_id, starts_at);
-- Idempotencia de book_appointment: un contacto no puede tener dos citas activas
-- en el mismo instante de inicio.
create unique index appointments_contact_slot_idx
  on public.appointments(contact_id, starts_at)
  where status = 'confirmed';

-- ── auth_org_id(): organización del usuario autenticado ──
-- SECURITY DEFINER para poder leer public.profiles sin recursión de políticas
-- (si consultara profiles bajo RLS, la política de profiles volvería a llamar
-- a esta función → recursión infinita). STABLE para que el planner la evalúe
-- una sola vez por query, no por fila.
-- Vive en public pero solo devuelve el organization_id del propio usuario del
-- JWT; no expone datos de otras organizaciones aunque sea callable por PUBLIC.
create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ┌─────────────────────────────────────────
-- │ supabase/migrations/20260716000002_rls.sql
-- └─────────────────────────────────────────
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

-- ┌─────────────────────────────────────────
-- │ supabase/migrations/20260716000003_onboarding.sql
-- └─────────────────────────────────────────
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

-- ┌─────────────────────────────────────────
-- │ supabase/migrations/20260716000004_realtime.sql
-- └─────────────────────────────────────────
-- ============================================================================
-- 20260716000004_realtime.sql
-- Habilita Supabase Realtime para la bandeja de conversaciones.
--
-- Realtime respeta RLS: cada cliente del dashboard solo recibe cambios de filas
-- que sus políticas le permiten ver (las de su organización).
-- ============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

