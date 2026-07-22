// Cliente Supabase para Server Components, Server Actions y Route Handlers.
// Lee/escribe la sesión desde las cookies. Usa la anon key → sujeto a RLS.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` desde un Server Component lanza (las cookies son de solo
            // lectura ahí). El refresco de sesión lo maneja el middleware, así
            // que ignorar aquí es correcto.
          }
        },
      },
    },
  );
}
