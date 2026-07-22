import Link from "next/link";
import {
  ChatCircleDots,
  CalendarCheck,
  Robot,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";

export default function LandingPage() {
  return (
    <main className="flex-1">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <span className="flex items-center gap-2 font-semibold">
          <ChatCircleDots size={24} weight="fill" className="text-primary" />
          Agente WhatsApp
        </span>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="px-3 py-2 hover:text-primary">
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Crear cuenta
          </Link>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto text-center px-6 pt-20 pb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Tu clínica atiende WhatsApp sola, 24/7
        </h1>
        <p className="mt-6 text-lg text-muted">
          Un agente de IA responde a tus pacientes, resuelve dudas y agenda citas
          directamente en tu Google Calendar. Tú solo revisas el panel.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Empezar gratis <ArrowRight size={18} weight="bold" />
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-6 px-6 pb-24">
        {[
          {
            icon: Robot,
            title: "Agente personalizable",
            body: "Edita el prompt, el tono y los servicios. Sirve para clínicas dentales y cualquier negocio con citas.",
          },
          {
            icon: CalendarCheck,
            title: "Agenda automática",
            body: "Sugiere 3 huecos libres reales de tu calendario y confirma la cita en segundos.",
          },
          {
            icon: ChatCircleDots,
            title: "Handoff humano",
            body: "Cuando haga falta, el bot te pasa la conversación y deja de responder ese hilo.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-card p-6"
          >
            <Icon size={28} weight="duotone" className="text-primary" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
