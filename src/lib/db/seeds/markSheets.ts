import { ACADEMIC_YEAR_IDS, CLASS_IDS, seedSubjects } from "./catalog";
import { seedStudents, seedTeachers } from "./users";
import type {
  Enrollment,
  Exam,
  MarkEntry,
  MarkSheet,
  MarkSheetStatus,
} from "../types";

/**
 * Mark sheet + enrollment seeds (spec 18.4 workflow, demo scenario).
 *
 * Coverage (2026 First Term):
 * - Class Ten Science   : all 7 subjects PUBLISHED
 * - Class Ten Business  : all 5 subjects PUBLISHED
 * - Class Nine Science  : Bangla/English/Mathematics PUBLISHED,
 *                         ICT SUBMITTED (pending admin review),
 *                         Physics DRAFT (teacher still working on it)
 * - Class Nine Business : Bangla/English PUBLISHED,
 *                         Mathematics/ICT SUBMITTED
 * Plus the 2025 Annual exam, all published, for both Ten classes.
 *
 * Marks are generated deterministically (Fibonacci-hashed LCG) so both stores
 * and repeated seed runs show identical, realistic data: a spread from A+ to
 * F plus a few absentees. The demo student (stu-031) gets solid marks.
 */

// ---- deterministic pseudo-randomness -------------------------------------------

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic LCG in [0, 1) — same input, same sequence, every run. */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- enrollments -----------------------------------------------------------------

function subjectsForClass(classId: string): string[] {
  return seedSubjects
    .filter((s) => s.classes.includes(classId))
    .map((s) => s.slug);
}

/** One enrollment row per (student, academic year) listing that year's subjects. */
function buildEnrollmentRows(): Enrollment[] {
  const rows: Enrollment[] = [];
  for (const student of seedStudents) {
    const slugs = subjectsForClass(student.classId);
    rows.push({
      id: `enr-${student.id}-2026`,
      studentId: student.id,
      academicYearId: ACADEMIC_YEAR_IDS.y2026,
      classId: student.classId,
      subjectSlugs: slugs,
    });
    // The current Ten classes sat the 2025 Annual on the same subject list.
    if (
      student.classId === CLASS_IDS.tenScience ||
      student.classId === CLASS_IDS.tenBusiness
    ) {
      rows.push({
        id: `enr-${student.id}-2025`,
        studentId: student.id,
        academicYearId: ACADEMIC_YEAR_IDS.y2025,
        classId: student.classId,
        subjectSlugs: slugs,
      });
    }
  }
  return rows;
}

export const seedEnrollments: Enrollment[] = buildEnrollmentRows();

// ---- mark sheets -------------------------------------------------------------------

interface SheetSpec {
  classId: string;
  subjectSlug: string;
  exam: Exam;
  academicYearId: string;
  status: MarkSheetStatus;
}

function teacherIdFor(classId: string, subjectSlug: string): string {
  const teacher = seedTeachers.find((t) =>
    t.classAssignments.some(
      (a) => a.classId === classId && a.subjectSlug === subjectSlug,
    ),
  );
  if (!teacher) {
    throw new Error(`No teacher assigned for ${classId}/${subjectSlug} in seeds.`);
  }
  return teacher.id;
}

/** Timestamps for the demo scenario, staggered per sheet index. */
function sheetTimestamps(
  spec: SheetSpec,
  index: number,
): { createdAt: string; submittedAt?: string; publishedAt?: string; updatedAt: string } {
  const at = (iso: string, extraHours: number) =>
    new Date(new Date(iso).getTime() + extraHours * 3600_000).toISOString();
  if (spec.academicYearId === ACADEMIC_YEAR_IDS.y2025) {
    // 2025 Annual: marked in Dec 2025/Jan 2026, published mid-January 2026.
    return {
      createdAt: at("2026-01-06T10:00:00.000Z", index),
      submittedAt: at("2026-01-08T11:00:00.000Z", index),
      publishedAt: at("2026-01-12T09:30:00.000Z", index),
      updatedAt: at("2026-01-12T09:30:00.000Z", index),
    };
  }
  if (spec.status === "published") {
    return {
      createdAt: at("2026-04-20T09:00:00.000Z", index),
      submittedAt: at("2026-04-21T10:00:00.000Z", index),
      publishedAt: at("2026-04-25T09:00:00.000Z", index),
      updatedAt: at("2026-04-25T09:00:00.000Z", index),
    };
  }
  if (spec.status === "submitted") {
    // Fresh submissions waiting in the admin review queue.
    return {
      createdAt: at("2026-09-17T09:00:00.000Z", index),
      submittedAt: at("2026-09-19T14:30:00.000Z", index),
      updatedAt: at("2026-09-19T14:30:00.000Z", index),
    };
  }
  return {
    createdAt: at("2026-09-21T08:45:00.000Z", index),
    updatedAt: at("2026-09-22T16:10:00.000Z", index),
  };
}

