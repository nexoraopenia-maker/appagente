-- ============================================================================
-- seed.sql — datos mínimos para desarrollo local (`supabase db reset`).
--
-- Crea DOS organizaciones para poder probar el aislamiento multi-tenant.
-- No crea auth.users ni profiles: esos salen del signup real. Para vincular tu
-- usuario a una de estas orgs en local, tras registrarte ejecuta:
--   update public.profiles set organization_id =
--     (select id from public.organizations where slug = 'clinica-demo')
--   where id = auth.uid();
-- ============================================================================

insert into public.organizations (id, name, slug, timezone) values
  ('00000000-0000-0000-0000-000000000001', 'Clínica Dental Demo', 'clinica-demo', 'America/Mexico_City'),
  ('00000000-0000-0000-0000-000000000002', 'Barbería Demo',       'barberia-demo', 'America/Mexico_City')
on conflict (id) do nothing;

-- agent_config de la clínica (dental, con nuevo paciente)
insert into public.agent_configs
  (organization_id, system_prompt, tone, services, business_hours, collect_new_patient)
values (
  '00000000-0000-0000-0000-000000000001',
  'Eres el asistente de una clínica dental. Agenda citas y resuelve dudas por WhatsApp de forma breve y cálida.',
  'profesional y cálido',
  '[
    {"name":"limpieza","duration_minutes":30,"description":"Limpieza dental de rutina"},
    {"name":"empaste","duration_minutes":45,"description":"Empaste de caries"},
    {"name":"blanqueamiento","duration_minutes":60,"description":"Blanqueamiento dental"}
  ]'::jsonb,
  '{"mon":[{"start":"09:00","end":"18:00"}],"tue":[{"start":"09:00","end":"18:00"}],"wed":[{"start":"09:00","end":"18:00"}],"thu":[{"start":"09:00","end":"18:00"}],"fri":[{"start":"09:00","end":"18:00"}],"sat":[{"start":"09:00","end":"13:00"}],"sun":[]}'::jsonb,
  true
)
on conflict (organization_id) do nothing;

-- agent_config de la barbería (demuestra la flexibilidad: sin "nuevo paciente")
insert into public.agent_configs
  (organization_id, system_prompt, tone, services, business_hours, collect_new_patient)
values (
  '00000000-0000-0000-0000-000000000002',
  'Eres el asistente de una barbería. Agenda cortes y resuelve dudas por WhatsApp.',
  'relajado y directo',
  '[
    {"name":"corte","duration_minutes":30,"description":"Corte de cabello"},
    {"name":"barba","duration_minutes":20,"description":"Arreglo de barba"}
  ]'::jsonb,
  '{"mon":[{"start":"10:00","end":"20:00"}],"tue":[{"start":"10:00","end":"20:00"}],"wed":[{"start":"10:00","end":"20:00"}],"thu":[{"start":"10:00","end":"20:00"}],"fri":[{"start":"10:00","end":"20:00"}],"sat":[{"start":"10:00","end":"18:00"}],"sun":[]}'::jsonb,
  false
)
on conflict (organization_id) do nothing;
