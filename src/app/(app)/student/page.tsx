import type { Metadata } from "next";
import Link from "next/link";
import { Award, Bell, CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import {
  latestPublishedTerm,
  recommendedNextAction,
  studentGpaTrend,
} from "@/lib/analytics/dashboard";
import {
  isBelowThreshold,
  subjectAttendance,
  tallyAttendance,
  studentStatuses,
} from "@/lib/attendance/analytics";
import { buildStudentTermResult } from "@/lib/marks/results";
import { noticesVisibleTo } from "@/lib/notices/rules";
import { GpaTrendChart } from "@/components/charts/GpaTrendChart";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
  type AlertTone,
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

export const metadata: Metadata = { title: "Student Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Student dashboard. Results shown are PUBLISHED only (store-level filter),
 * attendance is the student's own record, and the recommended next action is
 * derived from those same numbers — no hardcoded advice.
 */
export default async function StudentDashboardPage() {
  const user = await requireRole(["STUDENT"], "/student");
  const store = await getStore();

  const student = user.linkedId ? await store.getStudentById(user.linkedId) : null;
  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome, ${user.name}`} />
        <EmptyState
          title="No student profile linked yet"
          description="Your account is not linked to a student record. Ask the class teacher or administrator to link it."
        />
      </div>
    );
  }

  const [klass, subjects, settings, years, classSheets, records, notices] = await Promise.all([
    store.getClassById(student.classId),
    store.listSubjects(),
    store.getSettings(),
    store.listAcademicYears(),
    store.listMarkSheets({ classId: student.classId }),
    store.listAttendanceRecords({ classId: student.classId }),
    store.listNotices(),
  ]);

  const published = classSheets.filter((s) => s.status === "published");
  const unpublishedCount = classSheets.filter((s) => s.status !== "published").length;
  const term = latestPublishedTerm(published);
  const termSheets = term
    ? published.filter(
        (s) => s.exam === term.exam && s.academicYearId === term.academicYearId,
      )
    : [];
  const result = term
    ? buildStudentTermResult(termSheets, student.id, subjects, settings)
    : null;
  const termLabel = term
    ? `${term.exam} ${years.find((y) => y.id === term.academicYearId)?.label ?? ""}`.trim()
    : "";

  const tally = tallyAttendance(studentStatuses(records, student.id));
  const subjectTallies = subjectAttendance(records, student.id).map((row) => ({
    subjectName: subjects.find((s) => s.slug === row.subjectSlug)?.name ?? row.subjectSlug,
    percent: row.tally.percent,
  }));
  const trend = studentGpaTrend(published, student.id, subjects, settings);
  const visibleNotices = noticesVisibleTo(notices, {
    role: "STUDENT",
    classIds: [student.classId],
  }).slice(0, 5);

  const nextAction = recommendedNextAction({
    latestResult: result ? { exam: term!.exam, failedSubjects: result.failedSubjects, gpa: result.gpa } : null,
    attendancePercent: tally.sessions > 0 ? tally.percent : null,
    subjectAttendance: subjectTallies,
    unpublishedSheetCount: unpublishedCount,
    warnPercent: settings.attendanceWarnPercent,
  });
  const actionTone: AlertTone =
    nextAction.tone === "danger"
      ? "danger"
      : nextAction.tone === "warning"
        ? "warning"
        : nextAction.tone === "success"
          ? "success"
          : "info";

  const attendanceWarning = tally.sessions > 0 && isBelowThreshold(tally.percent, settings.attendanceWarnPercent);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${student.name}`}
        description={
          klass
            ? `${klass.name} (${klass.section}) · Roll ${student.roll} — EduTrack Demo School.`
            : `Roll ${student.roll} — EduTrack Demo School.`
        }
      />

      <Alert tone={actionTone} title="Recommended next step">
        {nextAction.message}
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Current GPA{term ? ` — ${termLabel}` : ""}
            </p>
            {result && result.subjects.length > 0 ? (
              <>
                <p className="mt-2 text-4xl font-semibold tabular-nums text-fg">
                  {result.gpa.toFixed(2)}
                  <span className="ml-1 text-base font-normal text-muted">/ 5.00</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={result.gpa >= 3 ? "success" : result.gpa >= 2 ? "warning" : "danger"}>
                    Grade {result.grade}
                  </Badge>
                  <Badge tone="neutral">{result.subjects.length} subjects</Badge>
                  {result.failedSubjects > 0 && (
                    <Badge tone="danger">{result.failedSubjects} failed</Badge>
                  )}
                </div>
                <Link
                  href={`/student/results/${encodeURIComponent(term!.exam)}/print`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  <Award className="size-4" aria-hidden="true" />
                  Printable marksheet
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No published results yet — your GPA appears as soon as the office
                publishes a result sheet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              My attendance
            </p>
            {tally.sessions > 0 ? (
              <>
                <p className="mt-2 text-4xl font-semibold tabular-nums text-fg">
                  {tally.percent}
                  <span className="ml-1 text-base font-normal text-muted">%</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={attendanceWarning ? "danger" : "success"}>
                    {attendanceWarning
                      ? `Below ${settings.attendanceWarnPercent}%`
                      : `Above ${settings.attendanceWarnPercent}% line`}
                  </Badge>
                  <Badge tone="neutral">
                    {tally.attended}/{tally.sessions} classes
                  </Badge>
                </div>
                {attendanceWarning && (
                  <p className="mt-3 text-xs text-warning">
                    Attendance below the warning line can block exam entry — talk
                    to your class teacher.
                  </p>
                )}
                <Link
                  href="/student/attendance"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  <CalendarCheck className="size-4" aria-hidden="true" />
                  Monthly details
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No attendance recorded for your class yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent notices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {visibleNotices.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Bell className="size-4" aria-hidden="true" />
                No notices for you right now.
              </p>
            )}
            {visibleNotices.map((notice) => (
              <div key={notice.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  {notice.priority === "important" && (
                    <Badge tone="warning">Important</Badge>
                  )}
                  {notice.title}
                </span>
                <span className="text-xs text-muted">{formatDate(notice.publishedAt)}</span>
              </div>
            ))}
            <Link
              href="/student/notices"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All notices
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Subject marks{term ? ` — ${termLabel}` : ""}</CardTitle>
            <Link
              href="/student/results"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Full results
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Subject</TH>
                  <TH className="w-20">Marks</TH>
                  <TH className="w-16">Grade</TH>
                  <TH className="w-20">Points</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {(result?.subjects.length ?? 0) === 0 && (
                  <TableEmpty colSpan={4}>No published marks yet.</TableEmpty>
                )}
                {result?.subjects.map((subject) => (
                  <TableRow key={subject.subjectSlug}>
                    <TD className="font-medium">{subject.subjectName}</TD>
                    <TD>
                      {subject.absent ? (
                        <Badge tone="danger">Absent</Badge>
                      ) : (
                        <span className="tabular-nums">{subject.marks}</span>
                      )}
                    </TD>
                    <TD>{subject.grade}</TD>
                    <TD className="tabular-nums">{subject.points.toFixed(2)}</TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My GPA across exams</CardTitle>
          </CardHeader>
          <CardContent>
            <GpaTrendChart
              data={trend.map((point) => ({
                label: `${point.exam} ${years.find((y) => y.id === point.academicYearId)?.label ?? ""}`.trim(),
                gpa: point.gpa,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
