import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests } from "@/lib/db";
import {
  DEFAULT_GRADE_BANDS,
  type MarkSheet,
  type SchoolClass,
  type Settings,
  type Student,
} from "@/lib/db/types";
import {
  attendanceByMonth,
  classAverageGpa,
  computeAdminKpis,
  gradeDistribution,
  latestPublishedTerm,
  recommendedNextAction,
  studentGpaTrend,
  teacherAttendanceAlerts,
} from "@/lib/analytics/dashboard";

/**
 * Dashboard aggregation tests (spec 18.6-18.7): KPI counts over the seeded
 * store, grade distribution data, class GPA averages, the attendance trend,
 * the teacher alert list and every branch of the student's
 * recommended-next-action logic. Pure functions are tested on synthetic
 * rows; KPIs are tested against the real seed data.
 */

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

// ---- synthetic helpers -----------------------------------------------------------

let seq = 0;
function sheet(partial: Partial<MarkSheet> & { entries: MarkSheet["entries"] }): MarkSheet {
  seq += 1;
  return {
    id: `ms-test-${seq}`,
    exam: "First Term",
    academicYearId: "ay-2026",
    classId: "cls-x",
    subjectSlug: "bangla",
    teacherId: "tch-01",
    status: "published",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    publishedAt: "2026-04-02T08:00:00.000Z",
    ...partial,
  };
}

// ---- admin KPIs (seeded store) ----------------------------------------------------

describe("computeAdminKpis — seeded DemoStore", () => {
  it("counts students, teachers, classes, published and pending sheets", async () => {
    const store = await DemoStore.create();
    const kpis = computeAdminKpis({
      students: await store.listStudents(),
      teachers: await store.listTeachers(),
      classes: await store.listClasses(),
      sheets: await store.listMarkSheets(),
      attendanceRecords: await store.listAttendanceRecords(),
    });

    expect(kpis.totalStudents).toBe(60);
    expect(kpis.totalTeachers).toBe(6);
    expect(kpis.totalClasses).toBe(4);
    // 17 published First Term 2026 + 12 published Annual 2025 sheets.
    expect(kpis.publishedSheets).toBe(29);
    // Nine Science ICT + Nine Business Mathematics + Nine Business ICT.
    expect(kpis.pendingSubmittedSheets).toBe(3);
    // Seeded attendance exists — the average is a real number in range.
    expect(kpis.averageAttendancePercent).not.toBeNull();
    expect(kpis.averageAttendancePercent!).toBeGreaterThan(50);
    expect(kpis.averageAttendancePercent!).toBeLessThanOrEqual(100);
  });

  it("returns null attendance when nothing is recorded", () => {
    const kpis = computeAdminKpis({
      students: [],
      teachers: [],
      classes: [],
      sheets: [],
      attendanceRecords: [],
    });
    expect(kpis.averageAttendancePercent).toBeNull();
    expect(kpis.totalStudents).toBe(0);
    expect(kpis.publishedSheets).toBe(0);
  });
});

// ---- grade distribution -------------------------------------------------------------

describe("gradeDistribution", () => {
  it("counts entries per band, highest band first, with an explicit Absent bucket", () => {
    const dist = gradeDistribution(
      [
        sheet({
          entries: [
            { studentId: "s1", marks: 85, absent: false },
            { studentId: "s2", marks: 72, absent: false },
            { studentId: "s3", marks: 45, absent: false },
            { studentId: "s4", marks: null, absent: true },
          ],
        }),
        sheet({
          subjectSlug: "english",
          entries: [
            { studentId: "s1", marks: 90, absent: false },
            { studentId: "s2", marks: 32, absent: false },
          ],
        }),
      ],
      DEFAULT_GRADE_BANDS,
    );

    expect(dist.map((d) => d.grade)).toEqual([
      "A+", "A", "A-", "B", "C", "D", "F", "Absent",
    ]);
    const byGrade = new Map(dist.map((d) => [d.grade, d.count]));
    expect(byGrade.get("A+")).toBe(2);
    expect(byGrade.get("A")).toBe(1);
    expect(byGrade.get("C")).toBe(1);
    expect(byGrade.get("F")).toBe(1);
    expect(byGrade.get("Absent")).toBe(1);
    expect(dist.reduce((sum, d) => sum + d.count, 0)).toBe(6);
  });

  it("omits the Absent bucket when nobody was absent", () => {
    const dist = gradeDistribution(
      [sheet({ entries: [{ studentId: "s1", marks: 10, absent: false }] })],
      DEFAULT_GRADE_BANDS,
    );
    expect(dist.some((d) => d.grade === "Absent")).toBe(false);
  });
});

// ---- latest published term ------------------------------------------------------------

describe("latestPublishedTerm — seeded DemoStore", () => {
  it("picks the First Term 2026 (published after the Annual 2025)", async () => {
    const store = await DemoStore.create();
    const published = await store.listMarkSheets({ status: "published" });
    const term = latestPublishedTerm(published)!;
    expect(term).not.toBeNull();
    expect(term.exam).toBe("First Term");
    expect(term.academicYearId).toBe("ay-2026");
  });

  it("returns null when nothing is published", () => {
    expect(latestPublishedTerm([sheet({ status: "draft", entries: [] })])).toBeNull();
  });
});

