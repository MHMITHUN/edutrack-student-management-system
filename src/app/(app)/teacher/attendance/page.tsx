import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { AttendanceForm } from "@/components/attendance/AttendanceForm";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LabeledInput,
  LabeledSelect,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";
import { formatDate, searchParam, todayIsoDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["TEACHER"], "/teacher/attendance");
  const sp = await searchParams;
  const store = await getStore();

  const teacher = await store.getTeacherByUserId(user.id);
  if (!teacher) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Attendance" description="Take attendance for your assigned classes." />
        <EmptyState
          title="No teacher profile"
          description="Your account is not linked to a teacher record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  const [classes, subjects] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
  ]);

  const assignmentClassIds = [...new Set(teacher.classAssignments.map((a) => a.classId))];
  const myClasses = classes.filter((c) => assignmentClassIds.includes(c.id));
  if (myClasses.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Attendance" description="Take attendance for your assigned classes." />
        <EmptyState
          icon={CalendarCheck}
          title="No class assignments yet"
          description="You have no class and subject assigned. The administration assigns teaching loads."
        />
      </div>
    );
  }

  const requestedClass = searchParam(sp, "class");
  const selectedClassId =
    requestedClass && myClasses.some((c) => c.id === requestedClass)
      ? requestedClass
      : myClasses[0].id;
  const mySubjectsInClass = teacher.classAssignments.filter((a) => a.classId === selectedClassId);
  const subjectOptions = mySubjectsInClass
    .map((a) => subjects.find((s) => s.slug === a.subjectSlug))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const requestedSubject = searchParam(sp, "subject");
  const selectedSubjectSlug =
    requestedSubject && mySubjectsInClass.some((a) => a.subjectSlug === requestedSubject)
      ? requestedSubject
      : (subjectOptions[0]?.slug ?? "");

  const today = todayIsoDate();
  const requestedDate = searchParam(sp, "date");
  const dateIsValid = requestedDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);
  const selectedDate = dateIsValid ? requestedDate : today;
  // A future date can never be selected from the UI; clamp it server-side too.
  const effectiveDate = selectedDate > today ? today : selectedDate;

  const selectionReady = selectedClassId !== "" && selectedSubjectSlug !== "" && effectiveDate !== "";

  const roster = selectionReady ? await store.listStudentsByClass(selectedClassId) : [];
  const existing = selectionReady
    ? await store.getAttendanceRecord({
        date: effectiveDate,
        classId: selectedClassId,
        subjectSlug: selectedSubjectSlug,
      })
    : null;
  const statusByStudent = new Map(existing?.entries.map((e) => [e.studentId, e.status]) ?? []);

  // Recent history for the same class+subject (honest feedback loop).
  const history = selectionReady
    ? (await store.listAttendanceRecords({ classId: selectedClassId, subjectSlug: selectedSubjectSlug }))
        .filter((r) => r.date <= today)
        .reverse()
        .slice(0, 8)
    : [];

  const classLabel = (() => {
    const klass = classes.find((c) => c.id === selectedClassId);
    return klass ? `${klass.name} (${klass.section})` : selectedClassId;
  })();
  const subjectName = subjects.find((s) => s.slug === selectedSubjectSlug)?.name ?? selectedSubjectSlug;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Pick a class, subject and date. Defaults to today; future dates are not allowed."
      />

      <form method="get" action="/teacher/attendance">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="ta-class"
              label="Class"
              name="class"
              defaultValue={selectedClassId}
              className="min-w-44 flex-1"
              options={myClasses.map((klass) => ({
                value: klass.id,
                label: `${klass.name} (${klass.section})`,
              }))}
            />
            <LabeledSelect
              id="ta-subject"
              label="Subject"
              name="subject"
              defaultValue={selectedSubjectSlug}
              className="min-w-44 flex-1"
              hint="Only the subjects you teach in the selected class are listed."
              options={subjectOptions.map((subject) => ({
                value: subject.slug,
                label: subject.name,
              }))}
            />
            <LabeledInput
              id="ta-date"
              label="Date"
              name="date"
              type="date"
              defaultValue={effectiveDate}
              max={today}
              className="min-w-40 flex-1"
            />
            <div>
              <Button type="submit">Load Roster</Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {selectionReady && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>
                {classLabel} · {subjectName} · {formatDate(effectiveDate)}
              </CardTitle>
              <p className="text-sm text-muted">
                {existing
                  ? "Attendance already recorded for this day — saving replaces it."
                  : "No record for this day yet."}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <AttendanceForm
              classId={selectedClassId}
              subjectSlug={selectedSubjectSlug}
              date={effectiveDate}
              rows={roster.map((student) => ({
                studentId: student.id,
                roll: student.roll,
                name: student.name,
                status: statusByStudent.get(student.id) ?? "present",
              }))}
            />
          </CardContent>
        </Card>
      )}

      {selectionReady && (
        <Card>
          <CardHeader>
            <CardTitle>Recent days — {subjectName}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Date</TH>
                  <TH className="w-28">Present</TH>
                  <TH className="w-24">Late</TH>
                  <TH className="w-24">Absent</TH>
                  <TH className="w-24">Rate</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.length === 0 && (
                  <TableEmpty colSpan={5}>No records for this class and subject yet.</TableEmpty>
                )}
                {history.map((record) => {
                  const present = record.entries.filter((e) => e.status === "present").length;
                  const late = record.entries.filter((e) => e.status === "late").length;
                  const absent = record.entries.filter((e) => e.status === "absent").length;
                  const rate =
                    record.entries.length === 0
                      ? 0
                      : Math.round(((present + late) / record.entries.length) * 100);
                  return (
                    <TableRow key={record.id}>
                      <TD className="font-medium">{formatDate(record.date)}</TD>
                      <TD className="tabular-nums">{present}</TD>
                      <TD className="tabular-nums">{late}</TD>
                      <TD className="tabular-nums">{absent}</TD>
                      <TD className="tabular-nums">{rate}%</TD>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
