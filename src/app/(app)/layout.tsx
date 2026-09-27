import { requireUser } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/AppShell";

/** All logged-in areas render inside the AppShell with role navigation. */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
