import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import {
  isBelowThreshold,
  monthlyAttendance,
  subjectAttendance,
  tallyAttendance,
  studentStatuses,
} from "@/lib/attendance/analytics";
import { MonthlyAttendanceChart } from "@/components/attendance/MonthlyAttendanceChart";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";

export const metadata: Metadata = { title: "My Attendance" };
export const dynamic = "force-dynamic";

export default async function StudentAttendancePage() {
  const user = await requireRole(["STUDENT"], "/student/attendance");
  const store = await getStore();

  const student = await store.getStudentByUserId(user.id);
  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Attendance" description="Your attendance across subjects and months." />
        <EmptyState
          title="No student profile"
          description="Your account is not linked to a student record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  const [settings, subjects, records] = await Promise.all([
    store.getSettings(),
    store.listSubjects(),
    store.listAttendanceRecords({ classId: student.classId }),
  ]);

  const statuses = studentStatuses(records, student.id);
  const overall = tallyAttendance(statuses);
  const monthly = monthlyAttendance(records, student.id);
  const bySubject = subjectAttendance(records, student.id);
  const warnPercent = settings.attendanceWarnPercent;
  const below = isBelowThreshold(overall.percent, warnPercent);

  if (statuses.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Attendance" description="Your attendance across subjects and months." />
        <EmptyState
          icon={CalendarCheck}
          title="No attendance recorded yet"
          description="Your teachers' attendance records for your class will appear here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Attendance"
        description={`Roll ${student.roll} — late arrivals count as attended; absences lower the rate.`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Overall attendance
            </p>
            <p className="mt-2 text-4xl font-semibold text-fg tabular-nums">
              {overall.percent}%
            </p>
            <ProgressBar
              value={overall.percent}
              label="Overall attendance"
              className="mt-3"
            />
            <p className="mt-3 text-xs text-muted">
              {overall.attended} attended of {overall.sessions} sessions ·{" "}
              {overall.absent} absent · {overall.late} late
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyAttendanceChart
              data={monthly.map((m) => ({ label: m.label, percent: m.tally.percent }))}
              warnPercent={warnPercent}
            />
            <Table className="mt-4 border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Month</TH>
                  <TH className="w-24">Present</TH>
                  <TH className="w-20">Late</TH>
                  <TH className="w-20">Absent</TH>
                  <TH className="w-20">Rate</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthly.map((month) => (
                  <TableRow key={month.month}>
                    <TD className="font-medium">{month.label}</TD>
                    <TD className="tabular-nums">{month.tally.present}</TD>
                    <TD className="tabular-nums">{month.tally.late}</TD>
                    <TD className="tabular-nums">{month.tally.absent}</TD>
                    <TD className="tabular-nums">{month.tally.percent}%</TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {below ? (
        <Alert tone="warning" title={`Attendance below ${warnPercent}%`}>
          Your overall attendance is {overall.percent}%. The school requires at
          least {warnPercent}% to sit final exams — please improve and talk to
          your class teacher.
        </Alert>
      ) : (
        <Alert tone="success" title="Attendance healthy">
          You are at {overall.percent}%, above the {warnPercent}% requirement.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Per-subject attendance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Subject</TH>
                <TH className="w-40">Sessions</TH>
                <TH className="w-24">Absent</TH>
                <TH className="w-48">Rate</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {bySubject.length === 0 && (
                <TableEmpty colSpan={4}>No subject attendance yet.</TableEmpty>
              )}
              {bySubject.map(({ subjectSlug, tally }) => (
                <TableRow key={subjectSlug}>
                  <TD className="font-medium">
                    {subjects.find((s) => s.slug === subjectSlug)?.name ?? subjectSlug}
                  </TD>
                  <TD className="tabular-nums">
                    {tally.attended}/{tally.sessions}
                  </TD>
                  <TD className="tabular-nums">{tally.absent}</TD>
                  <TD>
                    <ProgressBar
                      value={tally.percent}
                      label={`${subjectSlug} attendance`}
                    />
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
