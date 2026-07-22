// Cliente Supabase con service_role: BYPASEA RLS.
//
// Solo para código de servidor sin sesión de usuario — en la práctica, el
// webhook de WhatsApp, que resuelve la organización desde el phone_number_id y
// debe filtrar por organization_id MANUALMENTE en cada consulta.
//
// NUNCA importar esto desde un componente cliente ni exponer la service_role al
// browser. Si necesitas datos con la sesión del usuario, usa lib/supabase/server.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el cliente admin.",
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
