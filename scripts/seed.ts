/**
 * Seed script (npm run seed).
 *
 * With MONGODB_URI set: connects to MongoDB, ensures the same indexes the
 * app creates (mirrors MongoStore.ensureIndexes in src/lib/db/mongo.ts) and
 * writes ALL base seed collections idempotently - users (by email), teachers
 * and students and classes (by id), subjects (by slug), academic years (by
 * id) and the school settings singleton. Everything uses $setOnInsert, so
 * re-running never overwrites real changes - it only fills what is missing.
 *
 * Without MONGODB_URI: the app runs on the in-memory DemoStore, which seeds
 * itself lazily on first access - so there is nothing to persist here.
 * Exits 0 both ways.
 */

import type { Collection, Document } from "mongodb";

interface SeedReport {
  inserted: number;
  alreadyPresent: number;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log(
      "Demo mode: no MONGODB_URI. The in-app demo store seeds itself automatically - nothing to do.",
    );
    return;
  }

  const { MongoClient } = await import("mongodb");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { seedUsers, seedTeachers, seedStudents, DEMO_PASSWORD } = await import(
    "../src/lib/db/seeds/users"
  );
  const {
    seedSubjects,
    seedClasses,
    seedAcademicYears,
    seedSettings,
  } = await import("../src/lib/db/seeds/catalog");
  const { seedEnrollments, seedMarkSheets } = await import(
    "../src/lib/db/seeds/markSheets"
  );
  const { seedAttendanceRecords } = await import(
    "../src/lib/db/seeds/attendance"
  );
  const { seedNotices } = await import("../src/lib/db/seeds/notices");
  const { seedAuditLogs } = await import("../src/lib/db/seeds/audit");

  const dbName = process.env.MONGODB_DB_NAME || "edutrack_sms";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`Connected to MongoDB (database: ${dbName}).`);

    // ---- indexes (mirrors MongoStore.ensureIndexes in src/lib/db/mongo.ts;
    // MongoStore.create() creates the same ones when the app boots) --------
    const users = db.collection("users");
    const teachers = db.collection("teachers");
    const students = db.collection("students");
    const classes = db.collection("classes");
    const subjects = db.collection("subjects");
    const academicYears = db.collection("academicYears");
    const settings = db.collection("settings");
    const markSheets = db.collection("markSheets");
    const attendanceRecords = db.collection("attendanceRecords");
    const auditLogs = db.collection("auditLogs");
    const enrollments = db.collection("enrollments");
    const notices = db.collection("notices");

    await users.createIndex({ email: 1 }, { unique: true });
    await teachers.createIndex({ userId: 1 }, { unique: true });
    await students.createIndex({ classId: 1, roll: 1 }, { unique: true });
    await students.createIndex({ userId: 1 });
    await classes.createIndex({ id: 1 }, { unique: true });
    await subjects.createIndex({ slug: 1 }, { unique: true });
    await academicYears.createIndex({ id: 1 }, { unique: true });
    await markSheets.createIndex(
      { classId: 1, subjectSlug: 1, exam: 1, academicYearId: 1 },
      { unique: true },
    );
    await attendanceRecords.createIndex(
      { date: 1, classId: 1, subjectSlug: 1 },
      { unique: true },
    );
    await auditLogs.createIndex({ createdAt: -1 });
    await enrollments.createIndex({ id: 1 }, { unique: true });
    await notices.createIndex({ id: 1 }, { unique: true });
    console.log("Indexes ensured.");

    /** Insert-if-missing counter; never touches existing documents. */
    async function seedAll<T extends object>(
      collection: Collection<Document>,
      rows: T[],
      keyOf: (row: T) => Record<string, unknown>,
      label: string,
    ): Promise<SeedReport> {
      let inserted = 0;
      for (const row of rows) {
        const result = await collection.updateOne(
          keyOf(row) as Document,
          { $setOnInsert: row as Document },
          { upsert: true },
        );
        if (result.upsertedCount > 0) inserted += 1;
      }
      const report = { inserted, alreadyPresent: rows.length - inserted };
      console.log(
        `${label}: ${rows.length} seed rows -> ${report.inserted} inserted, ${report.alreadyPresent} already present (collection total: ${await collection.countDocuments()}).`,
      );
      return report;
    }

    // ---- users (password is scrypt-hashed here, never stored in seeds) ---
    await seedAll(
      users,
      seedUsers.map((seed) => ({ ...seed, passwordHash: hashPassword(DEMO_PASSWORD) })),
      (row) => ({ email: row.email }),
      "Users",
    );

    // ---- school directory --------------------------------------------------
    await seedAll(teachers, seedTeachers, (row) => ({ id: row.id }), "Teachers");
    await seedAll(students, seedStudents, (row) => ({ id: row.id }), "Students");
    await seedAll(classes, seedClasses, (row) => ({ id: row.id }), "Classes");
    await seedAll(subjects, seedSubjects, (row) => ({ slug: row.slug }), "Subjects");
    await seedAll(
      academicYears,
      seedAcademicYears,
      (row) => ({ id: row.id }),
      "Academic years",
    );
    await seedAll(settings, [seedSettings], (row) => ({ id: row.id }), "Settings");

    // ---- academic records (marks, attendance, notices, audit) ----------------
    await seedAll(enrollments, seedEnrollments, (row) => ({ id: row.id }), "Enrollments");
    await seedAll(
      markSheets,
      seedMarkSheets,
      (row) => ({
        classId: row.classId,
        subjectSlug: row.subjectSlug,
        exam: row.exam,
        academicYearId: row.academicYearId,
      }),
      "Mark sheets",
    );
    await seedAll(
      attendanceRecords,
      seedAttendanceRecords,
      (row) => ({ date: row.date, classId: row.classId, subjectSlug: row.subjectSlug }),
      "Attendance records",
    );
    await seedAll(notices, seedNotices, (row) => ({ id: row.id }), "Notices");
    await seedAll(auditLogs, seedAuditLogs, (row) => ({ id: row.id }), "Audit logs");

    console.log(
      "Seed complete. Tip: admin@demo.local / teacher@demo.local / student@demo.local, all with password Demo@12345.",
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
