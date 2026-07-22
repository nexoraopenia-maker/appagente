import { Suspense } from "react";
import Link from "next/link";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import { AuthForm } from "../AuthForm";

export default function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="flex items-center gap-2 justify-center font-semibold mb-8"
        >
          <ChatCircleDots size={24} weight="fill" className="text-primary" />
          Agente WhatsApp
        </Link>
        <h1 className="text-xl font-semibold text-center mb-6">Crea tu cuenta</h1>
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}
