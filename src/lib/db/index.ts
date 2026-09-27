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
  MarkSheetStatus,
  MarkEntry,
  AttendanceRecord,
  AttendanceEntry,
  Notice,
  NoticeAudience,
  NoticePriority,
  AuditLog,
} from "./types";
import { DemoStore } from "./demo-store";
import { MongoStore } from "./mongo";

/**
 * Dual-mode data layer.
 *
 * - MONGODB_URI unset  -> DemoStore (in-memory, lazily seeded, resets on
 *   server restart). Good for local demos; every UI honestly labels it.
 * - MONGODB_URI set    -> MongoStore (mongodb driver) backed by the
 *   database named by MONGODB_DB_NAME (default "edutrack_sms").
 *
 * EXTENDING THIS INTERFACE (for later chunks — marks, attendance, notices,
 * audit): add the method signature here first, then implement it in BOTH
 * DemoStore and MongoStore. Keep the methods domain-level (e.g.
 * listMarkSheets({ classId, status }) rather than raw collection access) so
 * both stores stay swappable and Mongo documents are always zod-parsed at
 * the boundary.
 */

/** Input shape for creating a user (id and timestamps are store-made). */
export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  linkedId?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
  linkedId?: string;
  status?: UserStatus;
}

export interface Store {
  // ---- users ---------------------------------------------------------------
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  listUsers(role?: Role): Promise<User[]>;
  updateUser(id: string, patch: UpdateUserInput): Promise<User | null>;
  /** Disabling keeps history intact; the account can no longer sign in. */
  setUserStatus(id: string, status: UserStatus): Promise<User | null>;

  // ---- students --------------------------------------------------------------
  listStudents(): Promise<Student[]>;
  getStudentById(id: string): Promise<Student | null>;
  /** Student linked to a user account (the signed-in student's own record). */
  getStudentByUserId(userId: string): Promise<Student | null>;
  listStudentsByClass(classId: string): Promise<Student[]>;

  // ---- teachers ---------------------------------------------------------------
  listTeachers(): Promise<Teacher[]>;
  getTeacherById(id: string): Promise<Teacher | null>;
  /** Teacher linked to a user account (the signed-in teacher's own record). */
  getTeacherByUserId(userId: string): Promise<Teacher | null>;

  // ---- classes & subjects -----------------------------------------------------
  listClasses(): Promise<SchoolClass[]>;
  getClassById(id: string): Promise<SchoolClass | null>;
  listSubjects(): Promise<Subject[]>;
  getSubjectBySlug(slug: string): Promise<Subject | null>;

  // ---- academic years -----------------------------------------------------------
  listAcademicYears(): Promise<AcademicYear[]>;
  getActiveAcademicYear(): Promise<AcademicYear | null>;

  // ---- school settings ------------------------------------------------------------
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings>;

  // ---- enrollments ------------------------------------------------------------------
  /** Enrollments for one class (optionally one academic year). */
  listEnrollmentsByClass(classId: string, academicYearId?: string): Promise<Enrollment[]>;

  // ---- mark sheets --------------------------------------------------------------------
  getMarkSheet(id: string): Promise<MarkSheet | null>;
  /** Unique key lookup: class + subject + exam + academic year. */
  findMarkSheet(key: {
    classId: string;
    subjectSlug: string;
    exam: Exam;
    academicYearId: string;
  }): Promise<MarkSheet | null>;
  listMarkSheets(filter?: MarkSheetFilter): Promise<MarkSheet[]>;
  /**
   * Create or update the DRAFT sheet for a class+subject+exam+year. Throws
   * when the sheet exists in another status (submitted/published sheets are
   * locked) or belongs to a different teacher — the state machine starts here.
   */
  upsertMarkSheetDraft(input: UpsertMarkSheetInput): Promise<MarkSheet>;
  /** draft -> submitted (sets submittedAt). Throws on any other source status. */
  submitMarkSheet(id: string): Promise<MarkSheet>;
  /** submitted -> published (sets publishedAt). Admin-only transition upstream; throws otherwise. */
  publishMarkSheet(id: string): Promise<MarkSheet>;
  /** submitted -> draft (returns the sheet to the teacher). Throws otherwise. */
  returnMarkSheetForRevision(id: string): Promise<MarkSheet>;

  // ---- attendance ------------------------------------------------------------------------
  getAttendanceRecord(key: {
    date: string;
    classId: string;
    subjectSlug: string;
  }): Promise<AttendanceRecord | null>;
  /** Create or replace the record for date+class+subject (upsert). */
  upsertAttendanceRecord(input: UpsertAttendanceInput): Promise<AttendanceRecord>;
  listAttendanceRecords(filter?: AttendanceFilter): Promise<AttendanceRecord[]>;

  // ---- notices ---------------------------------------------------------------------------
  createNotice(input: CreateNoticeInput): Promise<Notice>;
  listNotices(filter?: NoticeFilter): Promise<Notice[]>;

  // ---- audit log ----------------------------------------------------------------------------
  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog>;
  /** Newest first, paginated (default 20 per page). */
  listAuditLogs(filter?: AuditLogFilter): Promise<AuditLogPage>;
}

// ---- shared input/filter shapes for the domain methods ------------------------

export interface MarkSheetFilter {
  classId?: string;
  subjectSlug?: string;
  exam?: Exam;
  academicYearId?: string;
  teacherId?: string;
  status?: MarkSheetStatus;
}

export interface UpsertMarkSheetInput {
  classId: string;
  subjectSlug: string;
  exam: Exam;
  academicYearId: string;
  teacherId: string;
  entries: MarkEntry[];
}

export interface UpsertAttendanceInput {
  /** ISO date (yyyy-mm-dd) of the class day. */
  date: string;
  classId: string;
  subjectSlug: string;
  takenByTeacherId: string;
  entries: AttendanceEntry[];
}

export interface AttendanceFilter {
  classId?: string;
  subjectSlug?: string;
  /** Inclusive ISO date bounds (yyyy-mm-dd). */
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateNoticeInput {
  title: string;
  bodyMd: string;
  audience: NoticeAudience;
  /** Required when audience is "class". */
  classId?: string;
  authorId: string;
  priority?: NoticePriority;
}

export interface NoticeFilter {
  audience?: NoticeAudience;
  classId?: string;
  authorId?: string;
}

export interface CreateAuditLogInput {
  actorId: string;
  actorName: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilter {
  action?: string;
  resource?: string;
  actorId?: string;
  /** Filter by the actor's ROLE (resolved against the users collection). */
  actorRole?: Role;
  /** Inclusive lower bound, yyyy-mm-dd (compared against ISO timestamps). */
  dateFrom?: string;
  /** Inclusive upper bound, yyyy-mm-dd. */
  dateTo?: string;
  /** 1-based page number (default 1). */
  page?: number;
  pageSize?: number;
}

export interface AuditLogPage {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const globalForStore = globalThis as unknown as {
  __edutrackStore?: Store;
};

/** Get the process-wide store singleton (DemoStore or MongoStore). */
export async function getStore(): Promise<Store> {
  if (!globalForStore.__edutrackStore) {
    if (process.env.MONGODB_URI) {
      globalForStore.__edutrackStore = await MongoStore.create();
    } else {
      globalForStore.__edutrackStore = await DemoStore.create();
    }
  }
  return globalForStore.__edutrackStore;
}

/** Test helper: forget the singleton so the next getStore() re-initializes. */
export function resetStoreForTests(): void {
  delete globalForStore.__edutrackStore;
}

export type { DemoStore, MongoStore };
