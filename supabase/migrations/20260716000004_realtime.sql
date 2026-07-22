-- ============================================================================
-- 20260716000004_realtime.sql
-- Habilita Supabase Realtime para la bandeja de conversaciones.
--
-- Realtime respeta RLS: cada cliente del dashboard solo recibe cambios de filas
-- que sus políticas le permiten ver (las de su organización).
-- ============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
