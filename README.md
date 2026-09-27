# EduTrack — Student Management System

A production-style student information system for a school: marks entry with a
teacher → review → publish workflow, a configurable grading engine (GPA),
attendance with analytics, notices, role dashboards, CSV export, printable
marksheets and a full audit trail. Built as the portfolio's strongest
database-oriented project — every number on screen derives from the store via
real logic.

Fictional institution: **EduTrack Demo School**, academic year **2026**.

## Live Demo

<!-- TODO: replace with the deployed URL after the Vercel step (see
     docs/deployment.md). The demo deployment runs in Demo mode: the
     in-memory store seeds itself and resets on redeploy. -->

- **URL:** _deployment pending — see [docs/deployment.md](docs/deployment.md)_
- Mode: zero-config Demo store (no database required), demo accounts below.

## Screenshots

Screenshots live in [`docs/screenshots/`](docs/screenshots/), captured from a
running dev server via `node scripts/screenshots.mjs`:

| File                  | Shows                                                                |
| --------------------- | -------------------------------------------------------------------- |
| `01-login.png`        | `/login` — the only public page                                      |
| `02-marks-entry.png`  | Teacher marks entry: roster grid with marks being typed in           |
| `03-student-dashboard.png` | Student dashboard: computed GPA, attendance, GPA trend chart    |
| `04-mobile.png`       | Student dashboard at phone width (390x844)                           |
| `05-admin.png`        | Admin dashboard: KPI cards, grade distribution, attendance trend     |

## Problem

Schools in Bangladesh run marks, attendance and notices across spreadsheets
and paper. That makes results slow to compile, GPA error-prone, attendance
warnings invisible until it is too late, and "who changed what" unanswerable.
EduTrack models the real domain: classes, subjects, teacher assignments,
enrollments, a controlled marks workflow (teachers enter → admin reviews →
results publish), computed GPA, per-student attendance analytics and an audit
trail written by every mutation.

## Educational Objective

This project demonstrates that the author can build a **data-first
information system**, not just pages: schema design (12 collections, indexes,
relationships), a workflow state machine (draft → submitted → published),
server-side authorization tied to domain assignments (a teacher only touches
*their* class+subject), one reusable grading engine configurable by the
school, and analytics computed from stored records — the skills a CSE
lecturer teaches in a database or software-engineering course, applied end to
end.

## Features

- **Marks workflow (the core):** teachers pick class → subject → exam → year,
  enter marks on the class roster (blank cells allowed in drafts, absent
  flags supported, ↑/↓ keyboard navigation between inputs), save drafts and
  submit for review. Admins review submitted sheets, publish (immutable,
  visible to students) or return them to the teacher with a note.
- **Grading engine:** one module maps marks → grade → grade points using
  school-configurable bands (default: national 80/70/60/50/40/33 scale).
  Term GPA is computed from published entries; an optional rule caps GPA at
  0.00 when any subject is failed (board practice).
- **Attendance:** teachers record per-subject daily attendance (present /
  absent / late) for their classes; monthly and per-subject percentages and
  warning thresholds are computed. No individual student's attendance is ever
  public.
- **Analytics dashboards:** admin (KPIs, grade distribution, class GPA,
  attendance trend), teacher (assignments, pending sheets, attendance alerts),
  student (current GPA, attendance, GPA trend across exams, recent notices, a
  recommended next action derived from those same numbers).
- **Notices:** admins publish school-wide/audience notices; teachers publish
  class notices; students see only notices addressed to them.
- **Printable marksheet:** institutional header, student details, subject
  table, GPA, issue date and a deterministic verification ID, with a print
  stylesheet (`@media print`).
- **Audit log:** every mutation (mark sheet save/submit/publish/return,
  attendance save, notice create, settings update, user create/update) writes
  an audit row; the admin page filters by actor role, action and date range.
- **CSV export:** students, published results and attendance (guarded API
  routes; teachers can only export their own classes).
- **User management:** admins create users and enable/disable accounts
  (disabled accounts cannot sign in; self-disable is blocked).

## Technology Stack

