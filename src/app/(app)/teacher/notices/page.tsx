import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { noticesVisibleTo } from "@/lib/notices/rules";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { NoticeList } from "@/components/notices/NoticeList";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

export default async function TeacherNoticesPage() {
  const user = await requireRole(["TEACHER"], "/teacher/notices");
  const store = await getStore();

  const teacher = await store.getTeacherByUserId(user.id);
  const [notices, classes] = await Promise.all([
    store.listNotices(),
    store.listClasses(),
  ]);

  const myClassIds = teacher
    ? [...new Set(teacher.classAssignments.map((a) => a.classId))]
    : [];

  // Audience rules: teachers see staff notices + everything students see,
  // plus class notices for classes they teach.
  const visible = noticesVisibleTo(notices, { role: "TEACHER", classIds: myClassIds });

  const authorIds = [...new Set(notices.map((n) => n.authorId))];
  const authorNames: Record<string, string> = {};
  for (const authorId of authorIds) {
    const author = await store.getUserById(authorId);
    authorNames[authorId] = author?.name ?? "School office";
  }

  const postableClasses = classes
    .filter((klass) => myClassIds.includes(klass.id))
    .map((klass) => ({ id: klass.id, label: `${klass.name} (${klass.section})` }));

  if (!teacher) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notices" description="School notices for you and your classes." />
        <NoticeList notices={visible} classes={classes} authorNames={authorNames} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notices"
        description="Staff notices plus notices for the classes you teach. You can post notices for students and your own classes."
      />

      <Card>
        <CardHeader>
          <CardTitle>New notice</CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeForm allowTeachersAudience={false} classes={postableClasses} />
        </CardContent>
      </Card>

      <section aria-label="Notices for you" className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Visible to you ({visible.length})
        </h2>
        <NoticeList notices={visible} classes={classes} authorNames={authorNames} />
      </section>
    </div>
  );
}
