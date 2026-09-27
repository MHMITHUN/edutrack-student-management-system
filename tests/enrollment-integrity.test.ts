import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests, type Store } from "@/lib/db";
import { ACADEMIC_YEAR_IDS, CLASS_IDS } from "@/lib/db/seeds/catalog";
import { rosterFor } from "@/lib/marks/workflow";
import { buildStudentTermResult } from "@/lib/marks/results";
import type { MarkSheet, Student } from "@/lib/db/types";

/**
 * Enrollment integrity: class membership is the wall between students and
 * other classes' data. The queries the student pages use are class-scoped;
 * mark sheet entries only ever contain students of that sheet's class; and
 * result assembly for one student silently ignores sheets that carry no
 * entry for them. These tests pin those invariants against the DemoStore.
 */

const TEN_SCIENCE = CLASS_IDS.tenScience;
const NINE_SCIENCE = CLASS_IDS.nineScience;
const Y2025 = ACADEMIC_YEAR_IDS.y2025;
const Y2026 = ACADEMIC_YEAR_IDS.y2026;

/** The demo student: Rakib Hasan, Class Ten Science roll 1. */
const DEMO_STUDENT_ID = "stu-031";

let store: Store;

beforeEach(async () => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
  store = await DemoStore.create();
});

describe("class-scoped queries — a student sees only their own class sheets", () => {
  it("returns only the student's own class from the query the pages use", async () => {
    const student = await store.getStudentById(DEMO_STUDENT_ID);
    expect(student?.classId).toBe(TEN_SCIENCE);

    // Exactly the call /student/results and /student make.
    const sheets = await store.listMarkSheets({
      classId: student!.classId,
      status: "published",
    });
    expect(sheets.length).toBeGreaterThan(0);
    expect(new Set(sheets.map((s) => s.classId))).toEqual(new Set([TEN_SCIENCE]));

    // The other three classes' sheets (including published ones) are absent.
    const everything = await store.listMarkSheets();
    expect(everything.length).toBeGreaterThan(sheets.length);
    for (const sheet of everything) {
      if (sheet.classId !== TEN_SCIENCE) {
        expect(sheets.some((s) => s.id === sheet.id)).toBe(false);
      }
    }
  });

  it("never leaks a draft or submitted sheet of the class to the student query", async () => {
    const classSheets = await store.listMarkSheets({ classId: TEN_SCIENCE });
    // Ten Science is the fully published demo class...
    expect(
      classSheets.every((s) => s.status === "published"),
    ).toBe(true);

    // ...while the store as a whole still holds drafts/submitted sheets.
    const all = await store.listMarkSheets();
    expect(all.some((s) => s.status === "draft")).toBe(true);
    expect(all.some((s) => s.status === "submitted")).toBe(true);
  });
});

describe("mark sheet entries stay inside their class roster", () => {
  it("contains only students of the sheet's class, for every seeded sheet", async () => {
    const students = await store.listStudents();
    const rosterByClass = new Map<string, Set<string>>();
    for (const student of students) {
      const set = rosterByClass.get(student.classId) ?? new Set<string>();
      set.add(student.id);
      rosterByClass.set(student.classId, set);
    }

    const sheets = await store.listMarkSheets();
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      const roster = rosterByClass.get(sheet.classId);
      expect(roster, `no roster for ${sheet.classId}`).toBeDefined();
      for (const entry of sheet.entries) {
        expect(
          roster!.has(entry.studentId),
          `${entry.studentId} in ${sheet.classId}/${sheet.subjectSlug} sheet but not on its roster`,
        ).toBe(true);
      }
    }
  });

  it("assigns every sheet to a teacher who actually teaches that class+subject", async () => {
    const teachers = await store.listTeachers();
    const sheets = await store.listMarkSheets();
    for (const sheet of sheets) {
      const teacher = teachers.find((t) => t.id === sheet.teacherId);
      expect(teacher, `unknown teacher ${sheet.teacherId}`).toBeDefined();
      expect(
        teacher!.classAssignments.some(
          (a) =>
            a.classId === sheet.classId && a.subjectSlug === sheet.subjectSlug,
        ),
        `${teacher!.name} teaches ${sheet.classId}/${sheet.subjectSlug} without an assignment`,
      ).toBe(true);
    }
  });
});