// ---- class average GPA ------------------------------------------------------------------

describe("classAverageGpa", () => {
  const baseSettings: Settings = {
    id: "school",
    schoolName: "EduTrack Demo School",
    gradeBands: DEFAULT_GRADE_BANDS,
    failCapsGpa: true,
    attendanceWarnPercent: 75,
  };
  const mkClass = (id: string, section: SchoolClass["section"]): SchoolClass => ({
    id,
    name: "Class Nine",
    section,
    classTeacherId: "tch-01",
    academicYearId: "ay-2026",
  });
  const mkStudent = (id: string, classId: string, roll: number): Student => ({
    userId: `u-${id}`,
    id,
    name: `Student ${id}`,
    email: `${id}@x`,
    roll,
    classId,
    section: "Science",
    guardianName: "G",
    guardianPhone: "01700000000",
    admissionYear: 2026,
    status: "active",
  });

  it("averages per-student term GPAs and applies the fail cap per student", () => {
    // Two students, two subjects each: A-ish student passes both; B student
    // fails one, so with failCapsGpa the GPA is 0.00.
    const sheets = [
      sheet({
        classId: "cls-a",
        subjectSlug: "bangla",
        entries: [
          { studentId: "s1", marks: 80, absent: false },
          { studentId: "s2", marks: 50, absent: false },
        ],
      }),
      sheet({
        classId: "cls-a",
        subjectSlug: "english",
        entries: [
          { studentId: "s1", marks: 90, absent: false },
          { studentId: "s2", marks: 20, absent: false },
        ],
      }),
    ];
    const classes = [mkClass("cls-a", "Science"), mkClass("cls-b", "Business Studies")];
    const students = [mkStudent("s1", "cls-a", 1), mkStudent("s2", "cls-a", 2)];
    const rows = classAverageGpa({
      sheets,
      exam: "First Term",
      academicYearId: "ay-2026",
      settings: baseSettings,
      classes,
      students,
    });

    const clsA = rows.find((r) => r.classId === "cls-a")!;
    expect(clsA.studentsWithResults).toBe(2);
    // s1: (5.00 + 5.00)/2 = 5.00; s2 fails English -> capped 0.00. Mean = 2.50.
    expect(clsA.averageGpa).toBe(2.5);
    const clsB = rows.find((r) => r.classId === "cls-b")!;
    expect(clsB.studentsWithResults).toBe(0);
    expect(clsB.averageGpa).toBe(0);
  });

  it("ignores sheets from other exams or statuses", () => {
    const rows = classAverageGpa({
      sheets: [
        sheet({
          classId: "cls-a",
          exam: "Annual",
          entries: [{ studentId: "s1", marks: 100, absent: false }],
        }),
        sheet({
          classId: "cls-a",
          status: "submitted",
          entries: [{ studentId: "s1", marks: 100, absent: false }],
        }),
      ],
      exam: "First Term",
      academicYearId: "ay-2026",
      settings: baseSettings,
      classes: [mkClass("cls-a", "Science")],
      students: [mkStudent("s1", "cls-a", 1)],
    });
    expect(rows[0].studentsWithResults).toBe(0);
  });
});

// ---- attendance trend -------------------------------------------------------------------

