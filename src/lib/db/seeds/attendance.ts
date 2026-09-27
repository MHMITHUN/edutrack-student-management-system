import { CLASS_IDS } from "./catalog";
import { seedStudents, seedTeachers } from "./users";
import type { AttendanceEntry, AttendanceRecord } from "../types";

/**
 * Attendance seeds: April-May 2026 school days (Friday/Saturday skipped —
 * the Bangladeshi weekend) for every class, two subjects per class
 * (Mathematics and English, both taught across all four classes).
 *
 * Deterministic per-student presence rates around 90%; two students are
 * intentionally well below the 75% warning threshold so the alert is real:
 *   stu-007 (Nine Science, roll 7)  ~55%
 *   stu-057 (Ten Business, roll 12) ~62%
 * The demo student (stu-031) sits at a healthy ~94%.
 */

/** Subjects recorded per class, in entry order. */
const ATTENDANCE_SUBJECTS = ["mathematics", "english"] as const;

const LOW_ATTENDANCE_RATES: Record<string, number> = {
  "stu-007": 0.55,
  "stu-057": 0.62,
};

const PRESENCE_RATES: Record<string, number> = {
  "stu-031": 0.94,
};

function attendanceRate(studentId: string, roll: number, rng: () => number): number {
  if (LOW_ATTENDANCE_RATES[studentId] !== undefined) return LOW_ATTENDANCE_RATES[studentId];
  if (PRESENCE_RATES[studentId] !== undefined) return PRESENCE_RATES[studentId];
  // 0.86-0.97, stable per student but slightly subject to the day's draw.
  return 0.86 + (roll % 4) * 0.03 + rng() * 0.02;
}

/** School days April 1 - May 31 2026, skipping Fri (5) and Sat (6). */
function schoolDays(): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(2026, 3, 1));
  const end = new Date(Date.UTC(2026, 4, 31));
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 5 && day !== 6) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function teacherIdFor(classId: string, subjectSlug: string): string {
  const teacher = seedTeachers.find((t) =>
    t.classAssignments.some(
      (a) => a.classId === classId && a.subjectSlug === subjectSlug,
    ),
  );
  if (!teacher) {
    throw new Error(`No teacher assigned for ${classId}/${subjectSlug} in seeds.`);
  }
  return teacher.id;
}

function buildAttendanceRecords(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const days = schoolDays();
  const classes = [
    CLASS_IDS.nineScience,
    CLASS_IDS.nineBusiness,
    CLASS_IDS.tenScience,
    CLASS_IDS.tenBusiness,
  ];
  let seq = 0;

  for (const classId of classes) {
    const roster = seedStudents
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.roll - b.roll);
    for (const subjectSlug of ATTENDANCE_SUBJECTS) {
      const takenByTeacherId = teacherIdFor(classId, subjectSlug);
      for (const date of days) {
        seq += 1;
        const entries: AttendanceEntry[] = roster.map((student) => {
          const rng = makeRng(hashSeed(`${student.id}|${subjectSlug}|${date}`));
          const rate = attendanceRate(student.id, student.roll, rng);
          const present = rng() < rate;
          if (!present) return { studentId: student.id, status: "absent" as const };
          // A few of those present arrive late.
          return {
            studentId: student.id,
            status: rng() < 0.06 ? ("late" as const) : ("present" as const),
          };
        });
        records.push({
          id: `att-${String(seq).padStart(4, "0")}`,
          date,
          classId,
          subjectSlug,
          takenByTeacherId,
          entries,
        });
      }
    }
  }
  return records;
}

export const seedAttendanceRecords: AttendanceRecord[] = buildAttendanceRecords();
