import type { MarkSheet, Settings, Subject } from "@/lib/db/types";
import { evaluateSubject, termGpa, type SubjectEvaluation } from "@/lib/grading";

/**
 * Student-facing result assembly. Callers MUST pass published mark sheets
 * only — the store queries used by pages filter on status="published", so a
 * student can never see draft/submitted marks regardless of this module.
 */

export interface StudentSubjectResult extends SubjectEvaluation {
  subjectSlug: string;
  subjectName: string;
}

export interface StudentTermResult {
  subjects: StudentSubjectResult[];
  gpa: number;
  grade: string;
  failedSubjects: number;
}

/** Build the subject table + term GPA for one student from the given sheets. */
export function buildStudentTermResult(
  sheets: MarkSheet[],
  studentId: string,
  subjects: Subject[],
  settings: Settings,
): StudentTermResult {
  const nameBySlug = new Map(subjects.map((s) => [s.slug, s.name]));
  const subjectResults: StudentSubjectResult[] = [];
  for (const sheet of sheets) {
    const entry = sheet.entries.find((e) => e.studentId === studentId);
    if (!entry) continue;
    const evaluation = evaluateSubject(entry.marks, settings.gradeBands);
    subjectResults.push({
      subjectSlug: sheet.subjectSlug,
      subjectName: nameBySlug.get(sheet.subjectSlug) ?? sheet.subjectSlug,
      ...evaluation,
    });
  }
  const term = termGpa(subjectResults, settings);
  return {
    subjects: subjectResults,
    gpa: term.gpa,
    grade: term.grade,
    failedSubjects: term.failedSubjects,
  };
}
