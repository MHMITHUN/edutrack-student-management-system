import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests, type Store } from "@/lib/db";
import { CLASS_IDS, ACADEMIC_YEAR_IDS } from "@/lib/db/seeds/catalog";
import type { Teacher, User } from "@/lib/db/types";
import {
  publishMarkSheet,
  returnMarkSheet,
  saveMarkSheetDraft,
  submitMarkSheet,
  type MarkSheetInput,
  type MarksActor,
} from "@/lib/marks/workflow";
import { buildStudentTermResult } from "@/lib/marks/results";

/**
 * Marks workflow tests (spec 18.4): the state machine, teacher-assignment
 * enforcement, student visibility of published results only, and
 * immutability after publishing — all against the DemoStore.
 */

const NINE_SCIENCE = CLASS_IDS.nineScience;
const Y2026 = ACADEMIC_YEAR_IDS.y2026;

async function teacherActor(store: Store, email: string): Promise<{ role: "TEACHER"; user: User; teacher: Teacher }> {
  const user = await store.getUserByEmail(email);
  if (!user) throw new Error(`missing user ${email}`);
  const teacher = await store.getTeacherByUserId(user.id);
  if (!teacher) throw new Error(`missing teacher for ${email}`);
  return { role: "TEACHER", user, teacher };
}

async function adminActor(store: Store): Promise<{ role: "ADMIN"; user: User }> {
  const user = await store.getUserByEmail("admin@demo.local");
  if (!user) throw new Error("missing admin");
  return { role: "ADMIN", user };
}

/** A fresh Half-Yearly sheet input for Nine Science Bangla (teacher tch-01). */
function sheetInput(entries: MarkSheetInput["entries"]): MarkSheetInput {
  return {
    classId: NINE_SCIENCE,
    subjectSlug: "bangla",
    exam: "Half Yearly",
    academicYearId: Y2026,
    entries,
  };
}

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

describe("state machine — legal transitions", () => {
  it("walks draft -> submitted -> published and records the timestamps", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "teacher@demo.local"); // tch-01: Bangla
    const admin = await adminActor(store);

    const roster = await store.listStudentsByClass(NINE_SCIENCE);
    const entries = roster.map((s, i) => ({
      studentId: s.id,
      marks: 40 + (i % 50),
      absent: false,
    }));

    const draft = await saveMarkSheetDraft(store, teacher, sheetInput(entries));
    expect(draft.status).toBe("draft");
    expect(draft.submittedAt).toBeUndefined();

    // Drafts stay editable.
    const edited = await saveMarkSheetDraft(
      store,
      teacher,
      sheetInput(entries.map((e) => ({ ...e, marks: 50 }))),
    );
    expect(edited.id).toBe(draft.id);
    expect(edited.entries[0].marks).toBe(50);

    const submitted = await submitMarkSheet(store, teacher, sheetInput(entries));
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toBeDefined();

    const published = await publishMarkSheet(store, admin, submitted.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeDefined();
  });

  it("returns a submitted sheet to draft (admin), letting the teacher edit again", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "tanvir.ahmed@demo.local"); // tch-04: ICT
    const admin = await adminActor(store);

    const seeded = await store.findMarkSheet({
      classId: NINE_SCIENCE,
      subjectSlug: "ict",
      exam: "First Term",
      academicYearId: Y2026,
    });
    expect(seeded?.status).toBe("submitted");

    const returned = await returnMarkSheet(store, admin, seeded!.id);
    expect(returned.status).toBe("draft");
    expect(returned.submittedAt).toBeUndefined();

    const edited = await saveMarkSheetDraft(store, teacher, {
      classId: NINE_SCIENCE,
      subjectSlug: "ict",
      exam: "First Term",
      academicYearId: Y2026,
      entries: seeded!.entries,
    });
    expect(edited.id).toBe(seeded!.id);
    expect(edited.status).toBe("draft");
  });
});

