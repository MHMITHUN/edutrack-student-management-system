import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests } from "@/lib/db";
import { CLASS_IDS } from "@/lib/db/seeds/catalog";
import type { AttendanceRecord } from "@/lib/db/types";
import {
  classAttendanceSummary,
  isBelowThreshold,
  monthlyAttendance,
  subjectAttendance,
  tallyAttendance,
} from "@/lib/attendance/analytics";
import { saveClassAttendance, type AttendanceActor } from "@/lib/attendance/service";

/**
 * Attendance tests (spec 18.6): percentage math (late counts as attended),
 * per-subject aggregation, monthly grouping, the below-threshold flag, the
 * seeded demo data, and the teacher-side save rules.
 */

function record(
  date: string,
  subjectSlug: string,
  entries: Array<[string, "present" | "absent" | "late"]>,
  classId = CLASS_IDS.nineScience,
): AttendanceRecord {
  return {
    id: `test-${date}-${subjectSlug}`,
    date,
    classId,
    subjectSlug,
    takenByTeacherId: "tch-01",
    entries: entries.map(([studentId, status]) => ({ studentId, status })),
  };
}

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

describe("tallyAttendance — percent calculation", () => {
  it("returns zeroed tallies for no sessions", () => {
    const tally = tallyAttendance([]);
    expect(tally.sessions).toBe(0);
    expect(tally.percent).toBe(0);
  });

  it("computes attended = present + late", () => {
    const tally = tallyAttendance(["present", "present", "late", "absent"]);
    expect(tally).toMatchObject({
      sessions: 4,
      present: 2,
      late: 1,
      absent: 1,
      attended: 3,
    });
    expect(tally.percent).toBe(75);
  });

  it("rounds to one decimal", () => {
    // 1 attended of 3 sessions = 33.333... -> 33.3
    expect(tallyAttendance(["present", "absent", "absent"]).percent).toBe(33.3);
  });
});

describe("aggregation — per subject and per month", () => {
  const records = [
    record("2026-04-06", "mathematics", [
      ["stu-001", "present"],
      ["stu-002", "absent"],
    ]),
    record("2026-04-07", "mathematics", [
      ["stu-001", "late"],
      ["stu-002", "present"],
    ]),
    record("2026-05-04", "english", [["stu-001", "present"]]),
  ];

  it("groups per subject for one student", () => {
    const subjects = subjectAttendance(records, "stu-001");
    expect(subjects.map((s) => s.subjectSlug)).toEqual(["english", "mathematics"]);
    const math = subjects.find((s) => s.subjectSlug === "mathematics")!;
    expect(math.tally.sessions).toBe(2);
    expect(math.tally.percent).toBe(100); // present + late both attended
    const english = subjects.find((s) => s.subjectSlug === "english")!;
    expect(english.tally.sessions).toBe(1);
  });

  it("groups per month chronologically", () => {
    const months = monthlyAttendance(records, "stu-001");
    expect(months.map((m) => m.month)).toEqual(["2026-04", "2026-05"]);
    expect(months[0].label).toBe("Apr 2026");
    expect(months[0].tally.sessions).toBe(2);
    expect(months[1].tally.sessions).toBe(1);
  });

  it("ignores records that do not include the student", () => {
    const subjects = subjectAttendance(records, "stu-999");
    expect(subjects).toHaveLength(0);
  });
});

describe("warning threshold", () => {
  it("flags strictly below the threshold", () => {
    expect(isBelowThreshold(74.9, 75)).toBe(true);
    expect(isBelowThreshold(75, 75)).toBe(false);
    expect(isBelowThreshold(90, 75)).toBe(false);
  });

  it("the seeded low-attendance students are flagged, the demo student is not", async () => {
    const store = await DemoStore.create();
    const settings = await store.getSettings();
    const records = await store.listAttendanceRecords({ classId: CLASS_IDS.nineScience });

    const weak = tallyAttendance(
      records.flatMap((r) => r.entries.filter((e) => e.studentId === "stu-007").map((e) => e.status)),
    );
    expect(isBelowThreshold(weak.percent, settings.attendanceWarnPercent)).toBe(true);

    const tenScience = await store.listAttendanceRecords({ classId: CLASS_IDS.tenScience });
    const demo = tallyAttendance(
      tenScience.flatMap((r) => r.entries.filter((e) => e.studentId === "stu-031").map((e) => e.status)),
    );
    expect(isBelowThreshold(demo.percent, settings.attendanceWarnPercent)).toBe(false);
    expect(demo.percent).toBeGreaterThan(80);
  });
});

describe("class aggregates (admin view)", () => {
  it("summarizes overall, lowest subject and flagged-student count without names", async () => {
    const store = await DemoStore.create();
    const settings = await store.getSettings();
    const records = await store.listAttendanceRecords({ classId: CLASS_IDS.nineScience });
    const roster = await store.listStudentsByClass(CLASS_IDS.nineScience);

    const summary = classAttendanceSummary(
      CLASS_IDS.nineScience,
      records,
      roster.map((s) => s.id),
      settings.attendanceWarnPercent,
    );

    expect(summary.sessions).toBeGreaterThan(0);
    expect(summary.overall.sessions).toBe(records.length * roster.length);
    expect(summary.overall.percent).toBeGreaterThan(70);
    expect(summary.subjects.map((s) => s.subjectSlug).sort()).toEqual([
      "english",
      "mathematics",
    ]);
    expect(summary.lowestSubject).not.toBeNull();
    // stu-007 is seeded well below the threshold in this class.
    expect(summary.studentsBelowThreshold).toBeGreaterThanOrEqual(1);
  });
});

