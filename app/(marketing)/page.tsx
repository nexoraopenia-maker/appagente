import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center px-4 sm:px-6 font-sans">

      {/* 1. NAVBAR MINIMALISTA */}
      <header className="w-full max-w-5xl flex items-center justify-between py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-lg">
            💬
          </div>
          <span className="font-semibold text-lg tracking-tight text-white">
            Agente<span className="text-emerald-400">WhatsApp</span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className="text-zinc-400 hover:text-white transition-colors px-3 py-2 font-medium"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-medium border border-zinc-800 transition-all hover:border-zinc-700 shadow-sm"
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main className="w-full max-w-3xl flex flex-col items-center text-center mt-12 sm:mt-20">

        {/* Badge superior opcional */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Especial para clínicas y consultorios
        </div>

        {/* Título Principal */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
          Tu clínica atiende WhatsApp sola, <span className="text-emerald-400">24/7</span>
        </h1>

        {/* Subtítulo */}
        <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed font-normal">
          Un agente de IA responde a tus pacientes, resuelve dudas frecuentes y agenda citas directamente en tu Google Calendar. Tú solo revisas el panel.
        </p>

        {/* Botón CTA con Glow */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base transition-all shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 group"
          >
            Empezar gratis
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* 3. TARJETAS DE CARACTERÍSTICAS (Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-20 mb-16 text-left">

          {/* Tarjeta 1 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-sm hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 text-xl">
              🤖
            </div>
            <h3 className="font-semibold text-white text-base mb-1">Agente personalizable</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Edita el prompt, el tono y los servicios. Sirve para clínicas dentales y cualquier negocio con citas.
            </p>
          </div>

          {/* Tarjeta 2 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-sm hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 text-xl">
              📅
            </div>
            <h3 className="font-semibold text-white text-base mb-1">Agenda automática</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Sugiere 3 huecos libres reales de tu calendario y confirma la cita en segundos.
            </p>
          </div>

          {/* Tarjeta 3 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-sm hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 text-xl">
              💬
            </div>
            <h3 className="font-semibold text-white text-base mb-1">Handoff humano</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Cuando haga falta, el bot te pasa la conversación y deja de responder ese hilo.
            </p>
          </div>

        </div>

      </main>

    </div>
  );
}