describe("state machine — illegal transitions rejected", () => {
  it("blocks publishing a draft directly (must go through submission)", async () => {
    const store = await DemoStore.create();
    const admin = await adminActor(store);
    const draft = (await store.listMarkSheets({
      classId: NINE_SCIENCE,
      subjectSlug: "physics",
      status: "draft",
    }))[0];
    expect(draft).toBeDefined();
    await expect(publishMarkSheet(store, admin, draft.id)).rejects.toThrow(
      /Only a submitted mark sheet can be published/,
    );
  });

  it("blocks editing and resubmitting a submitted sheet", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "tanvir.ahmed@demo.local");
    const submitted = (await store.listMarkSheets({
      classId: NINE_SCIENCE,
      subjectSlug: "ict",
      status: "submitted",
    }))[0];

    await expect(
      saveMarkSheetDraft(store, teacher, {
        classId: NINE_SCIENCE,
        subjectSlug: "ict",
        exam: submitted.exam,
        academicYearId: submitted.academicYearId,
        entries: submitted.entries,
      }),
    ).rejects.toThrow(/submitted for review and locked/);

    await expect(submitMarkSheet(store, teacher, {
      classId: NINE_SCIENCE,
      subjectSlug: "ict",
      exam: submitted.exam,
      academicYearId: submitted.academicYearId,
      entries: submitted.entries,
    })).rejects.toThrow(/submitted for review and locked/);
  });

  it("treats published sheets as immutable (edit, submit, return all fail)", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "teacher@demo.local"); // Bangla
    const admin = await adminActor(store);

    const published = await store.findMarkSheet({
      classId: CLASS_IDS.tenScience,
      subjectSlug: "bangla",
      exam: "First Term",
      academicYearId: Y2026,
    });
    expect(published?.status).toBe("published");

    await expect(
      saveMarkSheetDraft(store, teacher, {
        classId: published!.classId,
        subjectSlug: published!.subjectSlug,
        exam: published!.exam,
        academicYearId: published!.academicYearId,
        entries: published!.entries,
      }),
    ).rejects.toThrow(/published and can no longer be changed/);

    await expect(store.submitMarkSheet(published!.id)).rejects.toThrow(
      /Only a draft mark sheet can be submitted/,
    );
    await expect(store.returnMarkSheetForRevision(published!.id)).rejects.toThrow(
      /Only a submitted mark sheet can be returned/,
    );
    await expect(publishMarkSheet(store, admin, published!.id)).rejects.toThrow(
      /Only a submitted mark sheet can be published/,
    );
  });

  it("rejects unknown exams and bad entries", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "teacher@demo.local");
    const roster = await store.listStudentsByClass(NINE_SCIENCE);
    const good = roster.map((s) => ({ studentId: s.id, marks: 60, absent: false }));

    await expect(
      saveMarkSheetDraft(store, teacher, {
        ...sheetInput(good),
        exam: "Monthly Test",
      }),
    ).rejects.toThrow(/Unknown exam/);

    await expect(
      saveMarkSheetDraft(store, teacher, sheetInput([{ studentId: "stu-999", marks: 50, absent: false }])),
    ).rejects.toThrow(/not on this class roster/);

    await expect(
      saveMarkSheetDraft(store, teacher, sheetInput([...good, { studentId: good[0].studentId, marks: 10, absent: false }])),
    ).rejects.toThrow(/Duplicate/);

    await expect(
      saveMarkSheetDraft(store, teacher, sheetInput([{ studentId: roster[0].id, marks: 150, absent: false }])),
    ).rejects.toThrow(/Invalid marks entry/);
  });

  it("requires full roster coverage before submitting (drafts may be partial)", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "teacher@demo.local");
    const roster = await store.listStudentsByClass(NINE_SCIENCE);

    const partial = roster.slice(0, 10).map((s) => ({ studentId: s.id, marks: 60, absent: false }));
    const draft = await saveMarkSheetDraft(store, teacher, sheetInput(partial));
    expect(draft.entries).toHaveLength(10);

    await expect(submitMarkSheet(store, teacher, sheetInput(partial))).rejects.toThrow(
      /Marks are missing for 5 student/,
    );
  });
});

