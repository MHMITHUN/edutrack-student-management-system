# Grading Rules

Every grade and every GPA in EduTrack comes from **one module** —
[`src/lib/grading/index.ts`](../src/lib/grading/index.ts) — fed by the
school's configured bands. Bands are **never** hard-coded in the UI, so an
administrator can re-grade the whole school from the Settings page without a
code change.

## Default grade bands

The seeded default follows the Bangladeshi board scale (spec 18.5), stored in
the `settings` document:

| Marks (written) | Grade | Points (GPA, 5.00 scale) |
| --------------: | :---: | -----------------------: |
| 80 – 100        | A+    | 5.00                     |
| 70 – 79         | A     | 4.00                     |
| 60 – 69         | A-    | 3.50                     |
| 50 – 59         | B     | 3.00                     |
| 40 – 49         | C     | 2.00                     |
| 33 – 39         | D     | 1.00                     |
| 0 – 32          | F     | 0.00                     |

A subject is **failed** when its band carries `0.00` points (the F band).
`gradeFromMark(marks, bands)` finds the band containing the mark and throws
(a loud configuration error, surfaced to the admin) if no band covers it —
band tables must be contiguous from 0 to 100.

## Term GPA rule

Given the subject evaluations of one exam (a "term"):

1. **Absent examinees** are graded as a fail with 0.00 points — the UI always
   labels them "Absent" honestly, but the GPA treats absence as forfeiting
   the subject (board practice).
2. **Fail-cap (default ON):** when `settings.failCapsGpa` is `true` and *any*
   subject failed, the term GPA is exactly **0.00** with term grade **F**.
   This mirrors board practice where a failed subject voids the term GPA.
3. Otherwise the GPA is the **average of subject points**, rounded to two
   decimals (half-up, floating-point-safe: `round2`), mapped to a letter via
   the standard 5.00-scale table (≥5 A+, ≥4 A, ≥3.5 A-, ≥3 B, ≥2 C, ≥1 D,
   else F).
4. An empty subject list yields GPA 0.00 with grade "—" (shown as "no
   published results yet", never as a real fail).

Worked example (seeded demo student, Class Ten Science, First Term 2026):
seven published subjects averaging 4.71 points → GPA **4.71**, grade **A**.
Had one subject been an F, the fail-cap would make it 0.00/F with the failed
count shown next to it.

## Configurability

Administrators edit the bands at **`/admin/settings`** (ADMIN only):

- The editor (`GradeBandsEditor`) edits `min / max / grade / points` rows.
- Saving runs two validations:
  - `validateBands()` — admin-facing messages for: lowest band must start at
    0, bands must be contiguous (`next.min === prev.max + 1`), no
    max < min, highest band must end at 100.
  - `SettingsSchema` (zod) — the same contiguity enforced at the schema
    level, plus point range 0–5.
- The **fail-cap** toggle and the **attendance warning threshold** live next
    to the bands in the same document.
- Every change is audited (`settings.update`) with the **previous and new**
    bands in the audit metadata, so a re-grade is traceable.

Because grades are computed on read (never stored on students or sheets), a
band change instantly re-grades every existing mark sheet, dashboard and
printed marksheet consistently.

## Where the engine is used

| Surface                                | Call                                            |
| -------------------------------------- | ----------------------------------------------- |
| Student results / dashboard / print    | `evaluateSubject` + `termGpa` via `buildStudentTermResult` |
| Teacher marks entry (live grade column)| `evaluateSubject`                               |
| Admin review page (grade/points)       | `evaluateSubject`                               |
| Admin analytics (grade distribution)   | `evaluateSubject` over published sheets         |

## Tests

`tests/grading.test.ts` pins the engine: every band boundary (79 vs 80, 32
vs 33, …), the absent rule, the fail-cap on/off behavior, rounding, and
rejection of gapped band tables. `tests/settings-audit.test.ts` covers band
validation + auditing; `tests/enrollment-integrity.test.ts` pins the demo
student's exact computed GPA (4.71) against the seed.
