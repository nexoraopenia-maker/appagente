import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatThread, type ChatMessage } from "../ChatThread";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await requireUser();
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, bot_active, contact:contacts(full_name, wa_phone)")
    .eq("id", id)
    .eq("organization_id", organization!.id)
    .maybeSingle();

  if (!conv) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, sender, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  const contact = conv.contact as {
    full_name: string | null;
    wa_phone: string;
  } | null;

  return (
    <ChatThread
      conversationId={conv.id}
      contactName={contact?.full_name || contact?.wa_phone || "Contacto"}
      contactPhone={contact?.wa_phone ?? ""}
      initialBotActive={conv.bot_active}
      initialMessages={(messages ?? []) as ChatMessage[]}
    />
  );
}
