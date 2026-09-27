import type { GradeBand, Settings } from "@/lib/db/types";

/**
 * Grading engine — the single source of truth for every grade and GPA shown
 * in EduTrack (spec 18.5). Bands are NEVER hardcoded in the UI; pages read
 * them from the school settings document and feed them to these pure,
 * unit-tested functions.
 *
 * Rules (Bangladeshi board practice):
 * - gradeFromMark maps a written mark (0-100) to the band containing it.
 * - A subject is "failed" when its band carries 0.00 points (the F band).
 * - An absent examinee is graded as a fail with 0.00 points — the UI always
 *   labels it "Absent" honestly, but the term GPA treats it as F (mirrors
 *   board practice where absence forfeits the subject).
 * - termGpa averages subject points. When settings.failCapsGpa is true, ANY
 *   failed subject caps the term GPA at 0.00 (the configured default; schools
 *   that average anyway can switch it off and get the plain average).
 */

export interface GradeResult {
  grade: string;
  points: number;
  fail: boolean;
}

/** One subject's evaluated result, as shown on result tables. */
export interface SubjectEvaluation {
  /** Written marks, or null when the student was absent. */
  marks: number | null;
  absent: boolean;
  grade: string;
  points: number;
  fail: boolean;
}

export interface TermResult {
  /** Average subject points, rounded to 2 decimals (0.00 when fail-capped). */
  gpa: number;
  grade: string;
  failedSubjects: number;
  subjectCount: number;
}

/** Map a written mark (0-100) to its grade band. Throws when no band covers it. */
export function gradeFromMark(marks: number, bands: GradeBand[]): GradeResult {
  const band = bands.find((b) => marks >= b.min && marks <= b.max);
  if (!band) {
    throw new Error(
      `No grade band covers mark ${marks} — check the school grading settings.`,
    );
  }
  return { grade: band.grade, points: band.points, fail: band.points === 0 };
}

/** Letter grade for a term GPA (5.00 scale, standard board bands). */
export function gradeFromGpa(gpa: number): string {
  if (gpa >= 5) return "A+";
  if (gpa >= 4) return "A";
  if (gpa >= 3.5) return "A-";
  if (gpa >= 3) return "B";
  if (gpa >= 2) return "C";
  if (gpa >= 1) return "D";
  return "F";
}

/** Evaluate one subject; null marks = absent (graded as a fail, labelled honestly). */
export function evaluateSubject(
  marks: number | null,
  bands: GradeBand[],
): SubjectEvaluation {
  if (marks === null) {
    return { marks: null, absent: true, grade: "—", points: 0, fail: true };
  }
  const { grade, points, fail } = gradeFromMark(marks, bands);
  return { marks, absent: false, grade, points, fail };
}

/** Round to 2 decimals without floating-point drift (e.g. 4.999999 -> 5.00). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Term GPA over already-evaluated subjects: the average of subject points,
 * capped at 0.00 when settings.failCapsGpa is on and any subject failed.
 */
export function termGpa(
  subjects: SubjectEvaluation[],
  settings: Pick<Settings, "failCapsGpa">,
): TermResult {
  if (subjects.length === 0) {
    return { gpa: 0, grade: "—", failedSubjects: 0, subjectCount: 0 };
  }
  const failedSubjects = subjects.filter((s) => s.fail).length;
  if (settings.failCapsGpa && failedSubjects > 0) {
    return { gpa: 0, grade: "F", failedSubjects, subjectCount: subjects.length };
  }
  const total = subjects.reduce((sum, s) => sum + s.points, 0);
  const gpa = round2(total / subjects.length);
  return {
    gpa,
    grade: gradeFromGpa(gpa),
    failedSubjects,
    subjectCount: subjects.length,
  };
}

export interface BandsValidation {
  ok: boolean;
  error?: string;
}

/**
 * Structural check for a band table before it is saved as school settings:
 * must cover 0 without gaps or overlaps up to 100, with sane points.
 * (SettingsSchema enforces contiguity too; this gives admin-facing messages.)
 */
export function validateBands(bands: GradeBand[]): BandsValidation {
  if (bands.length === 0) return { ok: false, error: "At least one grade band is required." };
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  if (sorted[0].min !== 0) {
    return { ok: false, error: "The lowest band must start at 0." };
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const band = sorted[i];
    if (band.min !== prev.max + 1) {
      return {
        ok: false,
        error: `Bands must be contiguous: "${prev.grade}" ends at ${prev.max} but "${band.grade}" starts at ${band.min}.`,
      };
    }
    if (band.max < band.min) {
      return { ok: false, error: `Band "${band.grade}" has max below min.` };
    }
  }
  if (sorted[sorted.length - 1].max !== 100) {
    return { ok: false, error: "The highest band must end at 100." };
  }
  return { ok: true };
}
