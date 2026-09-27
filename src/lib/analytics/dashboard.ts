import type {
  AttendanceRecord,
  AttendanceStatus,
  Exam,
  GradeBand,
  MarkSheet,
  SchoolClass,
  Settings,
  Student,
  Subject,
} from "@/lib/db/types";
import { evaluateSubject } from "@/lib/grading";
import { buildStudentTermResult } from "@/lib/marks/results";
import { monthLabel } from "@/lib/attendance/analytics";

/**
 * Dashboard aggregations (spec 18.6-18.7). Pure functions over store rows so
 * every number on the dashboards is computed from real data and unit-tested
 * here — pages only fetch rows and render what these return.
 */

// ---- admin KPIs ---------------------------------------------------------------

export interface AdminKpis {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  /** Mark sheets currently published (visible to students). */
  publishedSheets: number;
  /** Mark sheets sitting in the review queue (submitted, not yet published). */
  pendingSubmittedSheets: number;
  /** Whole-school attendance percent, or null when nothing is recorded. */
  averageAttendancePercent: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeAdminKpis(input: {
  students: Student[];
  teachers: Array<{ id: string }>;
  classes: SchoolClass[];
  sheets: MarkSheet[];
  attendanceRecords: AttendanceRecord[];
}): AdminKpis {
  return {
    totalStudents: input.students.length,
    totalTeachers: input.teachers.length,
    totalClasses: input.classes.length,
    publishedSheets: input.sheets.filter((s) => s.status === "published").length,
    pendingSubmittedSheets: input.sheets.filter((s) => s.status === "submitted").length,
    averageAttendancePercent: overallAttendancePercent(input.attendanceRecords),
  };
}

/** Attended (present + late) / all entries across the given records, 1dp. */
export function overallAttendancePercent(records: AttendanceRecord[]): number | null {
  const statuses: AttendanceStatus[] = records.flatMap((r) => r.entries.map((e) => e.status));
  if (statuses.length === 0) return null;
  const attended = statuses.filter((s) => s === "present" || s === "late").length;
  return round1((attended / statuses.length) * 100);
}

// ---- grade distribution --------------------------------------------------------

export interface GradeDistributionRow {
  grade: string;
  count: number;
}

/**
 * Grade counts over the entries of the given (published) sheets, ordered from
 * the highest band down. Absent examinees are counted in an explicit
 * "Absent" bucket — they are graded as failures, but labelled honestly.
 */
export function gradeDistribution(
  sheets: MarkSheet[],
  bands: GradeBand[],
): GradeDistributionRow[] {
  const rows: GradeDistributionRow[] = [...bands]
    .sort((a, b) => b.min - a.min)
    .map((band) => ({ grade: band.grade, count: 0 }));
  let absent = 0;
  for (const sheet of sheets) {
    for (const entry of sheet.entries) {
      const evaluation = evaluateSubject(entry.marks, bands);
      if (evaluation.absent) {
        absent += 1;
        continue;
      }
      const row = rows.find((r) => r.grade === evaluation.grade);
      if (row) row.count += 1;
    }
  }
  if (absent > 0) rows.push({ grade: "Absent", count: absent });
  return rows;
}

// ---- latest published term ------------------------------------------------------

export interface PublishedTerm {
  exam: Exam;
  academicYearId: string;
  /** Newest publishedAt across the term's sheets. */
  publishedAt: string;
}

/**
 * Group published sheets into exam+year terms and pick the most recently
 * published one — "latest published exam" for the admin dashboard and the
 * student's current-GPA card.
 */
export function latestPublishedTerm(sheets: MarkSheet[]): PublishedTerm | null {
  let best: PublishedTerm | null = null;
  for (const sheet of sheets) {
    if (sheet.status !== "published" || !sheet.publishedAt) continue;
    if (!best || sheet.publishedAt > best.publishedAt) {
      best = {
        exam: sheet.exam,
        academicYearId: sheet.academicYearId,
        publishedAt: sheet.publishedAt,
      };
    }
  }
  return best;
}

/** All distinct published exam+year terms, earliest publication first. */
export function publishedTerms(sheets: MarkSheet[]): PublishedTerm[] {
  const byKey = new Map<string, PublishedTerm>();
  for (const sheet of sheets) {
    if (sheet.status !== "published" || !sheet.publishedAt) continue;
    const key = `${sheet.exam}|${sheet.academicYearId}`;
    const current = byKey.get(key);
    if (!current || sheet.publishedAt > current.publishedAt) {
      byKey.set(key, {
        exam: sheet.exam,
        academicYearId: sheet.academicYearId,
        publishedAt: sheet.publishedAt,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

// ---- class-wise average GPA ------------------------------------------------------

export interface ClassGpaRow {
  classId: string;
  /** "Class Nine (Science)" — page supplies names; empty here when unknown. */
  label: string;
  /** Mean of the per-student term GPAs (students with at least one subject). */
  averageGpa: number;
  studentsWithResults: number;
}

/**
 * Average term GPA per class for ONE exam+year term. Only students with at
 * least one published subject entry count towards the average; the school's
 * fail-cap rule (settings) applies to each student's GPA as usual.
 */
export function classAverageGpa(input: {
  sheets: MarkSheet[];
  exam: Exam;
  academicYearId: string;
  settings: Settings;
  classes: SchoolClass[];
  students: Student[];
}): ClassGpaRow[] {
  const termSheets = input.sheets.filter(
    (s) =>
      s.status === "published" && s.exam === input.exam && s.academicYearId === input.academicYearId,
  );
  const subjects: Subject[] = []; // names not needed for GPA math
  return input.classes.map((klass) => {
    const roster = input.students.filter((s) => s.classId === klass.id);
    let gpaSum = 0;
    let counted = 0;
    for (const student of roster) {
      const result = buildStudentTermResult(termSheets, student.id, subjects, input.settings);
      if (result.subjects.length > 0) {
        gpaSum += result.gpa;
        counted += 1;
      }
    }
    return {
      classId: klass.id,
      label: `${klass.name} (${klass.section})`,
      averageGpa: counted === 0 ? 0 : round2(gpaSum / counted),
      studentsWithResults: counted,
    };
  });
}

// ---- attendance trend -------------------------------------------------------------

export interface AttendanceMonthRow {
  month: string; // yyyy-mm
  label: string; // "Apr 2026"
  percent: number;
  sessions: number;
}

/** Whole-school attendance percent per month, chronological. */
export function attendanceByMonth(records: AttendanceRecord[]): AttendanceMonthRow[] {
  const byMonth = new Map<string, AttendanceStatus[]>();
  for (const record of records) {
    const list = byMonth.get(record.date.slice(0, 7)) ?? [];
    list.push(...record.entries.map((e) => e.status));
    byMonth.set(record.date.slice(0, 7), list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, statuses]) => {
      const attended = statuses.filter((s) => s === "present" || s === "late").length;
      return {
        month,
        label: monthLabel(month),
        percent: round1((attended / statuses.length) * 100),
        sessions: statuses.length,
      };
    });
}

// ---- student dashboard -------------------------------------------------------------

export interface StudentTermGpa {
  /** exam|academicYearId — same key shape as the results page selector. */
  key: string;
  exam: Exam;
  academicYearId: string;
  gpa: number;
  publishedAt: string;
}

/**
 * The student's GPA across every published exam term, ordered by publication
 * date (the trend line on the student dashboard).
 */
export function studentGpaTrend(
  publishedSheets: MarkSheet[],
  studentId: string,
  subjects: Subject[],
  settings: Settings,
): StudentTermGpa[] {
  return publishedTerms(publishedSheets).map((term) => {
    const termSheets = publishedSheets.filter(
      (s) => s.exam === term.exam && s.academicYearId === term.academicYearId,
    );
    const result = buildStudentTermResult(termSheets, studentId, subjects, settings);
    return {
      key: `${term.exam}|${term.academicYearId}`,
      exam: term.exam,
      academicYearId: term.academicYearId,
      gpa: result.gpa,
      publishedAt: term.publishedAt,
    };
  });
}

export interface NextAction {
  tone: "danger" | "warning" | "info" | "success";
  message: string;
}

export interface RecommendedActionInput {
  /** Latest published term result for this student (null when none published). */
  latestResult: { exam: Exam; failedSubjects: number; gpa: number } | null;
  /** This student's overall attendance percent (null when nothing recorded). */
  attendancePercent: number | null;
  /** Per-subject attendance percents: [{ slug, name, percent }] (may be empty). */
  subjectAttendance: Array<{ subjectName: string; percent: number }>;
  /** Sheets for the student's class+year that are NOT yet published. */
  unpublishedSheetCount: number;
  warnPercent: number;
}

/**
 * Honest "recommended next action" for the student dashboard, in priority
 * order: a failed subject beats an attendance warning beats a pending-results
 * note beats the all-clear. Every message states a fact derived above it.
 */
export function recommendedNextAction(input: RecommendedActionInput): NextAction {
  if (input.latestResult && input.latestResult.failedSubjects > 0) {
    return {
      tone: "danger",
      message: `You failed ${input.latestResult.failedSubjects} subject${
        input.latestResult.failedSubjects > 1 ? "s" : ""
      } in the ${input.latestResult.exam} exam — meet your class teacher about an improvement plan.`,
    };
  }
  if (input.attendancePercent !== null && input.attendancePercent < input.warnPercent) {
    return {
      tone: "warning",
      message: `Your overall attendance is ${input.attendancePercent}% — below the school's ${input.warnPercent}% warning line. Talk to your class teacher.`,
    };
  }
  const weakSubject = input.subjectAttendance.find((s) => s.percent < input.warnPercent);
  if (weakSubject) {
    return {
      tone: "warning",
      message: `Attendance below ${input.warnPercent}% in ${weakSubject.subjectName} (${weakSubject.percent}%) — talk to your class teacher.`,
    };
  }
  if (input.unpublishedSheetCount > 0) {
    return {
      tone: "info",
      message: `${input.unpublishedSheetCount} result sheet${
        input.unpublishedSheetCount > 1 ? "s are" : " is"
      } not published yet — check back once the office publishes them.`,
    };
  }
  if (input.latestResult === null) {
    return {
      tone: "info",
      message: "No results have been published for your class yet — check back later.",
    };
  }
  return {
    tone: "success",
    message: `All published results are healthy and your attendance is above the ${input.warnPercent}% warning line — keep it up.`,
  };
}

// ---- teacher dashboard -------------------------------------------------------------

export interface AttendanceAlertStudent {
  studentId: string;
  name: string;
  roll: number;
  classId: string;
  percent: number;
  /** Subject with the lowest attendance (ties: first alphabetically). */
  lowestSubjectName: string | null;
  lowestSubjectPercent: number | null;
}

export interface TeacherAttendanceAlerts {
  totalBelow: number;
  /** Class-wise aggregate counts (names never leave the teacher's own classes). */
  byClass: Array<{ classId: string; belowCount: number }>;
  students: AttendanceAlertStudent[];
}

/**
 * Students in the given classes whose overall attendance is strictly below
 * the warning threshold. Records passed in should already be limited to the
 * teacher's own classes — this function only aggregates.
 */
export function teacherAttendanceAlerts(input: {
  records: AttendanceRecord[];
  students: Student[];
  subjectNames: Map<string, string>;
  warnPercent: number;
}): TeacherAttendanceAlerts {
  const alerts: AttendanceAlertStudent[] = [];
  for (const student of input.students) {
    const statusesBySubject = new Map<string, AttendanceStatus[]>();
    let total = 0;
    let attended = 0;
    for (const record of input.records) {
      for (const entry of record.entries) {
        if (entry.studentId !== student.id) continue;
        total += 1;
        if (entry.status === "present" || entry.status === "late") attended += 1;
        const list = statusesBySubject.get(record.subjectSlug) ?? [];
        list.push(entry.status);
        statusesBySubject.set(record.subjectSlug, list);
      }
    }
    if (total === 0) continue;
    const percent = round1((attended / total) * 100);
    if (percent >= input.warnPercent) continue;
    let lowest: { name: string; percent: number } | null = null;
    for (const [slug, statuses] of statusesBySubject) {
      const subjectAttended = statuses.filter((s) => s === "present" || s === "late").length;
      const subjectPercent = round1((subjectAttended / statuses.length) * 100);
      const name = input.subjectNames.get(slug) ?? slug;
      if (
        lowest === null ||
        subjectPercent < lowest.percent ||
        // ties broken alphabetically by subject name (documented behaviour)
        (subjectPercent === lowest.percent && name < lowest.name)
      ) {
        lowest = { name, percent: subjectPercent };
      }
    }
    alerts.push({
      studentId: student.id,
      name: student.name,
      roll: student.roll,
      classId: student.classId,
      percent,
      lowestSubjectName: lowest?.name ?? null,
      lowestSubjectPercent: lowest?.percent ?? null,
    });
  }
  const byClass = new Map<string, number>();
  for (const alert of alerts) {
    byClass.set(alert.classId, (byClass.get(alert.classId) ?? 0) + 1);
  }
  return {
    totalBelow: alerts.length,
    byClass: [...byClass.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([classId, belowCount]) => ({ classId, belowCount })),
    students: alerts.sort((a, b) => a.classId.localeCompare(b.classId) || a.roll - b.roll),
  };
}
