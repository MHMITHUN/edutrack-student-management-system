import { randomUUID } from "node:crypto";
import { MongoClient, type Collection, type Document } from "mongodb";
import type { ZodType } from "zod";
import type {
  Role,
  User,
  UserStatus,
  Teacher,
  Student,
  SchoolClass,
  Subject,
  AcademicYear,
  Settings,
  Enrollment,
  Exam,
  MarkSheet,
  AttendanceRecord,
  Notice,
  AuditLog,
} from "./types";
import {
  UserSchema,
  TeacherSchema,
  StudentSchema,
  ClassSchema,
  SubjectSchema,
  AcademicYearSchema,
  SettingsSchema,
  EnrollmentSchema,
  MarkSheetSchema,
  AttendanceRecordSchema,
  NoticeSchema,
  AuditLogSchema,
} from "./types";
import { seedSettings } from "./seeds/catalog";
import type {
  Store,
  CreateUserInput,
  UpdateUserInput,
  UpsertMarkSheetInput,
  MarkSheetFilter,
  UpsertAttendanceInput,
  AttendanceFilter,
  CreateNoticeInput,
  NoticeFilter,
  CreateAuditLogInput,
  AuditLogFilter,
  AuditLogPage,
} from "./index";

/**
 * MongoDB-backed store (mongodb driver), used when MONGODB_URI is set.
 * Every document is zod-parsed at the boundary so pages get typed, trusted
 * objects. Base catalog data is seeded with npm run seed (scripts/seed.ts).
 */

const globalForMongo = globalThis as unknown as {
  __edutrackMongoClient?: MongoClient;
};

function getMongoClient(): MongoClient {
  if (!globalForMongo.__edutrackMongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set.");
    globalForMongo.__edutrackMongoClient = new MongoClient(uri);
  }
  return globalForMongo.__edutrackMongoClient;
}

function getDbName(): string {
  return process.env.MONGODB_DB_NAME || "edutrack_sms";
}

function getCollection<T extends Document>(name: string): Collection<T> {
  return getMongoClient().db(getDbName()).collection<T>(name);
}

/** Mongo document shape: our typed fields plus the Mongo _id. */
interface UserDoc extends User, Document {
  _id?: unknown;
}
interface TeacherDoc extends Teacher, Document {
  _id?: unknown;
}
interface StudentDoc extends Student, Document {
  _id?: unknown;
}
interface ClassDoc extends SchoolClass, Document {
  _id?: unknown;
}
interface SubjectDoc extends Subject, Document {
  _id?: unknown;
}
interface AcademicYearDoc extends AcademicYear, Document {
  _id?: unknown;
}
interface SettingsDoc extends Settings, Document {
  _id?: unknown;
}
interface EnrollmentDoc extends Enrollment, Document {
  _id?: unknown;
}
interface MarkSheetDoc extends MarkSheet, Document {
  _id?: unknown;
}
interface AttendanceRecordDoc extends AttendanceRecord, Document {
  _id?: unknown;
}
interface NoticeDoc extends Notice, Document {
  _id?: unknown;
}
interface AuditLogDoc extends AuditLog, Document {
  _id?: unknown;
}
interface MarkSheetIndexDoc extends Document {
  classId: string;
  subjectSlug: string;
  exam: string;
  academicYearId: string;
}
interface AttendanceIndexDoc extends Document {
  date: string;
  classId: string;
  subjectSlug: string;
}
interface AuditLogIndexDoc extends Document {
  createdAt: string;
}

const nowIso = () => new Date().toISOString();

function parse<T>(schema: ZodType<T>, doc: (T & Document) | null): T | null {
  if (!doc) return null;
  const parsed = schema.safeParse({ ...doc, _id: undefined });
  return parsed.success ? parsed.data : null;
}

export class MongoStore implements Store {
  static async create(): Promise<MongoStore> {
    const store = new MongoStore();
    await store.ensureIndexes();
    return store;
  }

