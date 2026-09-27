import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { DEFAULT_GRADE_BANDS } from "@/lib/db/types";

/**
 * Foundation store checks (DemoStore): base catalog seeds, demo logins and
 * school settings. Later chunks extend this with marks/attendance/notices.
 */

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

describe("DemoStore base seeds", () => {
  it("seeds 1 admin, 6 teachers and 60 students (67 users)", async () => {
    const store = await DemoStore.create();

    const users = await store.listUsers();
    expect(users).toHaveLength(67);
    expect((await store.listUsers("ADMIN"))).toHaveLength(1);
    expect((await store.listUsers("TEACHER"))).toHaveLength(6);
    expect((await store.listUsers("STUDENT"))).toHaveLength(60);

    const teachers = await store.listTeachers();
    expect(teachers).toHaveLength(6);
    const students = await store.listStudents();
    expect(students).toHaveLength(60);
  });

  it("gives every class 15 students with unique rolls", async () => {
    const store = await DemoStore.create();

    for (const classId of [
      "cls-9-science",
      "cls-9-business",
      "cls-10-science",
      "cls-10-business",
    ]) {
      const roster = await store.listStudentsByClass(classId);
      expect(roster).toHaveLength(15);
      const rolls = roster.map((s) => s.roll);
      expect(new Set(rolls).size).toBe(15);
    }
  });

  it("seeds 8 subjects and 4 classes with class teachers", async () => {
    const store = await DemoStore.create();

    const subjects = await store.listSubjects();
    expect(subjects.map((s) => s.slug).sort()).toEqual([
      "accounting",
      "bangla",
      "biology",
      "chemistry",
      "english",
      "ict",
      "mathematics",
      "physics",
    ]);

    const classes = await store.listClasses();
    expect(classes).toHaveLength(4);
    const teachers = await store.listTeachers();
    for (const klass of classes) {
      expect(teachers.some((t) => t.id === klass.classTeacherId)).toBe(true);
    }
  });

  it("has exactly one active academic year (2026)", async () => {
    const store = await DemoStore.create();

    const years = await store.listAcademicYears();
    expect(years).toHaveLength(2);
    const active = await store.getActiveAcademicYear();
    expect(active?.label).toBe("2026");
    expect(years.filter((y) => y.active)).toHaveLength(1);
  });

  it("seeds the spec 18.5 grade bands as school settings", async () => {
    const store = await DemoStore.create();

    const settings = await store.getSettings();
    expect(settings.id).toBe("school");
    expect(settings.gradeBands).toEqual(DEFAULT_GRADE_BANDS);
    expect(settings.failCapsGpa).toBe(true);
    expect(settings.attendanceWarnPercent).toBe(75);
  });
});

describe("DemoStore demo logins", () => {
  it("authenticates admin/teacher/student with Demo@12345", async () => {
    const store = await DemoStore.create();

    for (const [email, role] of [
      ["admin@demo.local", "ADMIN"],
      ["teacher@demo.local", "TEACHER"],
      ["student@demo.local", "STUDENT"],
    ] as const) {
      const user = await store.getUserByEmail(email);
      expect(user).not.toBeNull();
      expect(user!.role).toBe(role);
      expect(user!.status).toBe("active");
      expect(verifyPassword("Demo@12345", user!.passwordHash)).toBe(true);
      expect(verifyPassword("wrong-password", user!.passwordHash)).toBe(false);
    }
  });

  it("links teacher and student users to their directory records", async () => {
    const store = await DemoStore.create();

    const teacherUser = await store.getUserByEmail("teacher@demo.local");
    expect(teacherUser?.linkedId).toBe("tch-01");
    const teacher = await store.getTeacherById(teacherUser!.linkedId!);
    expect(teacher?.name).toBe("Asha Khatun");
    expect(teacher?.classAssignments.length).toBeGreaterThan(0);
    expect(await store.getTeacherByUserId(teacherUser!.id)).not.toBeNull();

    const studentUser = await store.getUserByEmail("student@demo.local");
    const student = await store.getStudentById(studentUser!.linkedId!);
    expect(student?.name).toBe("Rakib Hasan");
    expect(student?.classId).toBe("cls-10-science");
    expect(await store.getStudentByUserId(studentUser!.id)).not.toBeNull();
  });

  it("creates users with hashed passwords and rejects duplicate emails", async () => {
    const store = await DemoStore.create();

    const { hashPassword } = await import("@/lib/auth/password");
    const created = await store.createUser({
      name: "Test User",
      email: "test.user@std.demo.local",
      passwordHash: hashPassword("Secret@123"),
      role: "STUDENT",
    });
    expect(created.status).toBe("active");
    expect(await store.getUserByEmail("test.user@std.demo.local")).not.toBeNull();

    await expect(
      store.createUser({
        name: "Test User",
        email: "test.user@std.demo.local",
        passwordHash: hashPassword("Secret@123"),
        role: "STUDENT",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("disables users so they can no longer be found as active", async () => {
    const store = await DemoStore.create();

    const updated = await store.setUserStatus("usr-stu-060", "disabled");
    expect(updated?.status).toBe("disabled");
  });
});
