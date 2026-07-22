import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Si ya tiene organización, no hay nada que hacer aquí.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.organization_id) redirect("/dashboard");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-2">Configura tu negocio</h1>
        <p className="text-sm text-muted mb-6">
          Con esto creamos tu espacio de trabajo y un agente con configuración
          por defecto para clínica dental. Podrás editarlo todo después.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