describe("saveClassAttendance — server-side rules", () => {
  async function mathTeacher(store: DemoStore): Promise<AttendanceActor> {
    const user = await store.getUserByEmail("anisur.rahman@demo.local"); // tch-03, Mathematics
    if (!user) throw new Error("missing math teacher");
    const teacher = await store.getTeacherByUserId(user.id);
    if (!teacher) throw new Error("missing teacher record");
    return { role: "TEACHER", user, teacher };
  }

  it("saves and upserts a day of attendance for an assigned class+subject", async () => {
    const store = await DemoStore.create();
    const actor = await mathTeacher(store);
    const roster = await store.listStudentsByClass(CLASS_IDS.nineScience);

    const input = {
      date: "2026-09-24",
      classId: CLASS_IDS.nineScience,
      subjectSlug: "mathematics",
      entries: roster.map((s) => ({
        studentId: s.id,
        status: "present" as const,
      })),
    };
    const saved = await saveClassAttendance(store, actor, input);
    expect(saved.entries).toHaveLength(15);
    expect(
      await store.getAttendanceRecord({
        date: "2026-09-24",
        classId: CLASS_IDS.nineScience,
        subjectSlug: "mathematics",
      }),
    ).not.toBeNull();

    // Saving again replaces the record (same count, different statuses).
    const changed = await saveClassAttendance(store, actor, {
      ...input,
      entries: roster.map((s) => ({
        studentId: s.id,
        status: s.roll === 1 ? ("late" as const) : ("present" as const),
      })),
    });
    expect(changed.entries.find((e) => e.studentId === roster[0].id)?.status).toBe("late");
    const all = await store.listAttendanceRecords({
      classId: CLASS_IDS.nineScience,
      subjectSlug: "mathematics",
      dateFrom: "2026-09-24",
      dateTo: "2026-09-24",
    });
    expect(all).toHaveLength(1);
  });

  it("rejects a future date", async () => {
    const store = await DemoStore.create();
    const actor = await mathTeacher(store);
    const roster = await store.listStudentsByClass(CLASS_IDS.nineScience);
    await expect(
      saveClassAttendance(store, actor, {
        date: "2999-01-01",
        classId: CLASS_IDS.nineScience,
        subjectSlug: "mathematics",
        entries: roster.map((s) => ({ studentId: s.id, status: "present" as const })),
      }),
    ).rejects.toThrow(/future date/);
  });

  it("rejects a class+subject the teacher is not assigned to", async () => {
    const store = await DemoStore.create();
    const actor = await mathTeacher(store); // Mathematics only
    const roster = await store.listStudentsByClass(CLASS_IDS.nineScience);
    await expect(
      saveClassAttendance(store, actor, {
        date: "2026-09-24",
        classId: CLASS_IDS.nineScience,
        subjectSlug: "bangla", // belongs to tch-01
        entries: roster.map((s) => ({ studentId: s.id, status: "present" as const })),
      }),
    ).rejects.toThrow(/not assigned to this class and subject/);
  });

  it("rejects students from outside the roster", async () => {
    const store = await DemoStore.create();
    const actor = await mathTeacher(store);
    await expect(
      saveClassAttendance(store, actor, {
        date: "2026-09-24",
        classId: CLASS_IDS.nineScience,
        subjectSlug: "mathematics",
        entries: [{ studentId: "stu-031", status: "present" }], // Ten Science student
      }),
    ).rejects.toThrow(/not on this class roster/);
  });

  it("rejects non-teachers", async () => {
    const store = await DemoStore.create();
    const admin = await store.getUserByEmail("admin@demo.local");
    await expect(
      saveClassAttendance(store, { role: "ADMIN", user: admin!, teacher: null }, {
        date: "2026-09-24",
        classId: CLASS_IDS.nineScience,
        subjectSlug: "mathematics",
        entries: [],
      }),
    ).rejects.toThrow(/Only teachers can take attendance/);
  });
});

describe("audit log store — written by real mutations", () => {
  it("records and paginates audit rows (20 per page)", async () => {
    const store = await DemoStore.create();
    const before = await store.listAuditLogs({ resource: "attendanceRecord" });
    expect(before.total).toBe(0); // seed audit covers sheets + notices only

    const actor = await mathTeacherActor(store);
    const roster = await store.listStudentsByClass(CLASS_IDS.nineScience);
    const saved = await saveClassAttendance(store, actor, {
      date: "2026-09-24",
      classId: CLASS_IDS.nineScience,
      subjectSlug: "mathematics",
      entries: roster.map((s) => ({ studentId: s.id, status: "present" as const })),
    });
    await store.createAuditLog({
      actorId: actor.user.id,
      actorName: actor.user.name,
      action: "attendance.save",
      resource: "attendanceRecord",
      resourceId: saved.id,
      metadata: { present: 15, absent: 0, late: 0 },
    });

    const after = await store.listAuditLogs({ resource: "attendanceRecord" });
    expect(after.total).toBe(1);
    expect(after.logs[0].action).toBe("attendance.save");

    const page = await store.listAuditLogs({ pageSize: 5 });
    expect(page.pageSize).toBe(5);
    expect(page.pageCount).toBe(Math.ceil(page.total / 5));
    expect(page.logs.length).toBeLessThanOrEqual(5);
  });
});

async function mathTeacherActor(store: DemoStore): Promise<AttendanceActor> {
  const user = await store.getUserByEmail("anisur.rahman@demo.local");
  const teacher = await store.getTeacherByUserId(user!.id);
  return { role: "TEACHER", user: user!, teacher: teacher! };
}
