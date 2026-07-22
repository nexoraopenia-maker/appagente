import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireUser() redirige a /login o /onboarding si hace falta.
  const { organization } = await requireUser();

  return (
    <div className="flex-1 flex min-h-0">
      <Sidebar orgName={organization?.name ?? "Mi negocio"} />
      <div className="flex-1 min-w-0 overflow-auto">{children}</div>
    </div>
  );
}
