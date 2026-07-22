import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ConversacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, bot_active, last_message_at, contact:contacts(full_name, wa_phone)",
    )
    .eq("organization_id", organization!.id)
    .order("last_message_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex-1 flex min-h-0 h-full">
      {/* Lista de conversaciones */}
      <div className="w-72 shrink-0 border-r border-border overflow-y-auto">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          Conversaciones
        </div>
        {(conversations ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted">Aún no hay conversaciones.</p>
        ) : (
          <ul>
            {(conversations ?? []).map((c) => {
              const contact = c.contact as {
                full_name: string | null;
                wa_phone: string;
              } | null;
              const name = contact?.full_name || contact?.wa_phone || "Contacto";
              const initial = name.charAt(0).toUpperCase();
              return (
                <li key={c.id}>
                  <Link
                    href={`/conversaciones/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-card border-b border-border/50"
                  >
                    <span className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                      {initial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {contact?.wa_phone}
                      </span>
                    </span>
                    {!c.bot_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                        humano
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detalle */}
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
