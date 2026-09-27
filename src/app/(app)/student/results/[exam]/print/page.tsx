import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { ExamSchema, type Exam } from "@/lib/db/types";
import { buildStudentTermResult } from "@/lib/marks/results";
import { verificationId } from "@/lib/marks/verification";
import { PrintButton } from "@/components/student/PrintButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Printable Marksheet" };
export const dynamic = "force-dynamic";

const isExam = (value: string): value is Exam =>
  (ExamSchema.options as readonly string[]).includes(value);

/**
 * Printable marksheet (spec 18.8). Only PUBLISHED sheets are read. A student
 * can print only their OWN sheet; an administrator may print any student's
 * sheet by passing ?student=<id> (the admin "view variant"). The
 * verification ID is a deterministic hash of student+exam+year — labelled as
 * a demo lookup key, not an official seal.
 */
export default async function PrintableMarksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ exam: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["STUDENT", "ADMIN"], "/student/results");
  const { exam: rawExam } = await params;
  const exam = decodeURIComponent(rawExam);
  const sp = await searchParams;
  const store = await getStore();

  const yearParam = typeof sp.year === "string" ? sp.year : undefined;
  const adminStudentParam = typeof sp.student === "string" ? sp.student : undefined;

  // Resolve the subject of the marksheet: the student themselves, or an
  // admin-selected student (admin view variant).
  const student =
    user.role === "STUDENT"
      ? user.linkedId
        ? await store.getStudentById(user.linkedId)
        : null
      : adminStudentParam
        ? await store.getStudentById(adminStudentParam)
        : null;

  if (user.role === "ADMIN" && !student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Printable marksheet"
          description="Administrator view — open a student to print their published marksheet."
        />
        <EmptyState
          icon={FileWarning}
          title="No student selected"
          description="Add ?student=<studentId> to the URL (or open a class under Classes and use its export links). Students reach this page directly from their dashboard."
        />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Printable marksheet" />
        <EmptyState
          title="No student profile linked"
          description="Your account is not linked to a student record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  if (!isExam(exam)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Printable marksheet" />
        <EmptyState
          title="Unknown exam"
          description={`"${exam}" is not one of the school's exams. Open your results page and use the print link there.`}
        />
      </div>
    );
  }

  const [settings, subjects, years, published] = await Promise.all([
    store.getSettings(),
    store.listSubjects(),
    store.listAcademicYears(),
    store.listMarkSheets({ classId: student.classId, exam, status: "published" }),
  ]);

  // Pick the term: ?year= when given, otherwise the most recently published
  // year that has this exam published for the class.
  const yearIds = [
    ...new Set(published.map((sheet) => sheet.academicYearId)),
  ].sort(
    (a, b) =>
      (published.find((s) => s.academicYearId === b)?.publishedAt ?? "").localeCompare(
        published.find((s) => s.academicYearId === a)?.publishedAt ?? "",
      ),
  );
  const yearId = yearParam && yearIds.includes(yearParam) ? yearParam : yearIds[0];

  if (!yearId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Marksheet — ${exam}`} />
        <EmptyState
          title="Results not published yet"
          description={`No ${exam} result has been published for this class. Marksheets can only be printed from published results — check back after the office publishes them.`}
        />
      </div>
    );
  }

  const termSheets = published.filter((sheet) => sheet.academicYearId === yearId);
  const result = buildStudentTermResult(termSheets, student.id, subjects, settings);
  const klass = await store.getClassById(student.classId);
  const yearLabel = years.find((y) => y.id === yearId)?.label ?? yearId;
  const issued = formatDate(new Date().toISOString());
  const vId = verificationId(student.id, exam, yearLabel);
  const initials = settings.schoolName
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  const latestPublish = termSheets.reduce(
    (max, sheet) => (sheet.publishedAt && sheet.publishedAt > max ? sheet.publishedAt : max),
    "",
  );

  if (result.subjects.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Marksheet — ${exam} ${yearLabel}`} />
        <EmptyState
          title="No marks recorded"
          description={`The ${exam} ${yearLabel} results for this class are published, but ${student.name} has no subject entries in them. Talk to the class teacher.`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/student/results"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to results
        </Link>
        <PrintButton />
      </div>

      <Card className="print-sheet mx-auto w-full max-w-3xl print:max-w-none print:border-black">
        <CardContent className="flex flex-col gap-6 p-8 print:p-0">
          {/* Institution header */}
          <div className="flex items-center gap-4 border-b-2 border-fg pb-4">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-fg text-lg font-bold tracking-wide"
            >
              {initials || "ED"}
            </span>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold uppercase tracking-wide text-fg">
                {settings.schoolName}
              </h1>
              <p className="text-sm text-muted">
                Statement of Results — {exam} Examination {yearLabel}
              </p>
            </div>
          </div>

          {/* Student details */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Student name</dt>
              <dd className="font-semibold text-fg">{student.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Roll</dt>
              <dd className="font-semibold tabular-nums text-fg">{student.roll}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Class</dt>
              <dd className="font-semibold text-fg">
                {klass ? `${klass.name} (${klass.section})` : student.classId}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Guardian</dt>
              <dd className="text-fg">{student.guardianName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Academic year</dt>
              <dd className="text-fg">{yearLabel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Issue date</dt>
              <dd className="text-fg">{issued}</dd>
            </div>
          </dl>

          {/* Subject table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-fg text-left">
                <th scope="col" className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">
                  Subject
                </th>
                <th scope="col" className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">
                  Code
                </th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                  Marks
                </th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                  Grade
                </th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((subject) => {
                const code = subjects.find((s) => s.slug === subject.subjectSlug)?.code ?? "—";
                return (
                  <tr key={subject.subjectSlug} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-medium">{subject.subjectName}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted">{code}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {subject.absent ? "Absent" : subject.marks}
                    </td>
                    <td className="px-2 py-1.5 text-right">{subject.grade}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {subject.points.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-fg">
                <td colSpan={3} className="px-2 py-2 text-right font-semibold">
                  Term GPA (5.00 scale)
                </td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">{result.gpa.toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-semibold">{result.grade}</td>
              </tr>
            </tfoot>
          </table>

          {/* Verification + footer */}
          <div className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted">
            <p>
              Verification ID:{" "}
              <span className="font-mono font-semibold text-fg">{vId}</span>{" "}
              — a deterministic demo lookup key derived from the student, exam
              and year (not an official seal).
            </p>
            {latestPublish && <p>Results published {formatDate(latestPublish)}.</p>}
            {result.failedSubjects > 0 && settings.failCapsGpa && (
              <p>
                Note: {result.failedSubjects} subject
                {result.failedSubjects > 1 ? "s" : ""} below the pass grade — school
                rule caps the term GPA at 0.00.
              </p>
            )}
            <p>Printed from EduTrack demo — sample data for a fictional school.</p>
            <div className="flex items-center justify-between pt-6">
              <span className="block w-44 border-t border-fg pt-1 text-center">
                Class teacher
              </span>
              <Badge tone="neutral" className="print:border-black">
                EduTrack
              </Badge>
              <span className="block w-44 border-t border-fg pt-1 text-center">
                Principal
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
