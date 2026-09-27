import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { evaluateSubject } from "@/lib/grading";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminSheetActions } from "@/components/marks/AdminSheetActions";
import { MarkSheetStatusBadge } from "@/components/marks/MarkSheetStatusBadge";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Mark Sheet Review" };
export const dynamic = "force-dynamic";

export default async function AdminMarkSheetReviewPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  await requireRole(["ADMIN"], "/admin/marks");
  const { sheetId } = await params;
  const store = await getStore();

  const sheet = await store.getMarkSheet(sheetId);
  if (!sheet) notFound();

  const [klass, subject, teacher, roster, settings, year] = await Promise.all([
    store.getClassById(sheet.classId),
    store.getSubjectBySlug(sheet.subjectSlug),
    store.getTeacherById(sheet.teacherId),
    store.listStudentsByClass(sheet.classId),
    store.getSettings(),
    (await store.listAcademicYears()).find((y) => y.id === sheet.academicYearId),
  ]);

  const studentById = new Map(roster.map((s) => [s.id, s]));
  const rows = sheet.entries
    .map((entry) => {
      const student = studentById.get(entry.studentId);
      if (!student) return null;
      const evaluation = evaluateSubject(entry.marks, settings.gradeBands);
      return { student, entry, evaluation };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.student.roll - b.student.roll);

  const marked = rows.filter((r) => r.entry.absent || r.entry.marks !== null);
  const absentCount = rows.filter((r) => r.evaluation.absent).length;
  const numeric = marked.filter((r) => !r.evaluation.absent);
  const average =
    numeric.length === 0
      ? null
      : numeric.reduce((sum, r) => sum + (r.entry.marks ?? 0), 0) / numeric.length;
  const passed = numeric.filter((r) => !r.evaluation.fail).length;

  const classLabel = klass ? `${klass.name} (${klass.section})` : sheet.classId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mark Sheet Review" description={`${classLabel} · ${subject?.name ?? sheet.subjectSlug} · ${sheet.exam} ${year?.label ?? ""}`}>
        <Link
          href="/admin/marks"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to queue
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
            <div className="mt-2">
              <MarkSheetStatusBadge status={sheet.status} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Teacher: {teacher?.name ?? sheet.teacherId}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Entered</p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {marked.length}/{rows.length}
            </p>
            <p className="mt-1 text-xs text-muted">{absentCount} absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Average marks
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {average === null ? "—" : average.toFixed(1)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Passed (non-F)
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {passed}/{numeric.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {sheet.status === "submitted" && (
        <Card>
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSheetActions sheetId={sheet.id} />
          </CardContent>
        </Card>
      )}
      {sheet.status === "draft" && (
        <Alert tone="info" title="Still a draft">
          The teacher has not submitted this sheet yet — nothing to review. Last
          saved {formatDateTime(sheet.updatedAt)}.
        </Alert>
      )}
      {sheet.status === "published" && (
        <Alert tone="success" title="Published">
          Published on {sheet.publishedAt ? formatDateTime(sheet.publishedAt) : "—"}.
          Published sheets are immutable; students of {classLabel} can see this result.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Marks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH className="w-16">Roll</TH>
                <TH>Student</TH>
                <TH className="w-28">Marks</TH>
                <TH className="w-20">Grade</TH>
                <TH className="w-20">Points</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ student, entry, evaluation }) => (
                <TableRow key={student.id}>
                  <TD className="tabular-nums">{student.roll}</TD>
                  <TD className="font-medium">{student.name}</TD>
                  <TD>
                    {evaluation.absent ? (
                      <Badge tone="danger">Absent</Badge>
                    ) : (
                      <span className="tabular-nums">{entry.marks}</span>
                    )}
                  </TD>
                  <TD>{evaluation.grade}</TD>
                  <TD className="tabular-nums">{evaluation.points.toFixed(2)}</TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted">
            Grades come from the school grading settings
            {settings.failCapsGpa ? " (any F caps the term GPA at 0.00)" : ""}.
            Sheet created {formatDate(sheet.createdAt)}, last updated{" "}
            {formatDateTime(sheet.updatedAt)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
