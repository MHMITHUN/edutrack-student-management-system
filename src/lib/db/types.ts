import { z } from "zod";

/**
 * Zod schemas + inferred TypeScript types for every collection.
 * MongoStore parses documents at the boundary with these schemas;
 * DemoStore produces values that already satisfy them.
 */

// ---- shared enums -------------------------------------------------------------

export const RoleSchema = z.enum(["ADMIN", "TEACHER", "STUDENT"]);
export type Role = z.infer<typeof RoleSchema>;

export const UserStatusSchema = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const SectionSchema = z.enum(["Science", "Business Studies"]);
export type Section = z.infer<typeof SectionSchema>;

export const ExamSchema = z.enum([
  "First Term",
  "Half Yearly",
  "Test Examination",
  "Annual",
]);
export type Exam = z.infer<typeof ExamSchema>;

export const MarkSheetStatusSchema = z.enum(["draft", "submitted", "published"]);
export type MarkSheetStatus = z.infer<typeof MarkSheetStatusSchema>;

export const AttendanceStatusSchema = z.enum(["present", "absent", "late"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const NoticeAudienceSchema = z.enum(["all", "teachers", "students", "class"]);
export type NoticeAudience = z.infer<typeof NoticeAudienceSchema>;

export const NoticePrioritySchema = z.enum(["normal", "important"]);
export type NoticePriority = z.infer<typeof NoticePrioritySchema>;

// ---- users ----------------------------------------------------------------------

export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  /** scrypt$<salt-hex>$<hash-hex> — see src/lib/auth/password.ts */
  passwordHash: z.string().min(1),
  role: RoleSchema,
  /** Teacher.id or Student.id for TEACHER/STUDENT accounts. */
  linkedId: z.string().optional(),
  status: UserStatusSchema.default("active"),
  createdAt: z.string(), // ISO date, e.g. "2026-01-05T09:00:00.000Z"
});
export type User = z.infer<typeof UserSchema>;
/** User shape safe to send to the client. */
export type PublicUser = Omit<User, "passwordHash">;

// ---- teachers --------------------------------------------------------------------

export const ClassAssignmentSchema = z.object({
  classId: z.string().min(1),
  subjectSlug: z.string().min(1),
});
export type ClassAssignment = z.infer<typeof ClassAssignmentSchema>;

export const TeacherSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  designation: z.string().min(1),
  /** Subjects this teacher is qualified to teach (Subject.slug values). */
  subjectSlugs: z.array(z.string().min(1)),
  /** Class+subject pairs this teacher currently takes. */
  classAssignments: z.array(ClassAssignmentSchema),
  joinYear: z.number().int().min(1990).max(2100),
});
export type Teacher = z.infer<typeof TeacherSchema>;

// ---- students ----------------------------------------------------------------------

export const StudentSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  /** Roll number within the class (unique per class). */
  roll: z.number().int().min(1),
  classId: z.string().min(1),
  section: SectionSchema,
  guardianName: z.string().min(1),
  guardianPhone: z.string().min(6),
  admissionYear: z.number().int().min(1990).max(2100),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type Student = z.infer<typeof StudentSchema>;

// ---- classes & subjects -------------------------------------------------------------

export const ClassSchema = z.object({
  id: z.string().min(1),
  /** e.g. "Class Nine", "Class Ten". */
  name: z.string().min(1),
  section: SectionSchema,
  classTeacherId: z.string().min(1),
  academicYearId: z.string().min(1),
});
export type SchoolClass = z.infer<typeof ClassSchema>;

export const SubjectSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  /** Class ids this subject is taught in. */
  classes: z.array(z.string().min(1)),
});
export type Subject = z.infer<typeof SubjectSchema>;

export const AcademicYearSchema = z.object({
  id: z.string().min(1),
  /** e.g. "2025", "2026". */
  label: z.string().regex(/^\d{4}$/),
  active: z.boolean(),
});
export type AcademicYear = z.infer<typeof AcademicYearSchema>;

