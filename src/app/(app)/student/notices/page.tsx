import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { noticesVisibleTo } from "@/lib/notices/rules";
import { NoticeList } from "@/components/notices/NoticeList";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

export default async function StudentNoticesPage() {
  const user = await requireRole(["STUDENT"], "/student/notices");
  const store = await getStore();

  const student = await store.getStudentByUserId(user.id);
  const [notices, classes] = await Promise.all([
    store.listNotices(),
    store.listClasses(),
  ]);

  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notices" description="School notices for you." />
        <EmptyState
          title="No student profile"
          description="Your account is not linked to a student record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  // Audience rules: students see all/students notices + notices for THEIR
  // class only. Teacher-only notices are filtered out here, server-side.
  const visible = noticesVisibleTo(notices, {
    role: "STUDENT",
    classIds: [student.classId],
  });

  const authorIds = [...new Set(visible.map((n) => n.authorId))];
  const authorNames: Record<string, string> = {};
  for (const authorId of authorIds) {
    const author = await store.getUserById(authorId);
    authorNames[authorId] = author?.name ?? "School office";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notices"
        description="School notices addressed to students — including your class."
      />
      <NoticeList notices={visible} classes={classes} authorNames={authorNames} />
    </div>
  );
}
