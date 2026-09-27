import type { NextRequest } from "next/server";
import { apiGuard } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { csvResponse, csvTimestamp, toCsv } from "@/lib/csv";
import { isBelowThreshold, studentStatuses, tallyAttendance } from "@/lib/attendance/analytics";

export const dynamic = "force-dynamic";

/**
 * Class attendance summary CSV (teacher dashboard export; admins too).
 * Teachers may only export classes THEY teach — enforced server-side via the
 * teacher record, exactly like the attendance form.
 */
export async function GET(req: NextRequest) {
  const guard = await apiGuard(req, ["TEACHER", "ADMIN"]);
  if ("response" in guard) return guard.response;
  const { user } = guard;

  const classId = req.nextUrl.searchParams.get("class") ?? "";
  if (!classId) {
    return Response.json({ error: "Provide a class query parameter." }, { status: 400 });
  }

  const store = await getStore();
  if (user.role === "TEACHER") {
    const teacher = await store.getTeacherByUserId(user.id);
    if (!teacher || !teacher.classAssignments.some((a) => a.classId === classId)) {
      return Response.json(
        { error: "You can only export attendance for classes you teach." },
        { status: 403 },
      );
    }
  }

  const [klass, roster, records, settings] = await Promise.all([
    store.getClassById(classId),
    store.listStudentsByClass(classId),
    store.listAttendanceRecords({ classId }),
    store.getSettings(),
  ]);
  if (!klass) {
    return Response.json({ error: "Class not found." }, { status: 404 });
  }

  const rows = roster.map((student) => {
    const tally = tallyAttendance(studentStatuses(records, student.id));
    return [
      student.roll,
      student.name,
      tally.sessions,
      tally.present,
      tally.late,
      tally.absent,
      tally.attended,
      `${tally.percent}%`,
      isBelowThreshold(tally.percent, settings.attendanceWarnPercent) ? "YES" : "no",
    ];
  });

  const csv = toCsv(
    ["Roll", "Student", "Sessions", "Present", "Late", "Absent", "Attended", "Attendance %", `Below ${settings.attendanceWarnPercent}% threshold`],
    rows,
  );
  const classLabel = `${klass.name}-${klass.section}`;
  return csvResponse(`edutrack-attendance-${classLabel}-${csvTimestamp()}.csv`, csv);
}
