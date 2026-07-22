import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCalendars, type CalendarOption } from "@/lib/google/calendar";
import { WhatsAppCard } from "./WhatsAppCard";
import { GoogleCard } from "./GoogleCard";

export default async function IntegracionesPage() {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const [{ data: wa }, { data: gc }] = await Promise.all([
    supabase
      .from("whatsapp_configs")
      .select("phone_number_id, waba_id, verify_token, access_token_encrypted")
      .eq("organization_id", organization!.id)
      .maybeSingle(),
    supabase
      .from("google_calendar_configs")
      .select("calendar_id, refresh_token_encrypted")
      .eq("organization_id", organization!.id)
      .maybeSingle(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;

  const googleConnected = Boolean(gc?.refresh_token_encrypted);
  let calendars: CalendarOption[] = [];
  let calendarLoadError: string | null = null;
  if (googleConnected) {
    try {
      calendars = await listCalendars(organization!.id);
    } catch (e) {
      calendarLoadError = (e as Error).message;
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Integraciones"
        description="Conecta WhatsApp y Google Calendar para que el agente funcione."
      />

      <div className="space-y-6">
        <WhatsAppCard
          webhookUrl={webhookUrl}
          orgSlug={organization!.slug}
          existing={
            wa
              ? {
                  phone_number_id: wa.phone_number_id,
                  waba_id: wa.waba_id,
                  verify_token: wa.verify_token,
                  hasSecrets: Boolean(wa.access_token_encrypted),
                }
              : null
          }
        />

        <GoogleCard
          connected={googleConnected}
          currentCalendarId={gc?.calendar_id ?? null}
          calendars={calendars}
          loadError={calendarLoadError}
        />
      </div>
    </div>
  );
}