| Layer      | Technology                                       |
| ---------- | ------------------------------------------------ |
| Framework  | Next.js 16.3.6 (App Router, server actions, RSC) |
| UI         | React 19.3.0, Tailwind CSS v4.3 (`@theme` tokens, no config file), lucide-react 1.x, Recharts 3.10.1 |
| Language   | TypeScript 5.9.3 (strict)                        |
| Validation | Zod 4.6 (schemas at every store boundary)        |
| Database   | MongoDB driver 7.6 (dual-mode store — see below) |
| Auth       | scrypt password hashing + HMAC-SHA256 signed session cookie (node:crypto only) |
| Testing    | Vitest 5 (unit), Playwright 1.63 (e2e)           |
| Tooling    | ESLint 9.39 (flat config), Prettier 3            |

## Architecture

Next.js App Router throughout — pages are React Server Components that read
through the store directly; **all mutations are server actions** that
re-authenticate, enforce domain rules via the workflow layer, write an audit
row and revalidate. There is no REST layer to keep in sync and no
`middleware.ts`; every protected surface guards itself.

```text
 Browser
   │  cookies (HMAC-signed session)
   ▼
 Next.js App Router
   ├── RSC pages  (src/app/**)          reads via guards + store
   ├── Server Actions (src/app/actions) writes: guard → workflow → store → audit
   └── Route handlers (src/app/api/export/*)  CSV, guarded by role/assignment
   │
   ▼
 Auth guards (src/lib/auth/guards.ts)
   getSessionUser / requireRole / apiGuard   — roles: ADMIN | TEACHER | STUDENT
   │
   ▼
 Domain rules (src/lib/marks/workflow.ts, src/lib/attendance/service.ts, …)
   state machine · teacher-assignment check · roster validation
   │                              │
   ▼                              ▼
 Store interface (src/lib/db)     Audit trail (src/lib/audit)
   ├── DemoStore  (no env: in-memory, lazily seeded)
   └── MongoStore (MONGODB_URI: driver 7.6, zod-parsed at the boundary)
```

Key ideas:

- **Dual-mode store.** One `Store` interface, two implementations. DemoStore
  seeds itself lazily on first access (globalThis singleton) and resets on
  restart; MongoStore is used when `MONGODB_URI` is set. Pages never know
  which one is behind them.
- **Defense in depth.** Authorization is enforced at the page guard, again in
  the action, and the store itself refuses illegal state transitions
  (e.g. editing a submitted sheet, another teacher touching a colleague's
  sheet).
- **Audit everything.** `logAudit()` is called by every mutation right after
  the store write succeeds — rows are never fabricated.

## Database Model

