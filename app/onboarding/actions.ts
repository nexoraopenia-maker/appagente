"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos combinantes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const timezone =
    String(formData.get("timezone") ?? "").trim() || "America/Mexico_City";

  if (!name) return { error: "El nombre del negocio es obligatorio." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // slug único: base + sufijo aleatorio corto para evitar colisiones.
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

  // La creación de organización + profile + agent_config es atómica dentro de
  // la función SECURITY DEFINER (ver migración 0003).
  const { error } = await supabase.rpc("create_organization_for_user", {
    org_name: name,
    org_slug: slug,
    full_name: fullName,
    org_timezone: timezone,
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}
