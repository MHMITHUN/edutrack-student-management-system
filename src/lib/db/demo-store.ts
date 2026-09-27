import { randomUUID } from "node:crypto";
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
  MarkSheet,
  AttendanceRecord,
  Notice,
  AuditLog,
} from "./types";
import { hashPassword } from "@/lib/auth/password";
import { DEMO_PASSWORD, seedStudents, seedTeachers, seedUsers } from "./seeds/users";
import {
  seedAcademicYears,
  seedClasses,
  seedSettings,
  seedSubjects,
} from "./seeds/catalog";
import { seedEnrollments, seedMarkSheets } from "./seeds/markSheets";
import { seedAttendanceRecords } from "./seeds/attendance";
import { seedNotices } from "./seeds/notices";
import { seedAuditLogs } from "./seeds/audit";
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
 * In-memory store used when MONGODB_URI is absent. Seeded lazily on first
 * access; data resets when the server restarts. All mutations are real —
 * they write to the in-memory Maps, and reads see them (spec section 36:
 * never fake functionality). The mark sheet state machine (draft ->
 * submitted -> published, with admin returns) is enforced HERE so no caller
 * can bypass it.
 */

const nowIso = () => new Date().toISOString();

function markSheetKey(classId: string, subjectSlug: string, exam: string, academicYearId: string): string {
  return `${academicYearId}|${classId}|${subjectSlug}|${exam}`;
}

function attendanceKey(date: string, classId: string, subjectSlug: string): string {
  return `${date}|${classId}|${subjectSlug}`;
}

export class DemoStore implements Store {
  private usersByEmail = new Map<string, User>();
  private usersById = new Map<string, User>();
  private studentsById = new Map<string, Student>();
  private studentsByUserId = new Map<string, Student>();
  private teachersById = new Map<string, Teacher>();
  private teachersByUserId = new Map<string, Teacher>();
  private classesById = new Map<string, SchoolClass>();
  private subjectsBySlug = new Map<string, Subject>();
  private academicYearsById = new Map<string, AcademicYear>();
  private enrollmentsByClassId = new Map<string, Enrollment[]>();
  private markSheetsById = new Map<string, MarkSheet>();
  private markSheetsByKey = new Map<string, MarkSheet>();
  private attendanceByKey = new Map<string, AttendanceRecord>();
  private noticesById = new Map<string, Notice>();
  private auditLogs: AuditLog[] = [];
  private settings: Settings | null = null;
  private seeded = false;

  static async create(): Promise<DemoStore> {
    const store = new DemoStore();
    await store.ensureSeeded();
    return store;
  }

  /** Idempotent: seed exactly once per process. */
  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;

    // Every seed account shares the demo password, so one scrypt hash is
    // computed per seed run and reused (67 individual hashes would be slow).
    const seedPasswordHash = hashPassword(DEMO_PASSWORD);
    for (const seed of seedUsers) {
      const user: User = { ...seed, passwordHash: seedPasswordHash };
      this.usersByEmail.set(user.email, user);
      this.usersById.set(user.id, user);
    }
    for (const teacher of seedTeachers) {
      this.teachersById.set(teacher.id, teacher);
      this.teachersByUserId.set(teacher.userId, teacher);
    }
    for (const student of seedStudents) {
      this.studentsById.set(student.id, student);
      this.studentsByUserId.set(student.userId, student);
    }
    for (const klass of seedClasses) this.classesById.set(klass.id, klass);
    for (const subject of seedSubjects) this.subjectsBySlug.set(subject.slug, subject);
    for (const year of seedAcademicYears) this.academicYearsById.set(year.id, year);
    for (const enrollment of seedEnrollments) {
      const list = this.enrollmentsByClassId.get(enrollment.classId) ?? [];
      list.push(enrollment);
      this.enrollmentsByClassId.set(enrollment.classId, list);
    }
    for (const sheet of seedMarkSheets) {
      this.markSheetsById.set(sheet.id, sheet);
      this.markSheetsByKey.set(
        markSheetKey(sheet.classId, sheet.subjectSlug, sheet.exam, sheet.academicYearId),
        sheet,
      );
    }
    for (const record of seedAttendanceRecords) {
      this.attendanceByKey.set(
        attendanceKey(record.date, record.classId, record.subjectSlug),
        record,
      );
    }
    for (const notice of seedNotices) this.noticesById.set(notice.id, notice);
    this.auditLogs = [...seedAuditLogs];
    this.settings = seedSettings;

