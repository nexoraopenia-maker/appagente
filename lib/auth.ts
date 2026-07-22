// Helpers de sesión para Server Components y Server Actions.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export interface CurrentUser {
  userId: string;
  email: string | null;
  profile: Tables<"profiles"> | null;
  organization: Tables<"organizations"> | null;
}

/**
 * Devuelve el usuario autenticado con su profile y organización, o redirige a
 * /login si no hay sesión. Si hay sesión pero aún no hay organización (onboarding
 * incompleto), redirige a /onboarding.
 */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) redirect("/onboarding");

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    organization,
  };
}
