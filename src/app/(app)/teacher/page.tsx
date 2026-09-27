import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ClipboardList, Megaphone, TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { teacherAttendanceAlerts } from "@/lib/analytics/dashboard";
import { MarkSheetStatusBadge } from "@/components/marks/MarkSheetStatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
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
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Teacher Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Teacher dashboard: everything here comes from the teacher's OWN record and
 * the sheets/attendance/notices linked to it — the same records the server
 * enforces on every save.
 */
export default async function TeacherDashboardPage() {
  const user = await requireRole(["TEACHER"], "/teacher");
  const store = await getStore();

  const teacher = user.linkedId ? await store.getTeacherById(user.linkedId) : null;
  if (!teacher) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome, ${user.name}`} />
        <EmptyState
          icon={ClipboardList}
          title="No teacher profile linked yet"
          description="Your account is not linked to a teacher record. Ask the administrator to link it so your class assignments appear."
        />
      </div>
    );
  }

  const myClassIds = [...new Set(teacher.classAssignments.map((a) => a.classId))];

  const [classes, subjects, settings, years, mySheets, myNotices] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
    store.getSettings(),
    store.listAcademicYears(),
    store.listMarkSheets({ teacherId: teacher.id }),
    store.listNotices({ authorId: user.id }),
  ]);

  const activeYear = years.find((y) => y.active) ?? years[years.length - 1];

  // Records + roster only for MY classes (server-side scoping).
  const [classRecords, classStudents] = await Promise.all([
    Promise.all(myClassIds.map((classId) => store.listAttendanceRecords({ classId }))),
    Promise.all(myClassIds.map((classId) => store.listStudentsByClass(classId))),
  ]);
  const records = classRecords.flat();
  const students = classStudents.flat();
  const myRecords = records
    .filter((r) => r.takenByTeacherId === teacher.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const alerts = teacherAttendanceAlerts({
    records,
    students,
    subjectNames: new Map(subjects.map((s) => [s.slug, s.name])),
    warnPercent: settings.attendanceWarnPercent,
  });

  const drafts = mySheets
    .filter((s) => s.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const submitted = mySheets
    .filter((s) => s.status === "submitted")
    .sort((a, b) => b.submittedAt?.localeCompare(a.submittedAt ?? "") ?? 0);

  const classLabel = (id: string) => {
    const klass = classes.find((c) => c.id === id);
    return klass ? `${klass.name} (${klass.section})` : id;
  };
  const subjectLabel = (slug: string) => {
    const subject = subjects.find((s) => s.slug === slug);
    return subject ? `${subject.name} (${subject.code})` : slug;
  };
  const sheetExam = (sheet: { exam: string; academicYearId: string }) =>
    `${sheet.exam} ${years.find((y) => y.id === sheet.academicYearId)?.label ?? ""}`.trim();

  const pendingCount = drafts.length + submitted.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${teacher.name}`}
        description={`${teacher.classAssignments.length} teaching assignments${
          activeYear ? ` — academic year ${activeYear.label}` : ""
        }. ${teacher.designation}.`}
      />

      {pendingCount === 0 ? (
        <Alert tone="success" title="All caught up">
          No pending sheets — every one of your mark sheets is submitted or published.
        </Alert>
      ) : (
        <Alert tone={submitted.length > 0 ? "info" : "warning"} title="Pending actions">
          {drafts.length > 0 && `${drafts.length} draft${drafts.length > 1 ? "s" : ""} not submitted yet. `}
          {submitted.length > 0 &&
            `${submitted.length} sheet${submitted.length > 1 ? "s" : ""} awaiting admin review.`}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My teaching assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Class</TH>
                <TH>Subject</TH>
                <TH className="w-40">Open in</TH>
                <TH className="w-32 text-right">Marks entry</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {teacher.classAssignments.map((assignment) => {
                const sheet = mySheets.find(
                  (s) =>
                    s.classId === assignment.classId &&
                    s.subjectSlug === assignment.subjectSlug &&
                    s.academicYearId === activeYear?.id,
                );
                return (
                  <TableRow key={`${assignment.classId}-${assignment.subjectSlug}`}>
                    <TD className="font-medium text-fg">{classLabel(assignment.classId)}</TD>
                    <TD className="text-muted">{subjectLabel(assignment.subjectSlug)}</TD>
                    <TD className="text-muted">{sheet ? sheetExam(sheet) : "—"}</TD>
                    <TD className="text-right">
                      <span className="inline-flex items-center gap-2">
                        {sheet && <MarkSheetStatusBadge status={sheet.status} />}
                        <Link
                          href={`/teacher/marks?class=${assignment.classId}&subject=${assignment.subjectSlug}`}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Enter marks
                        </Link>
                      </span>
                    </TD>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Drafts not submitted</CardTitle>
            <Badge tone={drafts.length > 0 ? "warning" : "success"}>{drafts.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Class / subject</TH>
                  <TH className="w-32">Exam</TH>
                  <TH className="w-36">Saved</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {drafts.length === 0 && (
                  <TableEmpty colSpan={3}>No pending sheets — all caught up.</TableEmpty>
                )}
                {drafts.map((sheet) => (
                  <TableRow key={sheet.id}>
                    <TD>
                      <Link
                        href={`/teacher/marks?class=${sheet.classId}&subject=${sheet.subjectSlug}&exam=${encodeURIComponent(sheet.exam)}`}
                        className="font-medium text-accent underline-offset-4 hover:underline"
                      >
                        {classLabel(sheet.classId)} · {subjectLabel(sheet.subjectSlug)}
                      </Link>
                    </TD>
                    <TD className="text-muted">{sheetExam(sheet)}</TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatDate(sheet.updatedAt)}
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Submitted, awaiting admin</CardTitle>
            <Badge tone={submitted.length > 0 ? "warning" : "success"}>{submitted.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Class / subject</TH>
                  <TH className="w-32">Exam</TH>
                  <TH className="w-36">Submitted</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {submitted.length === 0 && (
                  <TableEmpty colSpan={3}>Nothing in review right now.</TableEmpty>
                )}
                {submitted.map((sheet) => (
                  <TableRow key={sheet.id}>
                    <TD className="font-medium">
                      {classLabel(sheet.classId)} · {subjectLabel(sheet.subjectSlug)}
                    </TD>
                    <TD className="text-muted">{sheetExam(sheet)}</TD>
                    <TD className="whitespace-nowrap text-muted">
                      {sheet.submittedAt ? formatDate(sheet.submittedAt) : "—"}
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Recent attendance I took</CardTitle>
            <CalendarCheck className="size-4 text-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH className="w-32">Date</TH>
                  <TH>Class / subject</TH>
                  <TH className="w-28 text-right">Present</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {myRecords.length === 0 && (
                  <TableEmpty colSpan={3}>No attendance recorded yet.</TableEmpty>
                )}
                {myRecords.map((record) => {
                  const present = record.entries.filter(
                    (e) => e.status === "present" || e.status === "late",
                  ).length;
                  return (
                    <TableRow key={record.id}>
                      <TD className="whitespace-nowrap text-muted">{formatDate(record.date)}</TD>
                      <TD className="font-medium">
                        {classLabel(record.classId)} · {subjectLabel(record.subjectSlug)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {present}/{record.entries.length}
                      </TD>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Attendance alerts — my classes</CardTitle>
            <Badge tone={alerts.totalBelow > 0 ? "danger" : "success"}>
              {alerts.totalBelow} student{alerts.totalBelow === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            {alerts.totalBelow === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <TriangleAlert className="size-4 text-success" aria-hidden="true" />
                Every student in your classes is at or above the{" "}
                {settings.attendanceWarnPercent}% attendance line.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Students below {settings.attendanceWarnPercent}% overall attendance:{" "}
                  {alerts.byClass
                    .map((c) => `${c.belowCount} in ${classLabel(c.classId)}`)
                    .join(", ")}
                  . Names are visible to you because you teach these classes.
                </p>
                <Table className="border-0">
                  <TableHead>
                    <TableRow className="hover:bg-transparent">
                      <TH>Student</TH>
                      <TH className="w-32">Class</TH>
                      <TH className="w-24 text-right">Attendance</TH>
                      <TH className="w-40">Lowest subject</TH>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {alerts.students.slice(0, 8).map((student) => (
                      <TableRow key={student.studentId}>
                        <TD className="font-medium">
                          {student.name} <span className="text-xs text-muted">#{student.roll}</span>
                        </TD>
                        <TD className="text-muted">{classLabel(student.classId)}</TD>
                        <TD className="text-right">
                          <Badge tone="danger">{student.percent}%</Badge>
                        </TD>
                        <TD className="text-muted">
                          {student.lowestSubjectName
                            ? `${student.lowestSubjectName} (${student.lowestSubjectPercent}%)`
                            : "—"}
                        </TD>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {alerts.students.length > 8 && (
                  <p className="text-xs text-muted">
                    Showing 8 of {alerts.students.length} — the full list is in the class
                    attendance export.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>My recent notices</CardTitle>
          <Link
            href="/teacher/notices"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Manage notices
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Notice</TH>
                <TH className="w-32">Audience</TH>
                <TH className="w-24">Priority</TH>
                <TH className="w-36">Published</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {myNotices.length === 0 && (
                <TableEmpty colSpan={4}>
                  You have not published any notices yet.{" "}
                  <Megaphone className="inline size-4" aria-hidden="true" />
                </TableEmpty>
              )}
              {myNotices.slice(0, 5).map((notice) => (
                <TableRow key={notice.id}>
                  <TD className="font-medium">{notice.title}</TD>
                  <TD className="text-muted">
                    {notice.audience === "class" ? classLabel(notice.classId ?? "") : notice.audience}
                  </TD>
                  <TD>
                    <Badge tone={notice.priority === "important" ? "warning" : "neutral"}>
                      {notice.priority}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDate(notice.publishedAt)}
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
