"use client";

import { useState, useTransition } from "react";
import { Robot, User, PaperPlaneRight, Flask } from "@phosphor-icons/react";
import { testAgent } from "./actions";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function Sandbox() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setText("");
    startTransition(async () => {
      const res = await testAgent(next);
      if (res.error) setError(res.error);
      else if (res.reply)
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply! }]);
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Flask size={20} weight="duotone" className="text-primary" />
        Probar agente
      </h2>
      <p className="text-sm text-muted mt-1">
        Chatea con el agente usando la configuración actual. No envía nada a
        WhatsApp ni crea citas reales (los horarios son de ejemplo).
      </p>

      <div className="mt-4 h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted text-center mt-20">
            Escribe un mensaje como si fueras un cliente.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              }`}
            >
              <span className="flex items-center gap-1 text-[10px] opacity-70 mb-0.5">
                {m.role === "user" ? (
                  <>
                    <User size={11} weight="fill" /> Cliente
                  </>
                ) : (
                  <>
                    <Robot size={11} weight="fill" /> Agente
                  </>
                )}
              </span>
              <span className="whitespace-pre-wrap break-words">{m.content}</span>
            </div>
          </div>
        ))}
        {pending && (
          <p className="text-xs text-muted">El agente está escribiendo…</p>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Hola, quiero una cita…"
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary max-h-32"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !text.trim()}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Enviar"
        >
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </div>

      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setMessages([])}
          className="mt-2 text-xs text-muted underline"
        >
          Reiniciar conversación
        </button>
      )}
    </section>
  );
}
