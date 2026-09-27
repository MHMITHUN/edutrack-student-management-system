import type { Store } from "@/lib/db";
import {
  ExamSchema,
  MarkEntrySchema,
  type Exam,
  type MarkEntry,
  type MarkSheet,
  type Teacher,
  type User,
} from "@/lib/db/types";

/**
 * Marks workflow (spec 18.4) — the server-side rules layer used by both the
 * server actions and the unit tests. Nothing here trusts the client:
 *
 * State machine (also enforced by the store, defense in depth):
 *   draft --(owning teacher)--> submitted --(admin)--> published
 *      ^                            |
 *      +--------(admin return)------+
 *   published is immutable.
 *
 * Assignment rule: a teacher may only enter marks for THEIR assigned
 * class+subject (teacher.classAssignments, re-checked here on every call).
 * Publishing and returning are admin-only. Students never see a sheet
 * before it is published (enforced by the store queries the pages use).
 */

export interface TeacherActor {
  role: "TEACHER";
  user: User;
  teacher: Teacher;
}

export interface AdminActor {
  role: "ADMIN";
  user: User;
}

export type MarksActor = TeacherActor | AdminActor;

export interface MarkSheetInput {
  classId: string;
  subjectSlug: string;
  exam: string;
  academicYearId: string;
  entries: MarkEntry[];
}

export class MarksWorkflowError extends Error {
  /** "forbidden" = role/assignment problem, "invalid" = bad input,
   *  "conflict" = illegal state transition. */
  constructor(
    message: string,
    public readonly kind: "forbidden" | "invalid" | "conflict" = "invalid",
  ) {
    super(message);
    this.name = "MarksWorkflowError";
  }
}

/** Roster for a class in a year: students on the class roll whose enrollment
 *  (when recorded) includes them; falls back to the full class roll. */
export async function rosterFor(
  store: Store,
  classId: string,
  academicYearId: string,
): Promise<string[]> {
  const [students, enrollments] = await Promise.all([
    store.listStudentsByClass(classId),
    store.listEnrollmentsByClass(classId, academicYearId),
  ]);
  if (enrollments.length === 0) {
    return students.map((s) => s.id);
  }
  const enrolled = new Set(enrollments.map((e) => e.studentId));
  return students.filter((s) => enrolled.has(s.id)).map((s) => s.id);
}

function assertTeacherAssignment(actor: TeacherActor, classId: string, subjectSlug: string): void {
  const assigned = actor.teacher.classAssignments.some(
    (a) => a.classId === classId && a.subjectSlug === subjectSlug,
  );
  if (!assigned) {
    throw new MarksWorkflowError(
      "You are not assigned to this class and subject.",
      "forbidden",
    );
  }
}

/** Parse + validate entries against the roster. Absent rows are normalized
 *  to marks:null; duplicates and unknown students are rejected. */
function validateEntries(input: MarkSheetInput, roster: string[]): MarkEntry[] {
  const rosterSet = new Set(roster);
  const seen = new Set<string>();
  const cleaned: MarkEntry[] = [];
  for (const entry of input.entries) {
    const parsed = MarkEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new MarksWorkflowError(
        `Invalid marks entry for student ${entry.studentId}.`,
        "invalid",
      );
    }
    if (!rosterSet.has(entry.studentId)) {
      throw new MarksWorkflowError(
        `Student ${entry.studentId} is not on this class roster.`,
        "invalid",
      );
    }
    if (seen.has(entry.studentId)) {
      throw new MarksWorkflowError(
        `Duplicate marks entry for student ${entry.studentId}.`,
        "invalid",
      );
    }
    seen.add(entry.studentId);
    if (entry.absent) {
      cleaned.push({ studentId: entry.studentId, marks: null, absent: true });
    } else {
      cleaned.push({ studentId: entry.studentId, marks: entry.marks, absent: false });
    }
  }
  return cleaned;
}

interface ResolvedInput {
  classId: string;
  subjectSlug: string;
  exam: Exam;
  academicYearId: string;
  entries: MarkEntry[];
}