  /**
   * Create indexes once per process. Includes indexes for collections the
   * later chunks own (mark sheets, attendance, audit) so the constraints
   * exist before the features land.
   */
  private indexesEnsured = false;
  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await getCollection<UserDoc>("users").createIndex(
      { email: 1 },
      { unique: true },
    );
    await getCollection<TeacherDoc>("teachers").createIndex(
      { userId: 1 },
      { unique: true },
    );
    await getCollection<StudentDoc>("students").createIndex(
      { classId: 1, roll: 1 },
      { unique: true },
    );
    await getCollection<StudentDoc>("students").createIndex({ userId: 1 });
    await getCollection<ClassDoc>("classes").createIndex({ id: 1 }, { unique: true });
    await getCollection<SubjectDoc>("subjects").createIndex(
      { slug: 1 },
      { unique: true },
    );
    await getCollection<AcademicYearDoc>("academicYears").createIndex(
      { id: 1 },
      { unique: true },
    );
    await getCollection<EnrollmentDoc>("enrollments").createIndex(
      { id: 1 },
      { unique: true },
    );
    await getCollection<NoticeDoc>("notices").createIndex({ id: 1 }, { unique: true });
    await getCollection<MarkSheetIndexDoc>("markSheets").createIndex(
      { classId: 1, subjectSlug: 1, exam: 1, academicYearId: 1 },
      { unique: true },
    );
    await getCollection<AttendanceIndexDoc>("attendanceRecords").createIndex(
      { date: 1, classId: 1, subjectSlug: 1 },
      { unique: true },
    );
    await getCollection<AuditLogIndexDoc>("auditLogs").createIndex({
      createdAt: -1,
    });
    this.indexesEnsured = true;
  }

  // ---- users ------------------------------------------------------------

  async getUserByEmail(email: string): Promise<User | null> {
    const doc = await getCollection<UserDoc>("users").findOne({
      email: email.toLowerCase(),
    });
    return parse(UserSchema, doc);
  }

  async getUserById(id: string): Promise<User | null> {
    const doc = await getCollection<UserDoc>("users").findOne({ id });
    return parse(UserSchema, doc);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: `usr-${randomUUID()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      ...(input.linkedId !== undefined ? { linkedId: input.linkedId } : {}),
      status: "active",
      createdAt: nowIso(),
    };
    try {
      await getCollection<UserDoc>("users").insertOne({ ...user });
    } catch (error) {
      if (error instanceof Error && /duplicate key/.test(error.message)) {
        throw new Error(`A user with email ${user.email} already exists.`);
      }
      throw error;
    }
    return user;
  }

  async listUsers(role?: Role): Promise<User[]> {
    const cursor = getCollection<UserDoc>("users")
      .find(role ? { role } : {})
      .sort({ createdAt: 1 });
    const docs = await cursor.toArray();
    return docs
      .map((doc) => parse(UserSchema, doc))
      .filter((u): u is User => u !== null);
  }

  async updateUser(id: string, patch: UpdateUserInput): Promise<User | null> {
    const doc = await getCollection<UserDoc>("users").findOneAndUpdate(
      { id },
      { $set: patch },
      { returnDocument: "after" },
    );
    return parse(UserSchema, doc);
  }

  async setUserStatus(id: string, status: UserStatus): Promise<User | null> {
    return this.updateUser(id, { status });
  }

  // ---- students -----------------------------------------------------------

  async listStudents(): Promise<Student[]> {
    const docs = await getCollection<StudentDoc>("students")
      .find({})
      .sort({ classId: 1, roll: 1 })
      .toArray();
    return docs
      .map((doc) => parse(StudentSchema, doc))
      .filter((s): s is Student => s !== null);
  }

  async getStudentById(id: string): Promise<Student | null> {
    const doc = await getCollection<StudentDoc>("students").findOne({ id });
    return parse(StudentSchema, doc);
  }

  async getStudentByUserId(userId: string): Promise<Student | null> {
    const doc = await getCollection<StudentDoc>("students").findOne({ userId });
    return parse(StudentSchema, doc);
  }

  async listStudentsByClass(classId: string): Promise<Student[]> {
    const docs = await getCollection<StudentDoc>("students")
      .find({ classId })
      .sort({ roll: 1 })
      .toArray();
    return docs
      .map((doc) => parse(StudentSchema, doc))
      .filter((s): s is Student => s !== null);
  }

  // ---- teachers -------------------------------------------------------------

  async listTeachers(): Promise<Teacher[]> {
    const docs = await getCollection<TeacherDoc>("teachers")
      .find({})
      .sort({ id: 1 })
      .toArray();
    return docs
      .map((doc) => parse(TeacherSchema, doc))
      .filter((t): t is Teacher => t !== null);
  }

  async getTeacherById(id: string): Promise<Teacher | null> {
    const doc = await getCollection<TeacherDoc>("teachers").findOne({ id });
    return parse(TeacherSchema, doc);
  }

  async getTeacherByUserId(userId: string): Promise<Teacher | null> {
    const doc = await getCollection<TeacherDoc>("teachers").findOne({ userId });
    return parse(TeacherSchema, doc);
  }

  // ---- classes & subjects ------------------------------------------------------

  async listClasses(): Promise<SchoolClass[]> {
    const docs = await getCollection<ClassDoc>("classes")
      .find({})
      .sort({ id: 1 })
      .toArray();
    return docs
      .map((doc) => parse(ClassSchema, doc))
      .filter((c): c is SchoolClass => c !== null);
  }

  async getClassById(id: string): Promise<SchoolClass | null> {
    const doc = await getCollection<ClassDoc>("classes").findOne({ id });
    return parse(ClassSchema, doc);
  }

  async listSubjects(): Promise<Subject[]> {
    const docs = await getCollection<SubjectDoc>("subjects")
      .find({})
      .sort({ code: 1 })
      .toArray();
    return docs
      .map((doc) => parse(SubjectSchema, doc))
      .filter((s): s is Subject => s !== null);
  }

  async getSubjectBySlug(slug: string): Promise<Subject | null> {
    const doc = await getCollection<SubjectDoc>("subjects").findOne({ slug });
    return parse(SubjectSchema, doc);
  }

  // ---- academic years ------------------------------------------------------------

  async listAcademicYears(): Promise<AcademicYear[]> {
    const docs = await getCollection<AcademicYearDoc>("academicYears")
      .find({})
      .sort({ label: 1 })
      .toArray();
    return docs
      .map((doc) => parse(AcademicYearSchema, doc))
      .filter((y): y is AcademicYear => y !== null);
  }

  async getActiveAcademicYear(): Promise<AcademicYear | null> {
    const doc = await getCollection<AcademicYearDoc>("academicYears").findOne({
      active: true,
    });
    return parse(AcademicYearSchema, doc);
  }

  // ---- school settings -----------------------------------------------------------

  async getSettings(): Promise<Settings> {
    const doc = await getCollection<SettingsDoc>("settings").findOne({
      id: "school",
    });
    const parsed = parse(SettingsSchema, doc);
    if (parsed) return parsed;
    // Bootstrap the singleton with the school defaults if it is missing
    // (run npm run seed to control this document explicitly).
    await getCollection<SettingsDoc>("settings").updateOne(
      { id: "school" },
      { $setOnInsert: { ...seedSettings } },
      { upsert: true },
    );
    return seedSettings;
  }

  async updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
    const doc = await getCollection<SettingsDoc>("settings").findOneAndUpdate(
      { id: "school" },
      {
        $set: { ...patch },
        $setOnInsert: { id: "school" },
      },
      { returnDocument: "after", upsert: true },
    );
    const parsed = parse(SettingsSchema, doc);
    if (parsed) return parsed;
    return this.getSettings();
  }

  // ---- enrollments ------------------------------------------------------------------

  async listEnrollmentsByClass(classId: string, academicYearId?: string): Promise<Enrollment[]> {
    const query: Record<string, string> = academicYearId
      ? { classId, academicYearId }
      : { classId };
    const docs = await getCollection<EnrollmentDoc>("enrollments")
      .find(query)
      .toArray();
    return docs
      .map((doc) => parse(EnrollmentSchema, doc))
      .filter((e): e is Enrollment => e !== null);
  }

  // ---- mark sheets --------------------------------------------------------------------

  async getMarkSheet(id: string): Promise<MarkSheet | null> {
    const doc = await getCollection<MarkSheetDoc>("markSheets").findOne({ id });
    return parse(MarkSheetSchema, doc);
  }

  async findMarkSheet(key: {
    classId: string;
    subjectSlug: string;
    exam: Exam;
    academicYearId: string;
  }): Promise<MarkSheet | null> {
    const doc = await getCollection<MarkSheetDoc>("markSheets").findOne({
      classId: key.classId,
      subjectSlug: key.subjectSlug,
      exam: key.exam,
      academicYearId: key.academicYearId,
    });
    return parse(MarkSheetSchema, doc);
  }

  async listMarkSheets(filter?: MarkSheetFilter): Promise<MarkSheet[]> {
    const query = filter
      ? Object.fromEntries(
          Object.entries(filter).filter(([, value]) => value !== undefined),
        )
      : {};
    const docs = await getCollection<MarkSheetDoc>("markSheets")
      .find(query)
      .sort({ academicYearId: 1, classId: 1, subjectSlug: 1, exam: 1 })
      .toArray();
    return docs
      .map((doc) => parse(MarkSheetSchema, doc))
      .filter((s): s is MarkSheet => s !== null);
  }

  async upsertMarkSheetDraft(input: UpsertMarkSheetInput): Promise<MarkSheet> {
    const key = {
      classId: input.classId,
      subjectSlug: input.subjectSlug,
      exam: input.exam,
      academicYearId: input.academicYearId,
    };
    const collection = getCollection<MarkSheetDoc>("markSheets");
    const existing = await collection.findOne(key);
    const now = nowIso();

    if (existing) {
      const status = existing.status;
      if (status !== "draft") {
        throw new Error(
          status === "published"
            ? "This mark sheet is published and can no longer be changed."
            : "This mark sheet is submitted for review and locked. Ask the administrator to return it first.",
        );
      }
      if (existing.teacherId !== input.teacherId) {
        throw new Error("Only the teacher assigned to this class and subject can edit this mark sheet.");
      }
      const doc = await collection.findOneAndUpdate(
        { id: existing.id },
        { $set: { entries: input.entries, updatedAt: now } },
        { returnDocument: "after" },
      );
      const parsed = parse(MarkSheetSchema, doc);
      if (!parsed) throw new Error("Failed to read the updated mark sheet.");
      return parsed;
    }

    const sheet: MarkSheet = {
      id: `ms-${randomUUID()}`,
      exam: input.exam,
      academicYearId: input.academicYearId,
      classId: input.classId,
      subjectSlug: input.subjectSlug,
      teacherId: input.teacherId,
      status: "draft",
      entries: input.entries,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await collection.insertOne({ ...sheet });
    } catch (error) {
      if (error instanceof Error && /duplicate key/.test(error.message)) {
        throw new Error("This mark sheet already exists.");
      }
      throw error;
    }
    return sheet;
  }

  async submitMarkSheet(id: string): Promise<MarkSheet> {
    const now = nowIso();
    const doc = await getCollection<MarkSheetDoc>("markSheets").findOneAndUpdate(
      { id, status: "draft" },
      { $set: { status: "submitted", submittedAt: now, updatedAt: now } },
      { returnDocument: "after" },
    );
    const parsed = parse(MarkSheetSchema, doc);
    if (!parsed) {
      // Distinguish "missing" from "wrong state" for an honest error message.
      const exists = await getCollection<MarkSheetDoc>("markSheets").findOne({ id });
      throw new Error(
        exists ? "Only a draft mark sheet can be submitted." : "Mark sheet not found.",
      );
    }
    return parsed;
  }

  async publishMarkSheet(id: string): Promise<MarkSheet> {
    const now = nowIso();
    const doc = await getCollection<MarkSheetDoc>("markSheets").findOneAndUpdate(
      { id, status: "submitted" },
      { $set: { status: "published", publishedAt: now, updatedAt: now } },
      { returnDocument: "after" },
    );
    const parsed = parse(MarkSheetSchema, doc);
    if (!parsed) {
      const exists = await getCollection<MarkSheetDoc>("markSheets").findOne({ id });
      throw new Error(
        exists ? "Only a submitted mark sheet can be published." : "Mark sheet not found.",
      );
    }
    return parsed;
  }

  async returnMarkSheetForRevision(id: string): Promise<MarkSheet> {
    const now = nowIso();
    const doc = await getCollection<MarkSheetDoc>("markSheets").findOneAndUpdate(
      { id, status: "submitted" },
      { $set: { status: "draft", updatedAt: now }, $unset: { submittedAt: "" } },
      { returnDocument: "after" },
    );
    const parsed = parse(MarkSheetSchema, doc);
    if (!parsed) {
      const exists = await getCollection<MarkSheetDoc>("markSheets").findOne({ id });
      throw new Error(
        exists
          ? "Only a submitted mark sheet can be returned for revision."
          : "Mark sheet not found.",
      );
    }
    return parsed;
  }

  // ---- attendance ----------------------------------------------------------------------

  async getAttendanceRecord(key: {
    date: string;
    classId: string;
    subjectSlug: string;
  }): Promise<AttendanceRecord | null> {
    const doc = await getCollection<AttendanceRecordDoc>("attendanceRecords").findOne({
      date: key.date,
      classId: key.classId,
      subjectSlug: key.subjectSlug,
    });
    return parse(AttendanceRecordSchema, doc);
  }

  async upsertAttendanceRecord(input: UpsertAttendanceInput): Promise<AttendanceRecord> {
    const collection = getCollection<AttendanceRecordDoc>("attendanceRecords");
    const key = {
      date: input.date,
      classId: input.classId,
      subjectSlug: input.subjectSlug,
    };
    const existing = await collection.findOne(key);
    if (existing) {
      await collection.updateOne(key, {
        $set: { takenByTeacherId: input.takenByTeacherId, entries: input.entries },
      });
    } else {
      await collection.insertOne({
        id: `att-${randomUUID()}`,
        ...key,
        takenByTeacherId: input.takenByTeacherId,
        entries: input.entries,
      });
    }
    const doc = await collection.findOne(key);
    const parsed = parse(AttendanceRecordSchema, doc);
    if (!parsed) throw new Error("Failed to read the saved attendance record.");
    return parsed;
  }

  async listAttendanceRecords(filter?: AttendanceFilter): Promise<AttendanceRecord[]> {
    const query: Record<string, unknown> = {};
    if (filter?.classId) query.classId = filter.classId;
    if (filter?.subjectSlug) query.subjectSlug = filter.subjectSlug;
    if (filter?.dateFrom || filter?.dateTo) {
      query.date = {
        ...(filter.dateFrom ? { $gte: filter.dateFrom } : {}),
        ...(filter.dateTo ? { $lte: filter.dateTo } : {}),
      };
    }
    const docs = await getCollection<AttendanceRecordDoc>("attendanceRecords")
      .find(query)
      .sort({ date: 1, classId: 1, subjectSlug: 1 })
      .toArray();
    return docs
      .map((doc) => parse(AttendanceRecordSchema, doc))
      .filter((r): r is AttendanceRecord => r !== null);
  }

  // ---- notices ---------------------------------------------------------------------------

  async createNotice(input: CreateNoticeInput): Promise<Notice> {
    const notice: Notice = {
      id: `ntc-${randomUUID()}`,
      title: input.title,
      bodyMd: input.bodyMd,
      audience: input.audience,
      ...(input.classId !== undefined ? { classId: input.classId } : {}),
      authorId: input.authorId,
      publishedAt: nowIso(),
      priority: input.priority ?? "normal",
    };
    await getCollection<NoticeDoc>("notices").insertOne({ ...notice });
    return notice;
  }

  async listNotices(filter?: NoticeFilter): Promise<Notice[]> {
    const query: Record<string, unknown> = {};
    if (filter?.audience) query.audience = filter.audience;
    if (filter?.classId) query.classId = filter.classId;
    if (filter?.authorId) query.authorId = filter.authorId;
    const docs = await getCollection<NoticeDoc>("notices")
      .find(query)
      .sort({ publishedAt: -1 })
      .toArray();
    return docs
      .map((doc) => parse(NoticeSchema, doc))
      .filter((n): n is Notice => n !== null);
  }

  // ---- audit log ---------------------------------------------------------------------------

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
    const log: AuditLog = {
      id: `aud-${randomUUID()}`,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      createdAt: nowIso(),
    };
    await getCollection<AuditLogDoc>("auditLogs").insertOne({ ...log });
    return log;
  }

  async listAuditLogs(filter?: AuditLogFilter): Promise<AuditLogPage> {
    const query: Record<string, unknown> = {};
    if (filter?.action) query.action = filter.action;
    if (filter?.resource) query.resource = filter.resource;
    if (filter?.actorId) query.actorId = filter.actorId;
    if (filter?.actorRole) {
      // Roles live on the users documents — resolve to an actorId $in list.
      const actorDocs = await getCollection<UserDoc>("users")
        .find({ role: filter.actorRole })
        .project<{ id: string }>({ id: 1, _id: 0 })
        .toArray();
      query.actorId = { $in: actorDocs.map((doc) => doc.id) };
    }
    if (filter?.dateFrom || filter?.dateTo) {
      query.createdAt = {
        ...(filter.dateFrom ? { $gte: `${filter.dateFrom}T00:00:00.000Z` } : {}),
        ...(filter.dateTo ? { $lte: `${filter.dateTo}T23:59:59.999Z` } : {}),
      };
    }
    const collection = getCollection<AuditLogDoc>("auditLogs");
    const total = await collection.countDocuments(query);
    const pageSize = filter?.pageSize ?? 20;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, filter?.page ?? 1), pageCount);
    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
    const logs = docs
      .map((doc) => parse(AuditLogSchema, doc))
      .filter((l): l is AuditLog => l !== null);
    return { logs, total, page, pageSize, pageCount };
  }
}
