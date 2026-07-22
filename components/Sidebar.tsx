"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarDots,
  ChatsCircle,
  SlidersHorizontal,
  PlugsConnected,
  SignOut,
  ChatCircleDots,
} from "@phosphor-icons/react";
import { logout } from "@/app/(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/citas", label: "Citas", icon: CalendarDots },
  { href: "/conversaciones", label: "Conversaciones", icon: ChatsCircle },
  { href: "/personalizacion", label: "Personalización", icon: SlidersHorizontal },
  { href: "/integraciones", label: "Integraciones", icon: PlugsConnected },
];

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-4 py-4 flex items-center gap-2 font-semibold border-b border-border">
        <ChatCircleDots size={22} weight="fill" className="text-primary" />
        <span className="truncate">{orgName}</span>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-background text-foreground"
              }`}
            >
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <form action={logout} className="p-2 border-t border-border">
        <button
          type="submit"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:bg-background"
        >
          <SignOut size={20} />
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