export const EnrollmentSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  classId: z.string().min(1),
  subjectSlugs: z.array(z.string().min(1)),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

// ---- marks ----------------------------------------------------------------------

export const MarkEntrySchema = z.object({
  studentId: z.string().min(1),
  /** Written marks 0-100; null = absent from the exam. */
  marks: z.number().min(0).max(100).nullable(),
  absent: z.boolean().optional(),
});
export type MarkEntry = z.infer<typeof MarkEntrySchema>;

export const MarkSheetSchema = z.object({
  id: z.string().min(1),
  exam: ExamSchema,
  academicYearId: z.string().min(1),
  classId: z.string().min(1),
  subjectSlug: z.string().min(1),
  teacherId: z.string().min(1),
  status: MarkSheetStatusSchema,
  entries: z.array(MarkEntrySchema),
  submittedAt: z.string().optional(),
  publishedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MarkSheet = z.infer<typeof MarkSheetSchema>;

// ---- attendance --------------------------------------------------------------------

export const AttendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: AttendanceStatusSchema,
});
export type AttendanceEntry = z.infer<typeof AttendanceEntrySchema>;

export const AttendanceRecordSchema = z.object({
  id: z.string().min(1),
  /** ISO date (yyyy-mm-dd) of the class day. */
  date: z.string().min(10),
  classId: z.string().min(1),
  subjectSlug: z.string().min(1),
  takenByTeacherId: z.string().min(1),
  entries: z.array(AttendanceEntrySchema),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

// ---- notices ----------------------------------------------------------------------

export const NoticeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  bodyMd: z.string(),
  audience: NoticeAudienceSchema,
  /** Required when audience is "class". */
  classId: z.string().optional(),
  authorId: z.string().min(1),
  publishedAt: z.string(),
  priority: NoticePrioritySchema,
});
export type Notice = z.infer<typeof NoticeSchema>;

// ---- audit log ----------------------------------------------------------------------

export const AuditLogSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().min(1),
  actorName: z.string().min(1),
  /** e.g. "marksheet.submit", "user.create". */
  action: z.string().min(1),
  resource: z.string().min(1),
  resourceId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

// ---- school settings ----------------------------------------------------------------

export const GradeBandSchema = z.object({
  min: z.number().int().min(0).max(100),
  max: z.number().int().min(0).max(100),
  grade: z.string().min(1),
  points: z.number().min(0).max(5),
});
export type GradeBand = z.infer<typeof GradeBandSchema>;

export const SettingsSchema = z.object({
  /** Singleton document — always the literal "school". */
  id: z.literal("school"),
  /** Institution name shown on dashboards and printed marksheets. */
  schoolName: z.string().min(1).default("EduTrack Demo School"),
  gradeBands: z
    .array(GradeBandSchema)
    .min(1)
    .refine(
      (bands) => {
        const sorted = [...bands].sort((a, b) => a.min - b.min);
        return sorted.every((band, i) =>
          i === 0 ? band.min === 0 : band.min === sorted[i - 1].max + 1,
        );
      },
      { message: "Grade bands must be contiguous and start at 0." },
    ),
  /** When true, any failing grade caps the term GPA at the F band (0.00). */
  failCapsGpa: z.boolean(),
  attendanceWarnPercent: z.number().int().min(0).max(100),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Default grading rules (spec section 18.5) used by the base seed. */
export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min: 80, max: 100, grade: "A+", points: 5.0 },
  { min: 70, max: 79, grade: "A", points: 4.0 },
  { min: 60, max: 69, grade: "A-", points: 3.5 },
  { min: 50, max: 59, grade: "B", points: 3.0 },
  { min: 40, max: 49, grade: "C", points: 2.0 },
  { min: 33, max: 39, grade: "D", points: 1.0 },
  { min: 0, max: 32, grade: "F", points: 0.0 },
];
