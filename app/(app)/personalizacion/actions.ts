"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runAgentSandbox } from "@/lib/agent/sandbox";
import type { ModelMessage } from "ai";

export interface SaveResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export async function saveAgentConfig(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const system_prompt = String(formData.get("system_prompt") ?? "").trim();
  const tone = String(formData.get("tone") ?? "").trim() || "profesional y cálido";
  const handoff_message =
    String(formData.get("handoff_message") ?? "").trim() ||
    "Te paso con un humano en un momento.";
  const collect_new_patient = formData.get("collect_new_patient") === "on";

  if (!system_prompt) return { error: "El prompt del sistema no puede estar vacío." };

  // business_info: campos agrupados → jsonb
  const business_info = {
    direccion: String(formData.get("info_direccion") ?? ""),
    telefono: String(formData.get("info_telefono") ?? ""),
    faq: String(formData.get("info_faq") ?? ""),
    cancellation_policy: String(formData.get("info_cancelacion") ?? ""),
  };

  // services: arrays paralelos service_name[], service_duration[], service_desc[]
  const names = formData.getAll("service_name").map(String);
  const durations = formData.getAll("service_duration").map(String);
  const descs = formData.getAll("service_desc").map(String);
  const services = names
    .map((name, i) => ({
      name: name.trim(),
      duration_minutes: Number(durations[i]) || 30,
      description: (descs[i] ?? "").trim() || undefined,
    }))
    .filter((s) => s.name !== "");

  // business_hours: por día, hours_{day}_start / _end, y closed_{day}
  const business_hours: Record<string, { start: string; end: string }[]> = {};
  for (const day of DAYS) {
    const closed = formData.get(`closed_${day}`) === "on";
    const start = String(formData.get(`hours_${day}_start`) ?? "").trim();
    const end = String(formData.get(`hours_${day}_end`) ?? "").trim();
    business_hours[day] = closed || !start || !end ? [] : [{ start, end }];
  }

  const { error } = await supabase
    .from("agent_configs")
    .update({
      system_prompt,
      tone,
      handoff_message,
      collect_new_patient,
      business_info,
      services,
      business_hours,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization!.id);

  if (error) return { error: error.message };

  revalidatePath("/personalizacion");
  return { ok: true, message: "Cambios guardados. Afectarán a la siguiente respuesta del agente." };
}

/** Sandbox: charla con el agente usando la config actual, sin tocar WhatsApp. */
export async function testAgent(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply?: string; error?: string }> {
  const { organization } = await requireUser();
  try {
    const reply = await runAgentSandbox({
      organizationId: organization!.id,
      messages: history as ModelMessage[],
    });
    return { reply };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