describe("teacher-assignment enforcement", () => {
  it("refuses marks for a class+subject the teacher is not assigned to", async () => {
    const store = await DemoStore.create();
    const banglaTeacher = await teacherActor(store, "teacher@demo.local"); // tch-01
    const roster = await store.listStudentsByClass(NINE_SCIENCE);
    const entries = roster.map((s) => ({ studentId: s.id, marks: 55, absent: false }));

    // Physics in Nine Science belongs to Shamima Akter, not the Bangla teacher.
    await expect(
      saveMarkSheetDraft(store, banglaTeacher, {
        classId: NINE_SCIENCE,
        subjectSlug: "physics",
        exam: "Half Yearly",
        academicYearId: Y2026,
        entries,
      }),
    ).rejects.toThrow(/not assigned to this class and subject/);
  });

  it("refuses another teacher overwriting a colleague's sheet, even with a matching assignment", async () => {
    const store = await DemoStore.create();
    const owner = await teacherActor(store, "teacher@demo.local"); // tch-01
    const roster = await store.listStudentsByClass(NINE_SCIENCE);
    const entries = roster.map((s) => ({ studentId: s.id, marks: 65, absent: false }));
    await saveMarkSheetDraft(store, owner, sheetInput(entries));

    // Simulate a second teacher whose record (wrongly) contains the same
    // assignment — the store must still refuse to hand over the sheet.
    const other = await teacherActor(store, "shamima.akter@demo.local");
    const forged: MarksActor = {
      role: "TEACHER",
      user: other.user,
      teacher: {
        ...other.teacher,
        classAssignments: [
          ...other.teacher.classAssignments,
          { classId: NINE_SCIENCE, subjectSlug: "bangla" },
        ],
      } as Teacher,
    };
    await expect(
      saveMarkSheetDraft(store, forged, sheetInput(entries)),
    ).rejects.toThrow(/Only the teacher assigned/);
  });

  it("keeps publishing and returning admin-only", async () => {
    const store = await DemoStore.create();
    const teacher = await teacherActor(store, "tanvir.ahmed@demo.local");
    const submitted = (await store.listMarkSheets({
      classId: NINE_SCIENCE,
      subjectSlug: "ict",
      status: "submitted",
    }))[0];

    await expect(publishMarkSheet(store, teacher, submitted.id)).rejects.toThrow(
      /Only the administration can publish/,
    );
    await expect(returnMarkSheet(store, teacher, submitted.id)).rejects.toThrow(
      /Only the administration can return/,
    );
  });

  it("blocks admins from entering marks (teachers enter, admins review)", async () => {
    const store = await DemoStore.create();
    const admin = await adminActor(store);
    const roster = await store.listStudentsByClass(NINE_SCIENCE);
    await expect(
      saveMarkSheetDraft(
        store,
        admin,
        sheetInput(roster.map((s) => ({ studentId: s.id, marks: 60, absent: false }))),
      ),
    ).rejects.toThrow(/Only teachers can enter marks/);
  });
});

describe("student visibility — published results only", () => {
  it("exposes only published sheets through the student-facing query", async () => {
    const store = await DemoStore.create();
    const all = await store.listMarkSheets({ classId: NINE_SCIENCE });
    expect(all.some((s) => s.status === "draft")).toBe(true);
    expect(all.some((s) => s.status === "submitted")).toBe(true);

    const published = await store.listMarkSheets({
      classId: NINE_SCIENCE,
      status: "published",
    });
    // Seeded: Bangla, English, Mathematics published for 2026 First Term.
    expect(published.map((s) => s.subjectSlug).sort()).toEqual([
      "bangla",
      "english",
      "mathematics",
    ]);
    expect(published.every((s) => s.status === "published")).toBe(true);

    // A draft sheet for the same class must never appear.
    const draftSlugs = all.filter((s) => s.status !== "published").map((s) => s.subjectSlug);
    for (const slug of draftSlugs) {
      expect(published.some((s) => s.subjectSlug === slug)).toBe(false);
    }
  });

  it("builds a student result only from published sheets (absent shown honestly)", async () => {
    const store = await DemoStore.create();
    const settings = await store.getSettings();
    const subjects = await store.listSubjects();

    const published = await store.listMarkSheets({
      classId: NINE_SCIENCE,
      status: "published",
      exam: "First Term",
      academicYearId: Y2026,
    });
    const result = buildStudentTermResult(published, "stu-001", subjects, settings);

    expect(result.subjects).toHaveLength(3);
    // failCapsGpa is on in school settings: any fail -> exactly 0.00/F,
    // otherwise a positive average. Either way the engine must be consistent.
    if (result.failedSubjects > 0) {
      expect(result.gpa).toBe(0);
      expect(result.grade).toBe("F");
    } else {
      expect(result.gpa).toBeGreaterThan(0);
    }
    for (const subject of result.subjects) {
      // Entry data must come from the sheet: absent rows are flagged, others carry marks.
      expect(subject.absent ? subject.marks === null : typeof subject.marks === "number").toBe(true);
    }
  });

  it("includes the 2025 Annual published sheets for a Ten class student", async () => {
    const store = await DemoStore.create();
    const settings = await store.getSettings();
    const subjects = await store.listSubjects();
    const published = await store.listMarkSheets({
      classId: CLASS_IDS.tenScience,
      status: "published",
      exam: "Annual",
      academicYearId: ACADEMIC_YEAR_IDS.y2025,
    });
    expect(published).toHaveLength(7); // all subjects for 2025 Annual

    const result = buildStudentTermResult(published, "stu-031", subjects, settings);
    expect(result.subjects).toHaveLength(7);
  });
});
