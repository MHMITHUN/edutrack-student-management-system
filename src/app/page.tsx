import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { HOME_BY_ROLE } from "@/lib/nav";

/**
 * EduTrack is an internal system — there is no public marketing site.
 * Anonymous visitors go to /login; signed-in users go to their role home.
 */
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? HOME_BY_ROLE[user.role] : "/login");
}