12 collections (the spec's 11 plus the `settings` singleton). Full field
documentation: [docs/database-schema.md](docs/database-schema.md).

| Collection          | Purpose                        | Key indexes                                          |
| ------------------- | ------------------------------ | ---------------------------------------------------- |
| `users`             | accounts + role + status       | `{email}` unique                                     |
| `teachers`          | faculty directory + assignments| `{userId}` unique                                    |
| `students`          | school roll, guardian info     | `{classId, roll}` unique, `{userId}`                 |
| `classes`           | Class Nine/Ten × Science/Business | `{id}` unique                                     |
| `subjects`          | 8 subjects with codes          | `{slug}` unique                                      |
| `academicYears`     | 2025, 2026 (one active)        | `{id}` unique                                        |
| `enrollments`       | student × year × subjects      | `{id}` unique                                        |
| `markSheets`        | marks per class+subject+exam+year | `{classId, subjectSlug, exam, academicYearId}` unique |
| `attendanceRecords` | daily per-subject attendance   | `{date, classId, subjectSlug}` unique                |
| `notices`           | audience-targeted notices      | `{id}` unique                                        |
| `auditLogs`         | actor/action/resource + metadata | `{createdAt: -1}`                                  |
| `settings`          | singleton: school name, grade bands, thresholds | `{id}` (= "school") |

Relationships: `users.linkedId → teachers.id | students.id`;
`students.classId → classes.id`; `teachers.classAssignments[] →
{classId, subjectSlug}`; `enrollments.studentId → students.id`;
`markSheets.{classId, subjectSlug, teacherId}` → classes/subjects/teachers;
`attendanceRecords` and `notices` reference classes/teachers the same way.
All IDs are human-readable strings (`stu-031`, `cls-10-science`, `ms-016`).

## Authentication & Authorization

Three roles, enforced server-side everywhere (the client is never trusted):

- **ADMIN** — user management, class/subject/teacher directories, marks
  review + publish, school-wide notices, settings (grade bands), audit log,
  all CSV exports.
- **TEACHER** — only *their assigned* class+subject: marks entry
  (draft/submit), attendance for their classes, class notices, their
  dashboard with alerts.
- **STUDENT** — own profile, **published results only**, own GPA and
  attendance, notices addressed to them, printable marksheet (own only).

Enforcement points:

1. **Page guards** — `requireRole(["ADMIN"], …)` in every server component;
   wrong role → `/403`, anonymous → `/login`.
2. **Route-handler guard** — `apiGuard()` returns 401/403 JSON for the CSV
   export routes; teachers may export attendance only for their own classes.
3. **Action guards** — every server action re-authenticates before touching
   the store.
4. **Workflow rules** — `src/lib/marks/workflow.ts` re-checks the teacher's
   assignment on every save; publishing/returning is admin-only; submitted
   and published sheets are locked.
5. **Store invariants** — unique sheet key per class+subject+exam+year; only
   the owning teacher's writes are accepted.
6. **Student visibility** — student pages query with `status: "published"`
   at the store level, so drafts/submitted sheets cannot leak.

Capability matrix with per-route enforcement:
[docs/roles.md](docs/roles.md).

## Testing

- **Unit (Vitest, 15 files / 183 tests):** grading engine (bands, fail-cap,
  absent handling), marks workflow state machine + assignment enforcement,
  attendance analytics, notices visibility rules, settings auditing, CSV
  escaping, auth password hashing, session tokens (roundtrip, tamper,
  expiry, schema), login action (validation, disabled account blocked,
  cookie + redirect targets), role guards (`apiGuard` 401/403 responses,
  page-guard redirects), enrollment integrity (own-class sheets only,
  entries ⊆ roster, exact demo GPA) and store behavior for both store
  families' shared contract.
- **End-to-end (Playwright, `tests/e2e/smoke.spec.ts`):** anonymous redirect,
  student login → computed GPA + attendance, published results + printable
  marksheet with verification ID, teacher marks entry → save draft, admin
  review → publish, audit log listing the publish — with a no-console-errors
  assertion on every flow.

```bash
npm run test       # vitest watch
npm run test:run   # vitest run (CI mode)
npm run test:e2e   # playwright (starts dev server on :3003)
```

## Local Development

```bash
npm install
npm run dev        # http://localhost:3003 (dev script pins port 3003)
```

Without `MONGODB_URI` the app runs in **Demo mode**: an in-memory store seeds
itself lazily (1 admin, 6 teachers, 60 students, 4 classes, 8 subjects,
33 mark sheets, 344 attendance records, 70 audit rows) and resets on
restart. Every page labels this honestly.

Other scripts:

| Command             | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `npm run lint`      | ESLint 9                                    |
| `npm run typecheck` | `tsc --noEmit` (strict)                     |
| `npm run build`     | Production build                            |
| `npm run seed`      | Idempotent MongoDB seeding (no-op in demo)  |
| `npm run format`    | Prettier                                    |

## Environment Variables

Copy `.env.example` to `.env`:

| Variable           | Required | Default                  | Purpose                                        |
| ------------------ | -------- | ------------------------ | ---------------------------------------------- |
| `MONGODB_URI`      | no       | _(unset → Demo mode)_    | MongoDB connection string                      |
| `MONGODB_DB_NAME`  | no       | `edutrack_sms`           | Database name when Mongo is used               |
| `SESSION_SECRET`   | in production | demo fallback       | HMAC key signing session cookies — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Never commit real secrets; `.env` is gitignored.

## Deployment

Deploys to **Vercel with zero environment variables** (Demo mode — the
in-memory store seeds itself; data resets on redeploy/cold start, which the
UI labels honestly). For persistent data, provision MongoDB Atlas, set
`MONGODB_URI` (+ `SESSION_SECRET`), run `npm run seed` once against the
database, and redeploy. Step-by-step guide including smoke test and
rollback: [docs/deployment.md](docs/deployment.md).

## Demo Accounts

All demo accounts use the password **`Demo@12345`** (obviously fictional —
never reuse real credentials):

| Email                       | Role    | Who                                          | Lands on   |
| --------------------------- | ------- | -------------------------------------------- | ---------- |
| `admin@demo.local`          | ADMIN   | Md. Rafiqul Islam                            | `/admin`   |
| `teacher@demo.local`        | TEACHER | Asha Khatun — Bangla, all four classes       | `/teacher` |
| `student@demo.local`        | STUDENT | Rakib Hasan — Class Ten Science, roll 1      | `/student` |
| `shamima.akter@demo.local`  | TEACHER | Science teacher (Physics/Chemistry/Biology)  | `/teacher` |
| `tanvir.ahmed@demo.local`   | TEACHER | ICT teacher                                  | `/teacher` |
| `payel.sen@std.demo.local`  | STUDENT | Payel Sen — Class Ten Business Studies       | `/student` |

Suggested demo storyline: sign in as the teacher → enter Half Yearly marks
for Class Nine (Science) Bangla → submit → sign in as admin → review and
publish → sign in as a Class Nine student → see the new published result
appear.

## Known Limitations

- **Demo store resets.** Without `MONGODB_URI` all data is in-memory and
  disappears on restart/redeploy; the demo banner says so on every page.
- **Verification ID is a demo lookup key, not cryptography.** It is a
  deterministic SHA-256-derived hash of student+exam+year for spotting typos
  when comparing two printouts — not an anti-forgery seal.
- **No email/SMTP.** Notices are in-app only; `SMTP_*` env vars are reserved
  for a future notification feature and intentionally unimplemented.
- Sessions are stateless signed cookies (7 days); revoking a user disables
  their account at the next request (the store is re-checked), but existing
  tokens are not tracked server-side.
- Playwright smoke tests assume a freshly seeded Demo store (restart the dev
  server before re-running them).

## Future Enhancements

- CSV **import** for students/marks (export already exists).
- A **guardian role** with read-only views of one student's results and
  attendance.
- Email notifications via the reserved `SMTP_*` configuration.
- Timetable and syllabus modules; per-term report card PDF (beyond print CSS).

## Teaching Use Cases

- **Database course:** schema design, unique compound indexes (class+roll,
  class+subject+exam+year), relationships without foreign keys, when
  denormalizing metadata into audit rows helps.
- **Software engineering:** a workflow state machine (draft → submitted →
  published → immutable), authorization as a layered concern, audit trails
  as a system feature.
- **Web development:** server actions vs REST, server components reading
  data, dual-mode persistence for demos.
- **Grading analytics:** how a configurable grading engine avoids hard-coded
  business rules (change the bands in Settings and every grade on every page
  follows).

## Interview Talking Points

- "Walk me through publishing a result" — teacher saves draft → submits
  (locked) → admin reviews → publish (immutable, audited, visible to
  students). Every transition is validated at three layers.
- "How do you prevent a teacher editing another class's marks?" — assignment
  re-checked server-side on every write; the store also refuses a second
  teacher touching a colleague's sheet.
- "Where is GPA computed?" — one grading module (`src/lib/grading`), bands
  from school settings; fail-cap rule configurable; unit-tested at band
  boundaries; no grade is ever stored, so re-configuring bands re-grades
  history consistently.
- "How do you trust your numbers?" — audit rows are written by the mutations
  themselves; dashboards aggregate the same store the pages read; e2e tests
  pin exact seeded values (GPA 4.71, verification ID) so drift fails CI.
- "Why dual-mode storage?" — zero-setup demo (Vercel with no env) and real
  persistence behind one interface; zod parsing keeps the Mongo boundary
  honest.

## License

MIT — see [LICENSE](LICENSE).
