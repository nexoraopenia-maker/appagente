"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Robot, User, PaperPlaneRight } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/browser";
import { toggleBot, sendHumanMessage } from "./actions";

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  sender: "contact" | "bot" | "human";
  content: string | null;
  created_at: string;
}

interface Props {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  initialBotActive: boolean;
  initialMessages: ChatMessage[];
}

export function ChatThread({
  conversationId,
  contactName,
  contactPhone,
  initialBotActive,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [botActive, setBotActive] = useState(initialBotActive);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime: nuevos mensajes de esta conversación.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          setBotActive(Boolean((payload.new as { bot_active: boolean }).bot_active));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onToggle = () => {
    const next = !botActive;
    setBotActive(next); // optimista; Realtime confirmará
    startTransition(async () => {
      const res = await toggleBot(conversationId, next);
      if (res.error) setBotActive(!next);
    });
  };

  const onSend = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    startTransition(async () => {
      await sendHumanMessage(conversationId, t);
      // El mensaje aparecerá vía Realtime al insertarse.
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <p className="font-medium">{contactName}</p>
          <p className="text-xs text-muted">{contactPhone}</p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <span className={botActive ? "text-primary" : "text-muted"}>
            Bot {botActive ? "activo" : "inactivo"}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={botActive}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              botActive ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                botActive ? "translate-x-5" : ""
              }`}
            />
          </button>
        </label>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        {!botActive && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            El bot está desactivado: tú respondes esta conversación.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder="Escribe un mensaje…"
            className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary max-h-32"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={pending || !text.trim()}
            className="p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Enviar"
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isInbound = message.direction === "inbound";
  const time = new Date(message.created_at).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Entrantes a la izquierda; salientes a la derecha. Bot vs humano por color/icono.
  const align = isInbound ? "items-start" : "items-end";
  const bubbleClass = isInbound
    ? "bg-card border border-border"
    : message.sender === "human"
      ? "bg-blue-600 text-white"
      : "bg-primary text-primary-foreground";

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${bubbleClass}`}>
        {!isInbound && (
          <span className="flex items-center gap-1 text-[10px] opacity-80 mb-0.5">
            {message.sender === "human" ? (
              <>
                <User size={11} weight="fill" /> Tú
              </>
            ) : (
              <>
                <Robot size={11} weight="fill" /> Bot
              </>
            )}
          </span>
        )}
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
      </div>
      <span className="text-[10px] text-muted mt-0.5 px-1">{time}</span>
    </div>
  );
}
