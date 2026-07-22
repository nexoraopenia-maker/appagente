import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseServices } from "@/lib/agent/config";
import { ConfigForm } from "./ConfigForm";
import { Sandbox } from "./Sandbox";

export default async function PersonalizacionPage() {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const { data: cfg } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("organization_id", organization!.id)
    .maybeSingle();

  const businessInfo = (cfg?.business_info as Record<string, string>) ?? {};
  const businessHours =
    (cfg?.business_hours as Record<string, { start: string; end: string }[]>) ?? {};

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Personalización"
        description="Ajusta cómo responde el agente. Los cambios afectan a la siguiente respuesta."
      />

      <div className="space-y-6">
        {cfg && (
          <ConfigForm
            initial={{
              system_prompt: cfg.system_prompt,
              tone: cfg.tone,
              handoff_message: cfg.handoff_message,
              collect_new_patient: cfg.collect_new_patient,
              business_info: businessInfo,
              services: parseServices(cfg.services),
              business_hours: businessHours,
            }}
          />
        )}

        <Sandbox />
      </div>
    </div>
  );
}
