import Link from "next/link";
import { ChatsCircle, CalendarCheck } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentWeekRangeUtc } from "@/lib/tz";

export default async function DashboardPage() {
  const { organization } = await requireUser();
  const supabase = await createClient();
  const orgId = organization!.id;
  const tz = organization!.timezone;

  // Server Component async: se renderiza una vez por request, así que leer la
  // hora actual aquí es correcto (la regla de pureza aplica a componentes cliente).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { start: weekStart, end: weekEnd } = currentWeekRangeUtc(tz);

  const [convCountRes, apptCountRes, recentConvsRes, convsForChartRes] =
    await Promise.all([
      // KPI 1: conversaciones únicas con actividad en los últimos 30 días.
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("last_message_at", thirtyDaysAgo),
      // KPI 2: citas confirmadas de la semana actual (en la tz de la org).
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString()),
      // Últimas 5 conversaciones.
      supabase
        .from("conversations")
        .select("id, last_message_at, contact:contacts(full_name, wa_phone)")
        .eq("organization_id", orgId)
        .order("last_message_at", { ascending: false })
        .limit(5),
      // Datos para el gráfico: last_message_at de los últimos 30 días.
      supabase
        .from("conversations")
        .select("last_message_at")
        .eq("organization_id", orgId)
        .gte("last_message_at", thirtyDaysAgo),
    ]);

  const convCount = convCountRes.count ?? 0;
  const apptCount = apptCountRes.count ?? 0;
  const recent = recentConvsRes.data ?? [];
  const chart = buildDailyChart(
    (convsForChartRes.data ?? []).map((r) => r.last_message_at),
    tz,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        description={`Resumen de ${organization!.name}.`}
      />

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <KpiCard
          icon={<ChatsCircle size={24} weight="duotone" className="text-primary" />}
          label="Conversaciones (últimos 30 días)"
          value={convCount}
        />
        <KpiCard
          icon={<CalendarCheck size={24} weight="duotone" className="text-primary" />}
          label="Citas de esta semana"
          value={apptCount}
        />
      </div>

      {/* Gráfico */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5 max-w-2xl">
        <h2 className="font-semibold text-sm mb-4">
          Conversaciones por día (últimos 30 días)
        </h2>
        <DailyBars data={chart} />
      </section>

      {/* Últimas conversaciones */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5 max-w-2xl">
        <h2 className="font-semibold text-sm mb-3">Últimas conversaciones</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay conversaciones.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((c) => {
              const contact = c.contact as {
                full_name: string | null;
                wa_phone: string;
              } | null;
              return (
                <li key={c.id}>
                  <Link
                    href={`/conversaciones/${c.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-primary"
                  >
                    <span>{contact?.full_name || contact?.wa_phone || "Contacto"}</span>
                    <span className="text-xs text-muted">
                      {new Date(c.last_message_at).toLocaleString("es-MX", {
                        timeZone: tz,
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {icon}
      <p className="text-3xl font-bold mt-2">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

interface DayBucket {
  label: string;
  count: number;
}

/** Cuenta conversaciones por día (en la tz) para los últimos 30 días. */
function buildDailyChart(timestamps: string[], timeZone: string): DayBucket[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = fmt.format(new Date(ts));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: DayBucket[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = fmt.format(d);
    buckets.push({ label: key.slice(5), count: counts.get(key) ?? 0 });
  }
  return buckets;
}

function DailyBars({ data }: { data: DayBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-0.5 h-32">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors min-h-[2px]"
          style={{ height: `${(d.count / max) * 100}%` }}
          title={`${d.label}: ${d.count}`}
        />
      ))}
    </div>
  );
}
