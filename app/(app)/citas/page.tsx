import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CalendarView, type Appointment } from "./CalendarView";

export default async function CitasPage() {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, service, starts_at, ends_at, status, full_name, phone, is_new_patient, notes",
    )
    .eq("organization_id", organization!.id)
    .order("starts_at", { ascending: true });

  return (
    <div className="p-6">
      <PageHeader
        title="Citas"
        description="Calendario de citas agendadas. Haz clic en una para ver el detalle."
      />
      <CalendarView
        appointments={(appointments ?? []) as Appointment[]}
        timeZone={organization!.timezone}
      />
    </div>
  );
}
