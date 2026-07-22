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
