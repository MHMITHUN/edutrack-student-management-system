import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { NoticeList } from "@/components/notices/NoticeList";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  await requireRole(["ADMIN"], "/admin/notices");
  const store = await getStore();

  const [notices, classes] = await Promise.all([
    store.listNotices(),
    store.listClasses(),
  ]);

  // Author names for the feed (admins and teachers author notices).
  const authorIds = [...new Set(notices.map((n) => n.authorId))];
  const authorNames: Record<string, string> = {};
  for (const authorId of authorIds) {
    const user = await store.getUserById(authorId);
    authorNames[authorId] = user?.name ?? "School office";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notices"
        description="Publish school notices. Everything is published immediately and audited."
      />

      <Card>
        <CardHeader>
          <CardTitle>New notice</CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeForm
            allowTeachersAudience
            classes={classes.map((klass) => ({
              id: klass.id,
              label: `${klass.name} (${klass.section})`,
            }))}
          />
        </CardContent>
      </Card>

      <section aria-label="Published notices" className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          All notices ({notices.length})
        </h2>
        <NoticeList notices={notices} classes={classes} authorNames={authorNames} />
      </section>
    </div>
  );
}
