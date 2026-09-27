# Roles & Authorization

Three roles: **ADMIN**, **TEACHER**, **STUDENT**. This document is the
capability matrix and — more importantly — *where* each rule is enforced.
The client is never trusted: every page, action and route handler
re-authenticates server-side.

## Authentication in one paragraph

Passwords are scrypt-hashed (`scrypt$salt$hash`, node:crypto). Login issues a
stateless session cookie (`edutrack_session`): base64url payload + HMAC-SHA256
signature, 7-day expiry. On every request `getSessionUser()` verifies the
signature and expiry, loads the user from the store and rejects the session
if the account is **disabled** or its **stored role changed** (the store is
the source of truth, the token is just a claim). There is no `middleware.ts`
by design — each protected surface guards itself, which keeps the
authorization decision next to the data it protects.

## Capability matrix

| Capability                                  | ADMIN | TEACHER | STUDENT |
| ------------------------------------------- | :---: | :-----: | :-----: |
| View own role dashboard/analytics           | ✓     | ✓       | ✓       |
| User management (create, enable/disable)    | ✓     |         |         |
| Class / subject / teacher directories       | ✓     | view    |         |
| Marks entry (draft, submit) for **assigned** class+subject | | ✓ | |
| Marks entry for any other class+subject     |       | ✗       |         |
| Marks review queue, publish, return         | ✓     |         |         |
| See draft / submitted sheets                | ✓     | own     |         |
| See **published** results                   | ✓     |         | ✓ (own class) |
| Printable marksheet                         | ✓ (any student) |  | ✓ (own only) |
| Attendance recording                        |       | ✓ own classes |   |
| Attendance analytics                        | ✓ school-wide | ✓ own classes | ✓ own |
| Notices: school-wide / teachers audience    | ✓     |         |         |
| Notices: own classes                        |       | ✓       |         |
| Notices: read                               | ✓     | ✓       | ✓ (addressed to them) |
| School settings (grade bands, thresholds)   | ✓     |         |         |
| Audit log                                   | ✓     |         |         |
| CSV export students / results               | ✓     |         |         |
| CSV export attendance                       | ✓     | ✓ **own classes only** | |

## Enforcement points (in order of a request's life)

### 1. Page guards — `src/lib/auth/guards.ts`

Every protected server component starts with:

```ts
const user = await requireRole(["TEACHER"], "/teacher/marks");
```

- Anonymous → redirect `/login?next=<return-path>`.
- Signed in with the wrong role → redirect `/403`.
- Area routing: `/admin/**` requires ADMIN, `/teacher/**` TEACHER,
  `/student/**` STUDENT (the printable marksheet accepts STUDENT **or**
  ADMIN — see below).

### 2. Route-handler guard — `apiGuard()`

The CSV export routes (`src/app/api/export/*`) call
`apiGuard(request, roles)`:

- No/invalid session → **401** `{ "error": "Authentication required." }`
- Wrong role → **403** `{ "error": "You do not have permission to do that." }`

Unit-tested response shapes in `tests/auth-guards.test.ts`.

### 3. Server actions re-authenticate

Every action in `src/app/actions/*` starts with `requireRole(...)` — the UI
hiding a button is never the only barrier. A disabled account fails here
too, because the session is re-resolved against the store on every call.

### 4. Domain/workflow rules — `src/lib/marks/workflow.ts`

The **teacher-assignment rule**: a teacher may only enter marks for a
class+subject pair present in *their* `teacher.classAssignments`, re-checked
on **every** save/submit:

```text
saveMarkSheetDraft/submitMarkSheet:
  actor.role === "TEACHER"                    (admins cannot enter marks)
  assignment ∈ teacher.classAssignments       (their load, not a claim)
  entries ⊆ rosterFor(class, year)            (no foreign students)
  submit: full roster coverage                (marks or absent for everyone)

publishMarkSheet / returnMarkSheet:
  actor.role === "ADMIN"                      (teachers cannot publish)
```

Violations throw `MarksWorkflowError` with kind `forbidden` / `invalid` /
`conflict` — surfaced as form errors, never crashes.

The printable marksheet (`/student/results/[exam]/print`) resolves its
subject from the session: a STUDENT always gets *their own* record (any
`?student=` parameter is ignored); an ADMIN must pass `?student=<id>`
explicitly and still only ever reads **published** sheets.

### 5. Store invariants — the last line of defense

Both stores refuse illegal operations regardless of who asks:

- Sheet key `classId+subjectSlug+exam+academicYearId` is unique — a second
  sheet for the same tuple cannot exist.
- `upsertMarkSheetDraft` rejects when the sheet is `submitted` ("locked for
  review") or `published` ("can no longer be changed"), and when the writer
  is not the teacher recorded on the sheet ("Only the teacher assigned…").
- `submitMarkSheet` only works from `draft`; `publishMarkSheet` and
  `returnMarkSheetForRevision` only from `submitted`.

### 6. Student visibility — published-only queries

Student pages never fetch "all sheets and filter in the UI". They call the
store with `status: "published"` and the student's own `classId`, so drafts
and submitted sheets cannot leak even if a page were miswritten; the result
builder (`buildStudentTermResult`) additionally ignores sheets that carry no
entry for that student (another class's sheet simply produces no rows).

## What deliberately has NO client-side trust

- Exam/class/subject selectors on `/teacher/marks` only *list* the teacher's
  assignments — a forged form posting someone else's class+subject is
  rejected by rule 4 and the store (rule 5).
- Mark values are re-parsed and range-checked server-side (0–100, absent
  normalization).
- The `?next=` login redirect only accepts same-site absolute paths (no
  `//host`, no `https://…`).
- Role in the session token is cross-checked against the stored user on
  every request — a stale/forged token with an escalated role fails closed.

## Where to look in the code

| Concern                     | File                                         |
| --------------------------- | -------------------------------------------- |
| Session issue/verify        | `src/lib/auth/session.ts`                    |
| Password hashing            | `src/lib/auth/password.ts`                   |
| Guards (page + API)         | `src/lib/auth/guards.ts`                     |
| Marks state machine + rules | `src/lib/marks/workflow.ts`                  |
| Attendance service          | `src/lib/attendance/service.ts`              |
| Notice visibility           | `src/lib/notices/rules.ts`                   |
| Store invariants            | `src/lib/db/demo-store.ts`, `src/lib/db/mongo.ts` |
| Guard/response tests        | `tests/auth-guards.test.ts`, `tests/auth-login.test.ts`, `tests/marks-workflow.test.ts` |