    this.seeded = true;
  }

  // ---- users ------------------------------------------------------------

  async getUserByEmail(email: string): Promise<User | null> {
    await this.ensureSeeded();
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    await this.ensureSeeded();
    return this.usersById.get(id) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    await this.ensureSeeded();
    const email = input.email.toLowerCase();
    if (this.usersByEmail.has(email)) {
      throw new Error(`A user with email ${email} already exists.`);
    }
    const user: User = {
      id: `usr-${randomUUID()}`,
      name: input.name,
      email,
      passwordHash: input.passwordHash,
      role: input.role,
      ...(input.linkedId !== undefined ? { linkedId: input.linkedId } : {}),
      status: "active",
      createdAt: nowIso(),
    };
    this.usersByEmail.set(user.email, user);
    this.usersById.set(user.id, user);
    return user;
  }

  async listUsers(role?: Role): Promise<User[]> {
    await this.ensureSeeded();
    const all = [...this.usersById.values()];
    const sorted = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return role ? sorted.filter((u) => u.role === role) : sorted;
  }

  async updateUser(id: string, patch: UpdateUserInput): Promise<User | null> {
    await this.ensureSeeded();
    const existing = this.usersById.get(id);
    if (!existing) return null;
    const updated: User = { ...existing, ...patch };
    this.usersById.set(id, updated);
    if (updated.email !== existing.email) {
      this.usersByEmail.delete(existing.email);
    }
    this.usersByEmail.set(updated.email, updated);
    return updated;
  }

  async setUserStatus(id: string, status: UserStatus): Promise<User | null> {
    return this.updateUser(id, { status });
  }

  // ---- students -----------------------------------------------------------

  async listStudents(): Promise<Student[]> {
    await this.ensureSeeded();
    return [...this.studentsById.values()].sort(
      (a, b) => a.classId.localeCompare(b.classId) || a.roll - b.roll,
    );
  }

  async getStudentById(id: string): Promise<Student | null> {
    await this.ensureSeeded();
    return this.studentsById.get(id) ?? null;
  }

  async getStudentByUserId(userId: string): Promise<Student | null> {
    await this.ensureSeeded();
    return this.studentsByUserId.get(userId) ?? null;
  }

  async listStudentsByClass(classId: string): Promise<Student[]> {
    await this.ensureSeeded();
    return [...this.studentsById.values()]
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.roll - b.roll);
  }

  // ---- teachers -------------------------------------------------------------

  async listTeachers(): Promise<Teacher[]> {
    await this.ensureSeeded();
    return [...this.teachersById.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  async getTeacherById(id: string): Promise<Teacher | null> {
    await this.ensureSeeded();
    return this.teachersById.get(id) ?? null;
  }

  async getTeacherByUserId(userId: string): Promise<Teacher | null> {
    await this.ensureSeeded();
    return this.teachersByUserId.get(userId) ?? null;
  }

  // ---- classes & subjects ------------------------------------------------------

  async listClasses(): Promise<SchoolClass[]> {
    await this.ensureSeeded();
    return [...this.classesById.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  async getClassById(id: string): Promise<SchoolClass | null> {
    await this.ensureSeeded();
    return this.classesById.get(id) ?? null;
  }

  async listSubjects(): Promise<Subject[]> {
    await this.ensureSeeded();
    return [...this.subjectsBySlug.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }

  async getSubjectBySlug(slug: string): Promise<Subject | null> {
    await this.ensureSeeded();
    return this.subjectsBySlug.get(slug) ?? null;
  }

  // ---- academic years ------------------------------------------------------------

  async listAcademicYears(): Promise<AcademicYear[]> {
    await this.ensureSeeded();
    return [...this.academicYearsById.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }

  async getActiveAcademicYear(): Promise<AcademicYear | null> {
    await this.ensureSeeded();
    return [...this.academicYearsById.values()].find((y) => y.active) ?? null;
  }

  // ---- school settings -----------------------------------------------------------

  async getSettings(): Promise<Settings> {
    await this.ensureSeeded();
    if (!this.settings) throw new Error("Settings not seeded.");
    return this.settings;
  }

  async updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
    await this.ensureSeeded();
    if (!this.settings) throw new Error("Settings not seeded.");
    this.settings = { ...this.settings, ...patch, id: "school" };
    return this.settings;
  }

  // ---- enrollments ------------------------------------------------------------------

  async listEnrollmentsByClass(classId: string, academicYearId?: string): Promise<Enrollment[]> {
    await this.ensureSeeded();
    const rows = this.enrollmentsByClassId.get(classId) ?? [];
    return academicYearId
      ? rows.filter((e) => e.academicYearId === academicYearId)
      : [...rows];
  }

  // ---- mark sheets ---------------------------------------------------------------------

  async getMarkSheet(id: string): Promise<MarkSheet | null> {
    await this.ensureSeeded();
    return this.markSheetsById.get(id) ?? null;
  }

  async findMarkSheet(key: {
    classId: string;
    subjectSlug: string;
    exam: MarkSheet["exam"];
    academicYearId: string;
  }): Promise<MarkSheet | null> {
    await this.ensureSeeded();
    return (
      this.markSheetsByKey.get(
        markSheetKey(key.classId, key.subjectSlug, key.exam, key.academicYearId),
      ) ?? null
    );
  }

  async listMarkSheets(filter?: MarkSheetFilter): Promise<MarkSheet[]> {
    await this.ensureSeeded();
    const all = [...this.markSheetsById.values()];
    const matched = all.filter((sheet) => {
      if (filter?.classId && sheet.classId !== filter.classId) return false;
      if (filter?.subjectSlug && sheet.subjectSlug !== filter.subjectSlug) return false;
      if (filter?.exam && sheet.exam !== filter.exam) return false;
      if (filter?.academicYearId && sheet.academicYearId !== filter.academicYearId) return false;
      if (filter?.teacherId && sheet.teacherId !== filter.teacherId) return false;
      if (filter?.status && sheet.status !== filter.status) return false;
      return true;
    });
    return matched.sort(
      (a, b) =>
        a.academicYearId.localeCompare(b.academicYearId) ||
        a.classId.localeCompare(b.classId) ||
        a.subjectSlug.localeCompare(b.subjectSlug) ||
        a.exam.localeCompare(b.exam),
    );
  }

  async upsertMarkSheetDraft(input: UpsertMarkSheetInput): Promise<MarkSheet> {
    await this.ensureSeeded();
    const key = markSheetKey(input.classId, input.subjectSlug, input.exam, input.academicYearId);
    const existing = this.markSheetsByKey.get(key);
    const now = nowIso();
    let sheet: MarkSheet;
    if (existing) {
      if (existing.status !== "draft") {
        throw new Error(
          existing.status === "published"
            ? "This mark sheet is published and can no longer be changed."
            : "This mark sheet is submitted for review and locked. Ask the administrator to return it first.",
        );
      }
      if (existing.teacherId !== input.teacherId) {
        throw new Error("Only the teacher assigned to this class and subject can edit this mark sheet.");
      }
      sheet = { ...existing, entries: input.entries, updatedAt: now };
    } else {
      sheet = {
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
    }
    this.markSheetsById.set(sheet.id, sheet);
    this.markSheetsByKey.set(key, sheet);
    return sheet;
  }

  async submitMarkSheet(id: string): Promise<MarkSheet> {
    await this.ensureSeeded();
    const sheet = this.markSheetsById.get(id);
    if (!sheet) throw new Error("Mark sheet not found.");
    if (sheet.status !== "draft") {
      throw new Error("Only a draft mark sheet can be submitted.");
    }
    const now = nowIso();
    const updated: MarkSheet = {
      ...sheet,
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    };
    this.markSheetsById.set(id, updated);
    this.markSheetsByKey.set(
      markSheetKey(updated.classId, updated.subjectSlug, updated.exam, updated.academicYearId),
      updated,
    );
    return updated;
  }

  async publishMarkSheet(id: string): Promise<MarkSheet> {
    await this.ensureSeeded();
    const sheet = this.markSheetsById.get(id);
    if (!sheet) throw new Error("Mark sheet not found.");
    if (sheet.status !== "submitted") {
      throw new Error("Only a submitted mark sheet can be published.");
    }
    const now = nowIso();
    const updated: MarkSheet = {
      ...sheet,
      status: "published",
      publishedAt: now,
      updatedAt: now,
    };
    this.markSheetsById.set(id, updated);
    this.markSheetsByKey.set(
      markSheetKey(updated.classId, updated.subjectSlug, updated.exam, updated.academicYearId),
      updated,
    );
    return updated;
  }

  async returnMarkSheetForRevision(id: string): Promise<MarkSheet> {
    await this.ensureSeeded();
    const sheet = this.markSheetsById.get(id);
    if (!sheet) throw new Error("Mark sheet not found.");
    if (sheet.status !== "submitted") {
      throw new Error("Only a submitted mark sheet can be returned for revision.");
    }
    const now = nowIso();
    const updated: MarkSheet = { ...sheet, status: "draft", updatedAt: now };
    delete updated.submittedAt;
    this.markSheetsById.set(id, updated);
    this.markSheetsByKey.set(
      markSheetKey(updated.classId, updated.subjectSlug, updated.exam, updated.academicYearId),
      updated,
    );
    return updated;
  }

  // ---- attendance ----------------------------------------------------------------------

  async getAttendanceRecord(key: {
    date: string;
    classId: string;
    subjectSlug: string;
  }): Promise<AttendanceRecord | null> {
    await this.ensureSeeded();
    return (
      this.attendanceByKey.get(attendanceKey(key.date, key.classId, key.subjectSlug)) ??
      null
    );
  }

  async upsertAttendanceRecord(input: UpsertAttendanceInput): Promise<AttendanceRecord> {
    await this.ensureSeeded();
    const key = attendanceKey(input.date, input.classId, input.subjectSlug);
    const existing = this.attendanceByKey.get(key);
    const record: AttendanceRecord = existing
      ? { ...existing, takenByTeacherId: input.takenByTeacherId, entries: input.entries }
      : {
          id: `att-${randomUUID()}`,
          date: input.date,
          classId: input.classId,
          subjectSlug: input.subjectSlug,
          takenByTeacherId: input.takenByTeacherId,
          entries: input.entries,
        };
    this.attendanceByKey.set(key, record);
    return record;
  }

  async listAttendanceRecords(filter?: AttendanceFilter): Promise<AttendanceRecord[]> {
    await this.ensureSeeded();
    const all = [...this.attendanceByKey.values()];
    const matched = all.filter((record) => {
      if (filter?.classId && record.classId !== filter.classId) return false;
      if (filter?.subjectSlug && record.subjectSlug !== filter.subjectSlug) return false;
      if (filter?.dateFrom && record.date < filter.dateFrom) return false;
      if (filter?.dateTo && record.date > filter.dateTo) return false;
      return true;
    });
    return matched.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.classId.localeCompare(b.classId) ||
        a.subjectSlug.localeCompare(b.subjectSlug),
    );
  }

  // ---- notices ---------------------------------------------------------------------------

  async createNotice(input: CreateNoticeInput): Promise<Notice> {
    await this.ensureSeeded();
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
    this.noticesById.set(notice.id, notice);
    return notice;
  }

  async listNotices(filter?: NoticeFilter): Promise<Notice[]> {
    await this.ensureSeeded();
    const all = [...this.noticesById.values()];
    const matched = all.filter((notice) => {
      if (filter?.audience && notice.audience !== filter.audience) return false;
      if (filter?.classId && notice.classId !== filter.classId) return false;
      if (filter?.authorId && notice.authorId !== filter.authorId) return false;
      return true;
    });
    return matched.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  // ---- audit log ---------------------------------------------------------------------------

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
    await this.ensureSeeded();
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
    this.auditLogs.push(log);
    return log;
  }

  async listAuditLogs(filter?: AuditLogFilter): Promise<AuditLogPage> {
    await this.ensureSeeded();
    const fromBound = filter?.dateFrom ? `${filter.dateFrom}T00:00:00.000Z` : null;
    const toBound = filter?.dateTo ? `${filter.dateTo}T23:59:59.999Z` : null;
    const matched = this.auditLogs.filter((log) => {
      if (filter?.action && log.action !== filter.action) return false;
      if (filter?.resource && log.resource !== filter.resource) return false;
      if (filter?.actorId && log.actorId !== filter.actorId) return false;
      if (filter?.actorRole && this.usersById.get(log.actorId)?.role !== filter.actorRole) {
        return false;
      }
      if (fromBound && log.createdAt < fromBound) return false;
      if (toBound && log.createdAt > toBound) return false;
      return true;
    });
    const sorted = [...matched].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pageSize = filter?.pageSize ?? 20;
    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, filter?.page ?? 1), pageCount);
    const start = (page - 1) * pageSize;
    return {
      logs: sorted.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      pageCount,
    };
  }
}
