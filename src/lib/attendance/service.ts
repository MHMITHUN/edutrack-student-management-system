import type { Store } from "@/lib/db";
import type {
  AttendanceEntry,
  AttendanceRecord,
  Teacher,
  User,
} from "@/lib/db/types";

/**
 * Attendance-taking rules (server-side, never trusting the client):
 * - only a TEACHER can save, and only for THEIR assigned class+subject;
 * - the date must be a real calendar date (yyyy-mm-dd) and not in the future;
 * - every entry's student must be on the class roster; no duplicates.
 * The store upserts by date+class+subject, so re-saving a day replaces it.
 */

export class AttendanceError extends Error {
  constructor(
    message: string,
    public readonly kind: "forbidden" | "invalid" = "invalid",
  ) {
    super(message);
    this.name = "AttendanceError";
  }
}

export interface AttendanceActor {
  role: "TEACHER" | "ADMIN" | "STUDENT";
  user: User;
  teacher: Teacher | null;
}

export interface SaveAttendanceInput {
  date: string;
  classId: string;
  subjectSlug: string;
  entries: AttendanceEntry[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveClassAttendance(
  store: Store,
  actor: AttendanceActor,
  input: SaveAttendanceInput,
): Promise<AttendanceRecord> {
  if (actor.role !== "TEACHER" || !actor.teacher) {
    throw new AttendanceError("Only teachers can take attendance.", "forbidden");
  }
  const assigned = actor.teacher.classAssignments.some(
    (a) => a.classId === input.classId && a.subjectSlug === input.subjectSlug,
  );
  if (!assigned) {
    throw new AttendanceError(
      "You are not assigned to this class and subject.",
      "forbidden",
    );
  }
  if (!ISO_DATE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    throw new AttendanceError("Enter a valid date (yyyy-mm-dd).");
  }
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (input.date > todayIso) {
    throw new AttendanceError("Attendance cannot be recorded for a future date.");
  }

  const roster = await store.listStudentsByClass(input.classId);
  const rosterSet = new Set(roster.map((s) => s.id));
  const seen = new Set<string>();
  for (const entry of input.entries) {
    if (!rosterSet.has(entry.studentId)) {
      throw new AttendanceError(
        `Student ${entry.studentId} is not on this class roster.`,
      );
    }
    if (seen.has(entry.studentId)) {
      throw new AttendanceError(
        `Duplicate attendance entry for student ${entry.studentId}.`,
      );
    }
    seen.add(entry.studentId);
  }

  return store.upsertAttendanceRecord({
    date: input.date,
    classId: input.classId,
    subjectSlug: input.subjectSlug,
    takenByTeacherId: actor.teacher.id,
    entries: input.entries,
  });
}