async function resolveInput(
  store: Store,
  actor: TeacherActor,
  input: MarkSheetInput,
): Promise<ResolvedInput> {
  const exam = ExamSchema.safeParse(input.exam);
  if (!exam.success) {
    throw new MarksWorkflowError("Unknown exam.", "invalid");
  }
  assertTeacherAssignment(actor, input.classId, input.subjectSlug);
  const roster = await rosterFor(store, input.classId, input.academicYearId);
  if (roster.length === 0) {
    throw new MarksWorkflowError("This class has no students to mark.", "invalid");
  }
  return {
    classId: input.classId,
    subjectSlug: input.subjectSlug,
    exam: exam.data,
    academicYearId: input.academicYearId,
    entries: validateEntries(input, roster),
  };
}

/** Create or update the draft sheet for a class+subject+exam+year (teacher). */
export async function saveMarkSheetDraft(
  store: Store,
  actor: MarksActor,
  input: MarkSheetInput,
): Promise<MarkSheet> {
  if (actor.role !== "TEACHER") {
    throw new MarksWorkflowError("Only teachers can enter marks.", "forbidden");
  }
  const resolved = await resolveInput(store, actor, input);
  try {
    return await store.upsertMarkSheetDraft({
      ...resolved,
      teacherId: actor.teacher.id,
    });
  } catch (error) {
    throw new MarksWorkflowError(
      error instanceof Error ? error.message : "Could not save the mark sheet.",
      "conflict",
    );
  }
}

/** Save entries and submit for admin review (teacher). Requires a complete
 *  roster: every student needs marks or an absent flag. */
export async function submitMarkSheet(
  store: Store,
  actor: MarksActor,
  input: MarkSheetInput,
): Promise<MarkSheet> {
  if (actor.role !== "TEACHER") {
    throw new MarksWorkflowError("Only teachers can submit mark sheets.", "forbidden");
  }
  const resolved = await resolveInput(store, actor, input);
  const roster = await rosterFor(store, resolved.classId, resolved.academicYearId);
  const covered = new Set(resolved.entries.map((e) => e.studentId));
  const missing = roster.filter((id) => !covered.has(id));
  if (missing.length > 0) {
    throw new MarksWorkflowError(
      `Marks are missing for ${missing.length} student(s) — enter marks or mark them absent before submitting.`,
      "invalid",
    );
  }
  try {
    const sheet = await store.upsertMarkSheetDraft({
      ...resolved,
      teacherId: actor.teacher.id,
    });
    return await store.submitMarkSheet(sheet.id);
  } catch (error) {
    throw new MarksWorkflowError(
      error instanceof Error ? error.message : "Could not submit the mark sheet.",
      "conflict",
    );
  }
}

/** Publish a submitted sheet (admin) — results become visible to students. */
export async function publishMarkSheet(
  store: Store,
  actor: MarksActor,
  sheetId: string,
): Promise<MarkSheet> {
  if (actor.role !== "ADMIN") {
    throw new MarksWorkflowError("Only the administration can publish results.", "forbidden");
  }
  try {
    return await store.publishMarkSheet(sheetId);
  } catch (error) {
    throw new MarksWorkflowError(
      error instanceof Error ? error.message : "Could not publish the mark sheet.",
      "conflict",
    );
  }
}

/** Return a submitted sheet to its teacher for correction (admin). The
 *  reviewer's note travels in the audit log metadata, not the sheet. */
export async function returnMarkSheet(
  store: Store,
  actor: MarksActor,
  sheetId: string,
): Promise<MarkSheet> {
  if (actor.role !== "ADMIN") {
    throw new MarksWorkflowError("Only the administration can return mark sheets.", "forbidden");
  }
  try {
    return await store.returnMarkSheetForRevision(sheetId);
  } catch (error) {
    throw new MarksWorkflowError(
      error instanceof Error ? error.message : "Could not return the mark sheet.",
      "conflict",
    );
  }
}