describe("attendanceByMonth", () => {
  it("aggregates all entries per calendar month in order", () => {
    const rows = attendanceByMonth([
      {
        id: "att-1",
        date: "2026-04-10",
        classId: "cls-a",
        subjectSlug: "bangla",
        takenByTeacherId: "tch-01",
        entries: [
          { studentId: "s1", status: "present" },
          { studentId: "s2", status: "absent" },
        ],
      },
      {
        id: "att-2",
        date: "2026-03-02",
        classId: "cls-a",
        subjectSlug: "bangla",
        takenByTeacherId: "tch-01",
        entries: [{ studentId: "s1", status: "late" }],
      },
      {
        id: "att-3",
        date: "2026-04-11",
        classId: "cls-a",
        subjectSlug: "english",
        takenByTeacherId: "tch-01",
        entries: [{ studentId: "s1", status: "present" }],
      },
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-03", "2026-04"]);
    expect(rows[0].percent).toBe(100); // late counts as attended
    expect(rows[1].percent).toBe(66.7);
    expect(rows[1].sessions).toBe(3);
  });
});

// ---- student GPA trend --------------------------------------------------------------------

describe("studentGpaTrend — seeded DemoStore (Ten Science students)", () => {
  it("lists Annual 2025 then First Term 2026 with real GPAs", async () => {
    const store = await DemoStore.create();
    const settings = await store.getSettings();
    const subjects = await store.listSubjects();
    const published = await store.listMarkSheets({
      classId: "cls-10-science",
      status: "published",
    });
    // The demo student (stu-031) has solid marks: healthy GPA in both terms.
    const trend = studentGpaTrend(published, "stu-031", subjects, settings);
    expect(trend.map((t) => t.exam)).toEqual(["Annual", "First Term"]);
    for (const point of trend) {
      expect(point.gpa).toBeGreaterThan(3);
      expect(point.gpa).toBeLessThanOrEqual(5);
    }
  });
});

// ---- recommended next action -----------------------------------------------------------------

const actionInput = {
  latestResult: { exam: "First Term" as const, failedSubjects: 0, gpa: 4.5 },
  attendancePercent: 92,
  subjectAttendance: [{ subjectName: "Mathematics", percent: 92 }],
  unpublishedSheetCount: 0,
  warnPercent: 75,
};

describe("recommendedNextAction — branches", () => {
  it("prioritises a failed subject with a concrete message", () => {
    const action = recommendedNextAction({
      ...actionInput,
      latestResult: { exam: "First Term", failedSubjects: 2, gpa: 0 },
      attendancePercent: 40, // even this loses to the failed subjects
    });
    expect(action.tone).toBe("danger");
    expect(action.message).toContain("failed 2 subjects");
    expect(action.message).toContain("First Term");
  });

  it("warns when overall attendance is below the threshold", () => {
    const action = recommendedNextAction({
      ...actionInput,
      attendancePercent: 68,
      subjectAttendance: [],
    });
    expect(action.tone).toBe("warning");
    expect(action.message).toContain("overall attendance is 68%");
    expect(action.message).toContain("75%");
  });

  it("warns when one subject is below the threshold (overall is fine)", () => {
    const action = recommendedNextAction({
      ...actionInput,
      subjectAttendance: [
        { subjectName: "Mathematics", percent: 60 },
        { subjectName: "English", percent: 95 },
      ],
    });
    expect(action.tone).toBe("warning");
    expect(action.message).toContain("Mathematics");
    expect(action.message).toContain("60%");
  });

  it("notes unpublished result sheets when everything else is fine", () => {
    const action = recommendedNextAction({ ...actionInput, unpublishedSheetCount: 3 });
    expect(action.tone).toBe("info");
    expect(action.message).toContain("3 result sheets are not published yet");
  });

  it("says no results published when the class has none at all", () => {
    const action = recommendedNextAction({
      ...actionInput,
      latestResult: null,
      unpublishedSheetCount: 0,
      attendancePercent: null,
      subjectAttendance: [],
    });
    expect(action.tone).toBe("info");
    expect(action.message).toContain("No results have been published");
  });

  it("gives the all-clear when results and attendance are healthy", () => {
    const action = recommendedNextAction(actionInput);
    expect(action.tone).toBe("success");
    expect(action.message).toContain("keep it up");
  });
});

// ---- teacher attendance alerts ------------------------------------------------------------------

describe("teacherAttendanceAlerts", () => {
  const students: Student[] = [
    { userId: "u1", id: "s1", name: "Rezaul Karim", email: "r@x", roll: 1, classId: "cls-a", section: "Science", guardianName: "G", guardianPhone: "01700000000", admissionYear: 2026, status: "active" },
    { userId: "u2", id: "s2", name: "Nusrat Jahan", email: "n@x", roll: 2, classId: "cls-a", section: "Science", guardianName: "G", guardianPhone: "01700000000", admissionYear: 2026, status: "active" },
  ];

  function record(id: string, date: string, subjectSlug: string, statuses: Array<"present" | "absent" | "late">) {
    return {
      id,
      date,
      classId: "cls-a",
      subjectSlug,
      takenByTeacherId: "tch-01",
      entries: statuses.map((status, i) => ({ studentId: `s${i + 1}`, status })),
    };
  }

  it("flags students below the threshold with their lowest subject", () => {
    const alerts = teacherAttendanceAlerts({
      records: [
        record("att-1", "2026-04-01", "mathematics", ["present", "absent"]),
        record("att-2", "2026-04-02", "mathematics", ["present", "absent"]),
        record("att-3", "2026-04-03", "english", ["present", "absent"]),
        record("att-4", "2026-04-04", "english", ["late", "absent"]),
      ],
      students,
      subjectNames: new Map([
        ["mathematics", "Mathematics"],
        ["english", "English"],
      ]),
      warnPercent: 75,
    });

    expect(alerts.totalBelow).toBe(1);
    expect(alerts.students[0].name).toBe("Nusrat Jahan");
    expect(alerts.students[0].percent).toBe(0);
    // English: 0/2 attended; Mathematics 0/2 — first alphabetical wins the tie.
    expect(alerts.students[0].lowestSubjectName).toBe("English");
    expect(alerts.byClass).toEqual([{ classId: "cls-a", belowCount: 1 }]);
  });

  it("returns an empty list when everyone attends enough (late counts)", () => {
    const alerts = teacherAttendanceAlerts({
      records: [
        record("att-1", "2026-04-01", "mathematics", ["late", "present"]),
      ],
      students,
      subjectNames: new Map([["mathematics", "Mathematics"]]),
      warnPercent: 75,
    });
    expect(alerts.totalBelow).toBe(0);
    expect(alerts.students).toHaveLength(0);
  });
});
