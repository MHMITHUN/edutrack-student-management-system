# Database Schema

EduTrack stores everything in MongoDB (or the equivalent in-memory Demo
store). Every collection is defined by a **Zod schema** in
[`src/lib/db/types.ts`](../src/lib/db/types.ts) — `MongoStore` parses every
document at the boundary with these schemas, and `DemoStore` produces values
that already satisfy them, so both modes share one contract.

Conventions:

- IDs are human-readable strings (`usr-admin-01`, `tch-03`, `stu-031`,
  `cls-10-science`, `ms-016`, `enr-stu-001-2026`, `aud-seed-007`).
- Dates are ISO-8601 strings: timestamps end in `Z` (UTC); attendance `date`
  is a `yyyy-mm-dd` calendar day.
- There are no Mongo foreign keys; relationships are by these string IDs and
  enforced by the application layer (workflow + store invariants).

Collections (12):

```text
users  teachers  students  classes  subjects  academicYears  enrollments
markSheets  attendanceRecords  notices  auditLogs  settings
```

---

## users

One account per person. Roles: `ADMIN | TEACHER | STUDENT`. TEACHER/STUDENT
accounts link to their directory record via `linkedId`.

| Field          | Type                         | Required | Notes                                        |
| -------------- | ---------------------------- | -------- | -------------------------------------------- |
| `id`           | string                       | yes      | e.g. `usr-admin-01`, `usr-stu-031`           |
| `name`         | string                       | yes      | display name                                 |
| `email`        | string (email format)        | yes      | login identifier, case-sensitive uniqueness  |
| `passwordHash` | string                       | yes      | `scrypt$<salt-hex>$<hash-hex>` (N=16384, r=8, p=1, 64-byte key) |
| `role`         | `"ADMIN" \| "TEACHER" \| "STUDENT"` | yes | checked against the store on every request   |
| `linkedId`     | string                       | no       | `teachers.id` or `students.id`               |
| `status`       | `"active" \| "disabled"`     | yes (default `active`) | disabled accounts cannot sign in |
| `createdAt`    | ISO timestamp                | yes      | set at creation                              |

**Indexes:** `{ email: 1 }` unique.

**Relationships:** `linkedId → teachers.id | students.id`.

**Validation:** `UserSchema`. Passwords are never stored or logged in plain
text; hashing happens in `src/lib/auth/password.ts`.

---

## teachers

