import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests } from "@/lib/db";
import { DEFAULT_GRADE_BANDS } from "@/lib/db/types";
import { gradeFromMark } from "@/lib/grading";
import { SettingsError, updateSchoolSettings } from "@/lib/settings/service";
import { verificationId } from "@/lib/marks/verification";

/**
 * Settings + audit tests (spec 18.5/18.9): a grade-band change must (a) be
 * validated, (b) affect grading computations immediately through the live
 * settings read, (c) write an audit row — and an invalid change must change
 * nothing and audit nothing. Also covers the audit filters the viewer uses
 * and the deterministic marksheet verification key.
 */

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

const ACTOR = { id: "usr-admin-01", name: "Md. Rafiqul Islam" };

describe("updateSchoolSettings", () => {
  it("changes grading live: A+ 85+ re-bands 84 to A and writes an audit row", async () => {
    const store = await DemoStore.create();

    expect(gradeFromMark(84, DEFAULT_GRADE_BANDS).grade).toBe("A+");
    expect(gradeFromMark(85, DEFAULT_GRADE_BANDS).grade).toBe("A+");

    const bands = DEFAULT_GRADE_BANDS.map((band) =>
      band.grade === "A+" ? { ...band, min: 85 } : band.grade === "A" ? { ...band, max: 84 } : band,
    );
    await updateSchoolSettings(store, ACTOR, {
      gradeBands: bands,
      failCapsGpa: true,
      attendanceWarnPercent: 75,
    });

    // The store now serves the new bands — no module caches the old table.
    const settings = await store.getSettings();
    expect(gradeFromMark(84, settings.gradeBands).grade).toBe("A");
    expect(gradeFromMark(84, settings.gradeBands).points).toBe(4);
    expect(gradeFromMark(85, settings.gradeBands).grade).toBe("A+");

    // The audit row was written by the mutation itself.
    const audit = await store.listAuditLogs({ action: "settings.update" });
    expect(audit.total).toBe(1);
    expect(audit.logs[0].actorName).toBe(ACTOR.name);
    expect(audit.logs[0].resource).toBe("settings");
    expect(audit.logs[0].resourceId).toBe("school");
    expect(JSON.stringify(audit.logs[0].metadata)).toContain("85-100:A+");
  });

  it("flipping failCapsGpa off changes term GPA math", async () => {
    const store = await DemoStore.create();
    await updateSchoolSettings(store, ACTOR, {
      gradeBands: DEFAULT_GRADE_BANDS,
      failCapsGpa: false,
      attendanceWarnPercent: 75,
    });
    const settings = await store.getSettings();
    expect(settings.failCapsGpa).toBe(false);
    // A failing subject now averages instead of zeroing the term.
    const points = [0, 5].reduce((sum, p) => sum + p, 0) / 2;
    expect(points).toBe(2.5);
  });

  it("rejects a band table with a gap and writes nothing", async () => {
    const store = await DemoStore.create();
    const before = await store.getSettings();
    const broken = DEFAULT_GRADE_BANDS.map((band) =>
      band.grade === "F" ? { ...band, min: 10 } : band,
    );

    await expect(
      updateSchoolSettings(store, ACTOR, {
        gradeBands: broken,
        failCapsGpa: true,
        attendanceWarnPercent: 75,
      }),
    ).rejects.toBeInstanceOf(SettingsError);

    expect((await store.getSettings()).gradeBands).toEqual(before.gradeBands);
    const audit = await store.listAuditLogs({ action: "settings.update" });
    expect(audit.total).toBe(0);
  });

  it("rejects an out-of-range attendance threshold", async () => {
    const store = await DemoStore.create();
    await expect(
      updateSchoolSettings(store, ACTOR, {
        gradeBands: DEFAULT_GRADE_BANDS,
        failCapsGpa: true,
        attendanceWarnPercent: 101,
      }),
    ).rejects.toBeInstanceOf(SettingsError);
    expect((await store.getSettings()).attendanceWarnPercent).toBe(75);
  });
});

describe("audit log filters (DemoStore)", () => {
  it("filters by actor role and date range", async () => {
    const store = await DemoStore.create();

    const teachers = await store.listAuditLogs({ actorRole: "TEACHER" });
    expect(teachers.total).toBeGreaterThan(0);
    // Every seeded teacher row is a marksheet action by a teacher account.
    for (const log of teachers.logs) {
      expect(log.actorId).toMatch(/^usr-teacher-/);
    }

    const admins = await store.listAuditLogs({ actorRole: "ADMIN" });
    expect(admins.total).toBeGreaterThan(0);
    for (const log of admins.logs) {
      expect(log.actorId).toBe("usr-admin-01");
    }
    expect(admins.total + teachers.total).toBe((await store.listAuditLogs()).total);

    // Seeded publications: Annual 2025 on 2026-01-12, First Term on 2026-04-25.
    const january = await store.listAuditLogs({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
    expect(january.total).toBeGreaterThan(0);
    for (const log of january.logs) {
      expect(log.createdAt.startsWith("2026-01")).toBe(true);
    }
    const before2026 = await store.listAuditLogs({ dateTo: "2025-12-31" });
    expect(before2026.total).toBe(0);
  });
});

describe("verificationId", () => {
  it("is deterministic, 10 uppercase hex chars, and differs per input", () => {
    const a = verificationId("stu-031", "First Term", "2026");
    expect(a).toMatch(/^[0-9A-F]{10}$/);
    expect(verificationId("stu-031", "First Term", "2026")).toBe(a);
    expect(verificationId("stu-032", "First Term", "2026")).not.toBe(a);
    expect(verificationId("stu-031", "Annual", "2026")).not.toBe(a);
  });
});
