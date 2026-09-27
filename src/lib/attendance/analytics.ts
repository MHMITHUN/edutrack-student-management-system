import type {
  AttendanceRecord,
  AttendanceStatus,
} from "@/lib/db/types";

/**
 * Attendance analytics (spec 18.6) — pure functions over attendance records,
 * used by the student page (own numbers), the admin page (class aggregates,
 * never individual shaming) and the unit tests.
 *
 * Definitions (kept consistent everywhere, honest on screen):
 * - attended = present + late (a late student did attend the class).
 * - attendance percent = attended / total sessions, rounded to 1 decimal.
 * - a student is flagged when their percent is strictly below the school's
 *   attendanceWarnPercent setting.
 */

export interface AttendanceTally {
  sessions: number;
  present: number;
  absent: number;
  late: number;
  attended: number;
  /** 0-100, one decimal. */
  percent: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function tallyAttendance(statuses: AttendanceStatus[]): AttendanceTally {
  const present = statuses.filter((s) => s === "present").length;
  const absent = statuses.filter((s) => s === "absent").length;
  const late = statuses.filter((s) => s === "late").length;
  const sessions = statuses.length;
  const attended = present + late;
  return {
    sessions,
    present,
    absent,
    late,
    attended,
    percent: sessions === 0 ? 0 : round1((attended / sessions) * 100),
  };
}

/** All of one student's statuses inside the given records (date order kept). */
export function studentStatuses(
  records: AttendanceRecord[],
  studentId: string,
): AttendanceStatus[] {
  return records.flatMap((record) =>
    record.entries
      .filter((entry) => entry.studentId === studentId)
      .map((entry) => entry.status),
  );
}

export interface SubjectAttendance {
  subjectSlug: string;
  tally: AttendanceTally;
}

/** Per-subject attendance for one student. */
export function subjectAttendance(
  records: AttendanceRecord[],
  studentId: string,
): SubjectAttendance[] {
  const bySubject = new Map<string, AttendanceStatus[]>();
  for (const record of records) {
    const status = record.entries.find((entry) => entry.studentId === studentId);
    if (!status) continue;
    const list = bySubject.get(record.subjectSlug) ?? [];
    list.push(status.status);
    bySubject.set(record.subjectSlug, list);
  }
  return [...bySubject.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subjectSlug, statuses]) => ({
      subjectSlug,
      tally: tallyAttendance(statuses),
    }));
}

export interface MonthlyAttendance {
  /** yyyy-mm */
  month: string;
  /** Short label, e.g. "Apr 2026". */
  label: string;
  tally: AttendanceTally;
}

/** "2026-04" -> "Apr 2026" (shared with the whole-school analytics module). */
export function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  return `${names[index] ?? month} ${year}`;
}

/** Month-by-month attendance for one student (chronological). */
export function monthlyAttendance(
  records: AttendanceRecord[],
  studentId: string,
): MonthlyAttendance[] {
  const byMonth = new Map<string, AttendanceStatus[]>();
  for (const record of records) {
    const status = record.entries.find((entry) => entry.studentId === studentId);
    if (!status) continue;
    const ym = record.date.slice(0, 7);
    const list = byMonth.get(ym) ?? [];
    list.push(status.status);
    byMonth.set(ym, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, statuses]) => ({
      month,
      label: monthLabel(month),
      tally: tallyAttendance(statuses),
    }));
}

export function isBelowThreshold(percent: number, warnPercent: number): boolean {
  return percent < warnPercent;
}

// ---- class aggregates (admin view: aggregate numbers only) ---------------------

export interface ClassAttendanceSummary {
  classId: string;
  overall: AttendanceTally;
  /** Distinct date+subject sessions recorded. */
  sessions: number;
  subjects: Array<{ subjectSlug: string; tally: AttendanceTally }>;
  /** Subject with the lowest attendance percent (ties: first alphabetically). */
  lowestSubject: { subjectSlug: string; percent: number } | null;
  /** Number of students below the warning threshold. Names stay private. */
  studentsBelowThreshold: number;
}

/** Aggregate a class's records into admin-safe summary numbers. */
export function classAttendanceSummary(
  classId: string,
  records: AttendanceRecord[],
  studentRoster: string[],
  warnPercent: number,
): ClassAttendanceSummary {
  const all: AttendanceStatus[] = [];
  const bySubject = new Map<string, AttendanceStatus[]>();
  const byStudent = new Map<string, AttendanceStatus[]>(
    studentRoster.map((id) => [id, [] as AttendanceStatus[]]),
  );

  for (const record of records) {
    for (const entry of record.entries) {
      all.push(entry.status);
      const subjectList = bySubject.get(record.subjectSlug) ?? [];
      subjectList.push(entry.status);
      bySubject.set(record.subjectSlug, subjectList);
      const studentList = byStudent.get(entry.studentId);
      if (studentList) studentList.push(entry.status);
    }
  }

  const subjects = [...bySubject.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subjectSlug, statuses]) => ({ subjectSlug, tally: tallyAttendance(statuses) }));

  const lowest = subjects.reduce<{ subjectSlug: string; percent: number } | null>(
    (acc, s) => (acc === null || s.tally.percent < acc.percent ? { subjectSlug: s.subjectSlug, percent: s.tally.percent } : acc),
    null,
  );

  const studentsBelowThreshold = [...byStudent.values()].filter((statuses) => {
    if (statuses.length === 0) return false;
    return isBelowThreshold(tallyAttendance(statuses).percent, warnPercent);
  }).length;

  const sessions = new Set(
    records.map((r) => `${r.date}|${r.subjectSlug}`),
  ).size;

  return {
    classId,
    overall: tallyAttendance(all),
    sessions,
    subjects,
    lowestSubject: lowest,
    studentsBelowThreshold,
  };
}