/** Deterministic, realistic marks for one student in one sheet. */
function marksFor(
  studentId: string,
  spec: SheetSpec,
  roll: number,
): { marks: number | null; absent: boolean } {
  const rng = makeRng(hashSeed(`${studentId}|${spec.subjectSlug}|${spec.exam}|${spec.academicYearId}`));
  // A couple of roll positions are absent from almost every sheet (honest absences).
  if (rng() < 0.028) return { marks: null, absent: true };
  // The demo student (student@demo.local, stu-031) performs solidly.
  if (studentId === "stu-031") {
    return { marks: 76 + Math.floor(rng() * 19), absent: false }; // 76-94
  }
  // Weaker students scattered deterministically across rosters.
  if (roll === 13 || roll === 9) {
    const weak = 24 + Math.floor(rng() * 14); // 24-37: F and D territory
    return { marks: weak, absent: false };
  }
  const ability = 42 + rng() * 42; // 42-84 baseline ability
  const noise = (rng() - 0.5) * 22; // exam-day variance
  const marks = Math.max(8, Math.min(98, Math.round(ability + noise)));
  return { marks, absent: false };
}

function buildMarkSheets(): MarkSheet[] {
  const ft = ACADEMIC_YEAR_IDS.y2026;
  const specs: SheetSpec[] = [];

  const tenScienceSubjects = subjectsForClass(CLASS_IDS.tenScience);
  const tenBusinessSubjects = subjectsForClass(CLASS_IDS.tenBusiness);
  const nineScienceSubjects = subjectsForClass(CLASS_IDS.nineScience);
  const nineBusinessSubjects = subjectsForClass(CLASS_IDS.nineBusiness);

  // 2026 First Term — Ten Science: everything published.
  for (const subjectSlug of tenScienceSubjects) {
    specs.push({ classId: CLASS_IDS.tenScience, subjectSlug, exam: "First Term", academicYearId: ft, status: "published" });
  }
  // 2026 First Term — Ten Business: everything published.
  for (const subjectSlug of tenBusinessSubjects) {
    specs.push({ classId: CLASS_IDS.tenBusiness, subjectSlug, exam: "First Term", academicYearId: ft, status: "published" });
  }
  // 2026 First Term — Nine Science: 3 published, ICT submitted (pending), Physics draft.
  for (const subjectSlug of nineScienceSubjects.slice(0, 3)) {
    specs.push({ classId: CLASS_IDS.nineScience, subjectSlug, exam: "First Term", academicYearId: ft, status: "published" });
  }
  specs.push({ classId: CLASS_IDS.nineScience, subjectSlug: "ict", exam: "First Term", academicYearId: ft, status: "submitted" });
  specs.push({ classId: CLASS_IDS.nineScience, subjectSlug: "physics", exam: "First Term", academicYearId: ft, status: "draft" });
  // 2026 First Term — Nine Business: 2 published, Mathematics + ICT submitted.
  for (const subjectSlug of nineBusinessSubjects.slice(0, 2)) {
    specs.push({ classId: CLASS_IDS.nineBusiness, subjectSlug, exam: "First Term", academicYearId: ft, status: "published" });
  }
  specs.push({ classId: CLASS_IDS.nineBusiness, subjectSlug: "mathematics", exam: "First Term", academicYearId: ft, status: "submitted" });
  specs.push({ classId: CLASS_IDS.nineBusiness, subjectSlug: "ict", exam: "First Term", academicYearId: ft, status: "submitted" });
  // 2025 Annual — both Ten classes, all published.
  for (const classId of [CLASS_IDS.tenScience, CLASS_IDS.tenBusiness]) {
    for (const subjectSlug of subjectsForClass(classId)) {
      specs.push({ classId, subjectSlug, exam: "Annual", academicYearId: ACADEMIC_YEAR_IDS.y2025, status: "published" });
    }
  }

  return specs.map((spec, i) => {
    const roster = seedStudents
      .filter((s) => s.classId === spec.classId)
      .sort((a, b) => a.roll - b.roll);
    const entries: MarkEntry[] = roster.map((student) => {
      const { marks, absent } = marksFor(student.id, spec, student.roll);
      return absent
        ? { studentId: student.id, marks: null, absent: true }
        : { studentId: student.id, marks };
    });
    const stamps = sheetTimestamps(spec, i);
    const seq = String(i + 1).padStart(3, "0");
    return {
      id: `ms-${seq}`,
      exam: spec.exam,
      academicYearId: spec.academicYearId,
      classId: spec.classId,
      subjectSlug: spec.subjectSlug,
      teacherId: teacherIdFor(spec.classId, spec.subjectSlug),
      status: spec.status,
      entries,
      ...(stamps.submittedAt ? { submittedAt: stamps.submittedAt } : {}),
      ...(stamps.publishedAt ? { publishedAt: stamps.publishedAt } : {}),
      createdAt: stamps.createdAt,
      updatedAt: stamps.updatedAt,
    } satisfies MarkSheet;
  });
}

export const seedMarkSheets: MarkSheet[] = buildMarkSheets();