describe("result assembly — no rows from another class's sheets", () => {
  it("produces zero subject rows for a student fed another class's published sheets", async () => {
    const [subjects, settings] = await Promise.all([
      store.listSubjects(),
      store.getSettings(),
    ]);
    const otherClassPublished = await store.listMarkSheets({
      classId: NINE_SCIENCE,
      status: "published",
    });
    expect(otherClassPublished.length).toBeGreaterThan(0);

    const result = buildStudentTermResult(
      otherClassPublished,
      DEMO_STUDENT_ID,
      subjects,
      settings,
    );
    expect(result.subjects).toHaveLength(0);
    expect(result.gpa).toBe(0);
  });

  it("reproduces the demo student's published First Term 2026 result exactly", async () => {
    const [subjects, settings] = await Promise.all([
      store.listSubjects(),
      store.getSettings(),
    ]);
    const firstTerm = (
      await store.listMarkSheets({
        classId: TEN_SCIENCE,
        status: "published",
        exam: "First Term",
        academicYearId: Y2026,
      })
    ).slice();
    // All 7 subjects of Class Ten Science are published for this term.
    expect(firstTerm.map((s) => s.subjectSlug).sort()).toEqual([
      "bangla",
      "biology",
      "chemistry",
      "english",
      "ict",
      "mathematics",
      "physics",
    ]);

    // GPA is COMPUTED from those entries (honesty check, spec 18.5/36).
    const result = buildStudentTermResult(
      firstTerm,
      DEMO_STUDENT_ID,
      subjects,
      settings,
    );
    expect(result.subjects).toHaveLength(7);
    expect(result.gpa.toFixed(2)).toBe("4.71");
    expect(result.grade).toBe("A");
    expect(result.failedSubjects).toBe(0);
    for (const row of result.subjects) {
      const sheet = firstTerm.find(
        (s) => s.subjectSlug === row.subjectSlug,
      ) as MarkSheet;
      const entry = sheet.entries.find((e) => e.studentId === DEMO_STUDENT_ID);
      expect(entry, `no entry for ${row.subjectSlug}`).toBeDefined();
      expect(row.absent ? entry!.marks === null : row.marks === entry!.marks).toBe(
        true,
      );
    }
  });
});

describe("rosterFor — the class roll intersected with enrollments", () => {
  it("lists exactly the enrolled students of the class for the year", async () => {
    const roster = await rosterFor(store, NINE_SCIENCE, Y2026);
    expect(roster).toHaveLength(15);

    const roll: Student[] = await store.listStudentsByClass(NINE_SCIENCE);
    expect(new Set(roster)).toEqual(new Set(roll.map((s) => s.id)));

    // Enrollments are one per student per year — no duplicates, no outsiders.
    const enrollments = await store.listEnrollmentsByClass(NINE_SCIENCE, Y2026);
    expect(enrollments).toHaveLength(15);
    expect(new Set(enrollments.map((e) => e.studentId)).size).toBe(15);
    for (const enrollment of enrollments) {
      expect(roll.some((s) => s.id === enrollment.studentId)).toBe(true);
    }
  });

  it("covers the 2025 academic year for the Ten classes (Annual exam year)", async () => {
    expect(await rosterFor(store, TEN_SCIENCE, Y2025)).toHaveLength(15);
  });

  it("falls back to the full class roll when no enrollments exist for the year", async () => {
    // Nine classes have no 2025 enrollments — the documented fallback keeps
    // the roster usable while the workflow still validates against the roll.
    const roster = await rosterFor(store, NINE_SCIENCE, Y2025);
    expect(roster).toHaveLength(15);
    const roll = await store.listStudentsByClass(NINE_SCIENCE);
    expect(new Set(roster)).toEqual(new Set(roll.map((s) => s.id)));
  });
});
