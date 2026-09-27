import type { Metadata } from "next";
import Link from "next/link";
import { Download, School } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarkSheetStatusBadge } from "@/components/marks/MarkSheetStatusBadge";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";
import { searchParam } from "@/lib/utils";
import { classAttendanceSummary } from "@/lib/attendance/analytics";

export const metadata: Metadata = { title: "Classes" };
export const dynamic = "force-dynamic";

/**
 * Classes overview + one class detail (roster, class teacher, sheet status).
 * Read-only by design: classes and teaching loads are managed through the
 * seeded directory — this page shows exactly what the store holds.
 */
export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"], "/admin/classes");
  const sp = await searchParams;
  const store = await getStore();

  const activeYear = await store.getActiveAcademicYear();
  const [classes, teachers, subjects, students, settings, sheets] = await Promise.all([
    store.listClasses(),
    store.listTeachers(),
    store.listSubjects(),
    store.listStudents(),
    store.getSettings(),
    store.listMarkSheets(activeYear ? { academicYearId: activeYear.id } : undefined),
  ]);

  const selectedId = searchParam(sp, "class") ?? "";
  const selected = classes.find((c) => c.id === selectedId) ?? null;

  const rows = await Promise.all(
    classes.map(async (klass) => {
      const roster = students.filter((s) => s.classId === klass.id);
      const classSheets = sheets.filter((s) => s.classId === klass.id);
      const teacher = teachers.find((t) => t.id === klass.classTeacherId);
      const offered = subjects.filter((s) => s.classes.includes(klass.id));
      const records = await store.listAttendanceRecords({ classId: klass.id });
      const attendance = classAttendanceSummary(klass.id, records, roster.map((s) => s.id), settings.attendanceWarnPercent);
      return {
        klass,
        rosterCount: roster.length,
        teacherName: teacher?.name ?? "—",
        offeredCount: offered.length,
        published: classSheets.filter((s) => s.status === "published").length,
        submitted: classSheets.filter((s) => s.status === "submitted").length,
        draft: classSheets.filter((s) => s.status === "draft").length,
        attendancePercent: attendance.overall.sessions === 0 ? null : attendance.overall.percent,
        belowThreshold: attendance.studentsBelowThreshold,
      };
    }),
  );

  const detail = selected
    ? await (async () => {
        const roster = await store.listStudentsByClass(selected.id);
        const offered = subjects.filter((s) => s.classes.includes(selected.id));
        const classSheets = sheets.filter((s) => s.classId === selected.id);
        const teacher = teachers.find((t) => t.id === selected.classTeacherId);
        // Sheet status per offered subject, for the active year (all exams).
        const subjectStatus = offered.map((subject) => {
          const sheet = classSheets.find((s) => s.subjectSlug === subject.slug);
          return { subject, sheet: sheet ?? null };
        });
        const publishedTerms = [
          ...new Set(
            classSheets
              .filter((s) => s.status === "published")
              .map((s) => `${s.exam}|${s.academicYearId}`),
          ),
        ];
        return { roster, offered, subjectStatus, teacher, publishedTerms };
      })()
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Classes"
        description={`Classes, class teachers, rosters and result-sheet status${
          activeYear ? ` — academic year ${activeYear.label}` : ""
        }.`}
      />

      <Card>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Class</TH>
                <TH className="w-44">Class teacher</TH>
                <TH className="w-20 text-right">Students</TH>
                <TH className="w-20 text-right">Subjects</TH>
                <TH className="w-24 text-right">Attendance</TH>
                <TH className="w-52">Sheets {activeYear ? `(${activeYear.label})` : ""}</TH>
                <TH className="w-24 text-right">Open</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.klass.id}>
                  <TD className="font-medium text-fg">
                    {row.klass.name} ({row.klass.section})
                  </TD>
                  <TD className="text-muted">{row.teacherName}</TD>
                  <TD className="text-right tabular-nums">{row.rosterCount}</TD>
                  <TD className="text-right tabular-nums">{row.offeredCount}</TD>
                  <TD className="text-right tabular-nums">
                    {row.attendancePercent === null ? "—" : `${row.attendancePercent}%`}
                    {row.belowThreshold > 0 && (
                      <span className="block text-xs text-warning">
                        {row.belowThreshold} below {settings.attendanceWarnPercent}%
                      </span>
                    )}
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone="success">{row.published} published</Badge>
                      <Badge tone="warning">{row.submitted} submitted</Badge>
                      <Badge tone="neutral">{row.draft} draft</Badge>
                    </span>
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/admin/classes?class=${row.klass.id}`}
                      className="inline-flex rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Details
                    </Link>
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && detail ? (
        <>
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>
                  {selected.name} ({selected.section}) — {detail.roster.length} students
                </CardTitle>
                <p className="text-sm text-muted">
                  Class teacher: {detail.teacher?.name ?? "—"}
                  {detail.teacher ? ` · ${detail.teacher.designation}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.publishedTerms.map((termKey) => {
                  const [exam, yearId] = termKey.split("|");
                  return (
                    <a
                      key={termKey}
                      href={`/api/export/results?class=${selected.id}&exam=${encodeURIComponent(exam)}&year=${yearId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      {exam} results (CSV)
                    </a>
                  );
                })}
                <a
                  href={`/api/export/attendance?class=${selected.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Attendance summary (CSV)
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="border-0">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TH className="w-16">Roll</TH>
                    <TH>Student</TH>
                    <TH>Guardian</TH>
                    <TH className="w-36">Guardian phone</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.roster.length === 0 && (
                    <TableEmpty colSpan={4}>No students enrolled in this class.</TableEmpty>
                  )}
                  {detail.roster.map((student) => (
                    <TableRow key={student.id}>
                      <TD className="tabular-nums">{student.roll}</TD>
                      <TD className="font-medium">{student.name}</TD>
                      <TD className="text-muted">{student.guardianName}</TD>
                      <TD className="tabular-nums text-muted">{student.guardianPhone}</TD>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Result sheets by subject{activeYear ? ` — ${activeYear.label}` : ""} (all exams)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="border-0">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TH>Subject</TH>
                    <TH className="w-32">Code</TH>
                    <TH className="w-32">Sheet status</TH>
                    <TH>Exam</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.subjectStatus.map(({ subject, sheet }) => (
                    <TableRow key={subject.slug}>
                      <TD className="font-medium">{subject.name}</TD>
                      <TD className="tabular-nums text-muted">{subject.code}</TD>
                      <TD>
                        {sheet ? (
                          <MarkSheetStatusBadge status={sheet.status} />
                        ) : (
                          <Badge tone="neutral">Not started</Badge>
                        )}
                      </TD>
                      <TD className="text-muted">{sheet?.exam ?? "—"}</TD>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={School}
          title="Pick a class"
          description="Open a class from the table above to see its roster, class teacher and result-sheet status."
        />
      )}
    </div>
  );
}