Faculty directory plus **teaching load** — the source of truth for the
marks-entry authorization rule ("a teacher may only enter marks for their
assigned class+subject").

| Field              | Type     | Required | Notes                                        |
| ------------------ | -------- | -------- | -------------------------------------------- |
| `id`               | string   | yes      | e.g. `tch-01`                                |
| `userId`           | string   | yes      | → `users.id`                                 |
| `name`             | string   | yes      |                                              |
| `email`            | string   | yes      | mirrors the linked user                      |
| `designation`      | string   | yes      | e.g. "Associate Professor"                   |
| `subjectSlugs`     | string[] | yes      | subjects qualified to teach (→ `subjects.slug`) |
| `classAssignments` | `{ classId, subjectSlug }[]` | yes | the teaching load actually enforced |
| `joinYear`         | int (1990–2100) | yes |                                              |

**Indexes:** `{ userId: 1 }` unique.

**Relationships:** `userId → users.id`; `classAssignments[].classId →
classes.id`; `classAssignments[].subjectSlug → subjects.slug`.

---

## students

The school roll. Guardians are first-name/phone only — no guardian accounts
(see README → Future Enhancements).

| Field           | Type                    | Required | Notes                              |
| --------------- | ----------------------- | -------- | ---------------------------------- |
| `id`            | string                  | yes      | e.g. `stu-031`                     |
| `userId`        | string                  | yes      | → `users.id`                       |
| `name`          | string                  | yes      |                                    |
| `email`         | string (email)          | yes      |                                    |
| `roll`          | int ≥ 1                 | yes      | unique **within the class**        |
| `classId`       | string                  | yes      | → `classes.id`                     |
| `section`       | `"Science" \| "Business Studies"` | yes | mirrors the class section        |
| `guardianName`  | string                  | yes      |                                    |
| `guardianPhone` | string (min 6)          | yes      |                                    |
| `admissionYear` | int (1990–2100)         | yes      |                                    |
| `status`        | `"active" \| "inactive"` | yes (default `active`) |                    |

**Indexes:** `{ classId: 1, roll: 1 }` unique; `{ userId: 1 }`.

**Relationships:** `classId → classes.id`; `userId → users.id`.

---

## classes

| Field            | Type     | Required | Notes                              |
| ---------------- | -------- | -------- | ---------------------------------- |
| `id`             | string   | yes      | e.g. `cls-9-science`               |
| `name`           | string   | yes      | "Class Nine" / "Class Ten"         |
| `section`        | string   | yes      | Science / Business Studies         |
| `classTeacherId` | string   | yes      | → `teachers.id`                    |
| `academicYearId` | string   | yes      | → `academicYears.id`               |

**Indexes:** `{ id: 1 }` unique.

Seed: 4 classes (Nine/Ten × Science/Business Studies), 15 students each.

---

## subjects

| Field     | Type     | Required | Notes                        |
| --------- | -------- | -------- | ---------------------------- |
| `slug`     | string   | yes      | e.g. `ict` — used everywhere |
| `name`     | string   | yes      | e.g. "ICT", "Bangla", "Higher Mathematics" style names |
| `code`     | string   | yes      | board-style code, e.g. `275` |
| `classes`  | string[] | yes      | class ids where taught       |

**Indexes:** `{ slug: 1 }` unique.

Seed: 8 subjects — bangla, english, mathematics, ict (all classes);
physics, chemistry, biology (Science); accounting (Business Studies).

---

## academicYears

| Field    | Type     | Required | Notes                        |
| -------- | -------- | -------- | ---------------------------- |
| `id`      | string   | yes      | `ay-2025`, `ay-2026`         |
| `label`   | string (`^\d{4}$`) | yes | "2026"                      |
| `active`  | boolean  | yes      | exactly one in the seeds     |

**Indexes:** `{ id: 1 }` unique.

---

## enrollments

Which student sits which subjects in which academic year. Powers the roster
for marks entry: `rosterFor(classId, year)` = class roll ∩ enrollments
(falls back to the full roll when a class has no enrollment rows for the
year).

| Field            | Type     | Required | Notes                                    |
| ---------------- | -------- | -------- | ---------------------------------------- |
| `id`             | string   | yes      | `enr-<studentId>-<year-label>`           |
| `studentId`      | string   | yes      | → `students.id`                          |
| `academicYearId` | string   | yes      | → `academicYears.id`                     |
| `classId`        | string   | yes      | → `classes.id` (denormalized for lookup) |
| `subjectSlugs`   | string[] | yes      | → `subjects.slug`                        |

**Indexes:** `{ id: 1 }` unique.

---

## markSheets

The heart of the system: one sheet per **class + subject + exam + academic
year** (unique compound key), owned by the assigned teacher, carrying one
entry per rostered student.

| Field            | Type                                       | Required | Notes                          |
| ---------------- | ------------------------------------------ | -------- | ------------------------------ |
| `id`             | string                                     | yes      | e.g. `ms-016`                  |
| `exam`           | `"First Term" \| "Half Yearly" \| "Test Examination" \| "Annual"` | yes |                    |
| `academicYearId` | string                                     | yes      | → `academicYears.id`           |
| `classId`        | string                                     | yes      | → `classes.id`                 |
| `subjectSlug`    | string                                     | yes      | → `subjects.slug`              |
| `teacherId`      | string                                     | yes      | → `teachers.id` (owner)        |
| `status`         | `"draft" \| "submitted" \| "published"`    | yes      | the workflow state             |
| `entries`        | `{ studentId, marks: 0–100 \| null, absent?: boolean }[]` | yes | null marks = absent from exam |
| `submittedAt`    | ISO timestamp                              | no       | set on draft → submitted       |
| `publishedAt`    | ISO timestamp                              | no       | set on submitted → published   |
| `createdAt`      | ISO timestamp                              | yes      |                                |
| `updatedAt`      | ISO timestamp                              | yes      | every save                     |

**Indexes:** `{ classId: subjectSlug, exam, academicYearId }` unique —
enforces "one sheet per class+subject+exam+year" at the database level.

**State machine** (enforced by both stores, defended again in the workflow
layer):

```text
draft ──(owning teacher)──► submitted ──(admin)──► published (immutable)
  ▲                              │
  └────────(admin return)────────┘
```

Rules: only the owning teacher may write drafts; submitting requires a mark
or absent flag for every rostered student; publishing/returning is
admin-only; published sheets refuse every write.

Seed coverage (2026 First Term): Ten Science all 7 subjects published; Ten
Business all 5 published; Nine Science Bangla/English/Mathematics published,
ICT submitted, Physics draft; Nine Business Bangla/English published,
Mathematics/ICT submitted. Plus the 2025 Annual (all published) for both Ten
classes — 33 sheets total.

---

## attendanceRecords

One record per **date + class + subject** (a class period's register),
written by the teacher who took it.

| Field              | Type                                        | Required | Notes            |
| ------------------ | ------------------------------------------- | -------- | ---------------- |
| `id`               | string                                      | yes      |                  |
| `date`             | `yyyy-mm-dd`                                | yes      | calendar day     |
| `classId`          | string                                      | yes      | → `classes.id`   |
| `subjectSlug`      | string                                      | yes      | → `subjects.slug`|
| `takenByTeacherId` | string                                      | yes      | → `teachers.id`  |
| `entries`          | `{ studentId, status: "present" \| "absent" \| "late" }[]` | yes | one per rostered student |

**Indexes:** `{ date: 1, classId: 1, subjectSlug: 1 }` unique — re-taking a
register replaces the same period, never duplicates it.

Analytics (`src/lib/attendance/analytics.ts`) compute per-student, monthly
and per-subject percentages from these rows; nothing is precomputed.

Seed: 344 records across Jan–Sep 2026 (whole school).

---

## notices

| Field         | Type                                      | Required | Notes                          |
| ------------- | ----------------------------------------- | -------- | ------------------------------ |
| `id`          | string                                    | yes      |                                |
| `title`       | string                                    | yes      |                                |
| `bodyMd`      | string (Markdown)                         | yes      | rendered as text in the list   |
| `audience`    | `"all" \| "teachers" \| "students" \| "class"` | yes | visibility rule (src/lib/notices/rules.ts) |
| `classId`     | string                                    | when audience="class" | → `classes.id`     |
| `authorId`    | string                                    | yes      | → `users.id`                   |
| `publishedAt` | ISO timestamp                             | yes      |                                |
| `priority`    | `"normal" \| "important"`                 | yes      | important notices get a badge  |

**Indexes:** `{ id: 1 }` unique.

---

## auditLogs

Append-only trail; rows are written **by the mutations themselves**
(`logAudit()` in `src/lib/audit/index.ts`), never fabricated or seeded beyond
the audited seed scenario.

| Field       | Type                         | Required | Notes                               |
| ----------- | ---------------------------- | -------- | ----------------------------------- |
| `id`        | string                       | yes      |                                     |
| `actorId`   | string                       | yes      | → `users.id`                        |
| `actorName` | string                       | yes      | denormalized for display            |
| `action`    | string                       | yes      | `<resource>.<verb>` naming          |
| `resource`  | string                       | yes      | e.g. `markSheet`, `settings`        |
| `resourceId`| string                       | yes      | affected document id                |
| `metadata`  | object (string keys)         | no       | e.g. `{ classId, subjectSlug, exam, academicYearId, note? }` |
| `createdAt` | ISO timestamp                | yes      |                                     |

**Indexes:** `{ createdAt: -1 }` — the admin audit page reads newest-first
with pagination (20/page) and filters by actor role (resolved against
`users`), action and inclusive date range.

Action vocabulary: `marksheet.save`, `marksheet.submit`,
`marksheet.publish`, `marksheet.return`, `attendance.save`, `notice.create`,
`settings.update`, `user.update`.

---

## settings

A single document (`id: "school"`) holding the school's configurable rules —
the reason grading thresholds are never hard-coded in the UI.

| Field                 | Type        | Required | Notes                                   |
| --------------------- | ----------- | -------- | --------------------------------------- |
| `id`                  | `"school"`  | yes      | singleton literal                       |
| `schoolName`          | string      | yes (default "EduTrack Demo School") | shown on dashboards + printed marksheets |
| `gradeBands`          | `{ min, max, grade, points }[]` | yes | contiguous, start at 0 (validated) |
| `failCapsGpa`         | boolean     | yes      | any F caps the term GPA at 0.00         |
| `attendanceWarnPercent` | int 0–100 | yes      | warning threshold for attendance alerts |

Default bands (spec 18.5): 80–100 A+ 5.00 · 70–79 A 4.00 · 60–69 A- 3.50 ·
50–59 B 3.00 · 40–49 C 2.00 · 33–39 D 1.00 · 0–32 F 0.00. Changes are made
on `/admin/settings`, validated (contiguity, coverage) and audited with the
previous + new bands in metadata. See
[grading-rules.md](grading-rules.md).

---

## Relationship map

```text
users 1──1 teachers   (users.linkedId / teachers.userId)
users 1──1 students   (users.linkedId / students.userId)
classes 1──* students (students.classId)
classes 1──1 teachers (classes.classTeacherId)
teachers *──* classes+subjects (teachers.classAssignments[])
students 1──* enrollments ──* academicYears   (per-year subject lists)
classes+subjects+exams+years 1──1 markSheets  (unique compound key)
markSheets *──1 teachers (owner)  *──* students (entries[])
classes+subjects+dates 1──1 attendanceRecords (*──1 teachers, *──* students)
classes 1──* notices (audience="class")
users 1──* auditLogs (actor)
```
