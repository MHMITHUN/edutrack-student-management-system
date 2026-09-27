import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { ExamSchema, type MarkSheetStatus } from "@/lib/db/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarkSheetStatusBadge } from "@/components/marks/MarkSheetStatusBadge";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LabeledSelect,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";
import { formatDate, searchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Marks Review" };
export const dynamic = "force-dynamic";

const STATUSES: MarkSheetStatus[] = ["draft", "submitted", "published"];

function isStatus(value: string | undefined): value is MarkSheetStatus {
  return STATUSES.includes(value as MarkSheetStatus);
}

export default async function AdminMarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"], "/admin/marks");
  const sp = await searchParams;
  const store = await getStore();

  const [classes, subjects, teachers, years] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
    store.listTeachers(),
    store.listAcademicYears(),
  ]);

  const statusParam = searchParam(sp, "status");
  const status = statusParam === "all" ? undefined : isStatus(statusParam) ? statusParam : "submitted";
  const classId = searchParam(sp, "class") ?? "";
  const subjectSlug = searchParam(sp, "subject") ?? "";
  const exam = searchParam(sp, "exam") ?? "";
  const isExam = (ExamSchema.options as readonly string[]).includes(exam);

  const [sheets, pendingAll, draftsAll, publishedAll] = await Promise.all([
    store.listMarkSheets({
      ...(status ? { status } : {}),
      ...(classId ? { classId } : {}),
      ...(subjectSlug ? { subjectSlug } : {}),
      ...(isExam ? { exam: exam as (typeof ExamSchema.options)[number] } : {}),
    }),
    store.listMarkSheets({ status: "submitted" }),
    store.listMarkSheets({ status: "draft" }),
    store.listMarkSheets({ status: "published" }),
  ]);

  const className = (id: string) => {
    const klass = classes.find((c) => c.id === id);
    return klass ? `${klass.name} (${klass.section})` : id;
  };
  const subjectName = (slug: string) =>
    subjects.find((s) => s.slug === slug)?.name ?? slug;
  const teacherName = (id: string) =>
    teachers.find((t) => t.id === id)?.name ?? id;
  const yearLabel = (id: string) => years.find((y) => y.id === id)?.label ?? id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marks Review"
        description="Review mark sheets submitted by teachers. Publishing makes results visible to students."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Awaiting review
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {pendingAll.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Drafts with teachers
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {draftsAll.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Published results
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {publishedAll.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <form method="get" action="/admin/marks">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="am-status"
              label="Status"
              name="status"
              defaultValue={status ?? "all"}
              className="min-w-36 flex-1"
              options={[
                { value: "submitted", label: "Submitted (queue)" },
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "all", label: "All statuses" },
              ]}
            />
            <LabeledSelect
              id="am-class"
              label="Class"
              name="class"
              defaultValue={classId}
              className="min-w-44 flex-1"
              options={[
                { value: "", label: "All classes" },
                ...classes.map((klass) => ({
                  value: klass.id,
                  label: `${klass.name} (${klass.section})`,
                })),
              ]}
            />
            <LabeledSelect
              id="am-subject"
              label="Subject"
              name="subject"
              defaultValue={subjectSlug}
              className="min-w-36 flex-1"
              options={[
                { value: "", label: "All subjects" },
                ...subjects.map((subject) => ({ value: subject.slug, label: subject.name })),
              ]}
            />
            <LabeledSelect
              id="am-exam"
              label="Exam"
              name="exam"
              defaultValue={exam}
              className="min-w-36 flex-1"
              options={[
                { value: "", label: "All exams" },
                ...ExamSchema.options.map((option) => ({ value: option, label: option })),
              ]}
            />
            <div>
              <Button type="submit" variant="outline">
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {status === undefined
              ? "All mark sheets"
              : status === "submitted"
                ? "Review queue"
                : `${status.charAt(0).toUpperCase()}${status.slice(1)} sheets`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Class</TH>
                <TH>Subject</TH>
                <TH>Exam</TH>
                <TH>Year</TH>
                <TH>Teacher</TH>
                <TH className="w-24">Status</TH>
                <TH className="w-32">Updated</TH>
                <TH className="w-40">Entered</TH>
                <TH className="w-20" />
              </TableRow>
            </TableHead>
            <TableBody>
              {sheets.length === 0 && (
                <TableEmpty colSpan={9}>
                  Nothing here right now. Submitted sheets appear in this queue
                  automatically.
                </TableEmpty>
              )}
              {sheets.map((sheet) => (
                <TableRow key={sheet.id}>
                  <TD className="font-medium">{className(sheet.classId)}</TD>
                  <TD>{subjectName(sheet.subjectSlug)}</TD>
                  <TD>{sheet.exam}</TD>
                  <TD>{yearLabel(sheet.academicYearId)}</TD>
                  <TD>{teacherName(sheet.teacherId)}</TD>
                  <TD>
                    <MarkSheetStatusBadge status={sheet.status} />
                  </TD>
                  <TD className="text-muted">{formatDate(sheet.updatedAt)}</TD>
                  <TD className="tabular-nums">
                    {sheet.entries.filter((e) => e.absent || e.marks !== null).length}/
                    {sheet.entries.length}
                  </TD>
                  <TD>
                    <Link
                      href={`/admin/marks/${sheet.id}`}
                      className="rounded-md text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Review
                    </Link>
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sheets.length === 0 && status === "submitted" && (
        <EmptyState
          icon={ClipboardCheck}
          title="Review queue is empty"
          description="No mark sheets are waiting. When a teacher submits one, it lands here."
        />
      )}
    </div>
  );
}
