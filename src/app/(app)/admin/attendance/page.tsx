import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { classAttendanceSummary } from "@/lib/attendance/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
  Badge,
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
} from "@/components/ui";

export const metadata: Metadata = { title: "Attendance Overview" };
export const dynamic = "force-dynamic";

/**
 * Admin attendance view — CLASS AGGREGATES ONLY. Individual students are
 * never listed here (spec 18.6: no public shaming); only the count of
 * students below the warning threshold is shown, so the office knows where
 * to follow up privately.
 */
export default async function AdminAttendancePage() {
  await requireRole(["ADMIN"], "/admin/attendance");
  const store = await getStore();

  const [classes, subjects, settings, allRecords] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
    store.getSettings(),
    store.listAttendanceRecords(),
  ]);

  if (allRecords.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Attendance Overview" description="Class-wise attendance aggregates." />
        <EmptyState
          icon={CalendarCheck}
          title="No attendance recorded yet"
          description="As teachers take daily attendance, class aggregates appear here."
        />
      </div>
    );
  }

  const rows = await Promise.all(
    classes.map(async (klass) => {
      const records = allRecords.filter((r) => r.classId === klass.id);
      const roster = await store.listStudentsByClass(klass.id);
      return classAttendanceSummary(
        klass.id,
        records,
        roster.map((s) => s.id),
        settings.attendanceWarnPercent,
      );
    }),
  );

  const schoolOverall = classAttendanceSummary(
    "school",
    allRecords,
    (await store.listStudents()).map((s) => s.id),
    settings.attendanceWarnPercent,
  );
  const totalBelow = rows.reduce((sum, row) => sum + row.studentsBelowThreshold, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance Overview"
        description="Aggregates per class. Individual student attendance stays private to the student and their teachers."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              School attendance rate
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {schoolOverall.overall.percent}%
            </p>
            <ProgressBar value={schoolOverall.overall.percent} label="School attendance rate" className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Sessions recorded
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {schoolOverall.sessions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Students below {settings.attendanceWarnPercent}%
            </p>
            <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
              {totalBelow}
            </p>
            <p className="mt-1 text-xs text-muted">Follow up privately with each class teacher.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class-wise summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH>Class</TH>
                <TH className="w-32">Sessions</TH>
                <TH className="w-40">Overall rate</TH>
                <TH className="w-28">Lowest subject</TH>
                <TH className="w-32">Below threshold</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const klass = classes.find((c) => c.id === row.classId);
                const lowestName = row.lowestSubject
                  ? (subjects.find((s) => s.slug === row.lowestSubject!.subjectSlug)?.name ??
                    row.lowestSubject.subjectSlug)
                  : null;
                return (
                  <TableRow key={row.classId}>
                    <TD className="font-medium">
                      {klass ? `${klass.name} (${klass.section})` : row.classId}
                    </TD>
                    <TD className="tabular-nums">{row.sessions}</TD>
                    <TD>
                      <ProgressBar value={row.overall.percent} label={`${row.classId} attendance`} />
                    </TD>
                    <TD>
                      {lowestName && row.lowestSubject ? (
                        <span className="text-sm">
                          {lowestName}{" "}
                          <span className="tabular-nums text-muted">
                            ({row.lowestSubject.percent}%)
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      {row.studentsBelowThreshold > 0 ? (
                        <Badge tone="warning">{row.studentsBelowThreshold} students</Badge>
                      ) : (
                        <Badge tone="success">None</Badge>
                      )}
                    </TD>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="p-4">
            <Alert tone="info">
              Per-subject class rates:{" "}
              {rows
                .map((row) => {
                  const klass = classes.find((c) => c.id === row.classId);
                  const label = klass ? `${klass.name} ${klass.section}` : row.classId;
                  const parts = row.subjects
                    .map(
                      (s) =>
                        `${subjects.find((x) => x.slug === s.subjectSlug)?.name ?? s.subjectSlug} ${s.tally.percent}%`,
                    )
                    .join(", ");
                  return `${label} — ${parts}`;
                })
                .join(" · ")}
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
