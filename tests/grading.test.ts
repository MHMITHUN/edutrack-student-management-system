import { describe, it, expect } from "vitest";
import { DEFAULT_GRADE_BANDS } from "@/lib/db/types";
import {
  evaluateSubject,
  gradeFromGpa,
  gradeFromMark,
  termGpa,
  validateBands,
} from "@/lib/grading";

/**
 * Grading engine unit tests (spec 18.5): the full band table including every
 * boundary, absent handling, GPA averaging with and without the fail cap,
 * and the band-table validator. Pages must never hardcode these values.
 */

describe("gradeFromMark — full band table", () => {
  const cases: Array<[number, string, number]> = [
    [100, "A+", 5],
    [80, "A+", 5],
    [79, "A", 4],
    [70, "A", 4],
    [69, "A-", 3.5],
    [60, "A-", 3.5],
    [59, "B", 3],
    [50, "B", 3],
    [49, "C", 2],
    [40, "C", 2],
    [39, "D", 1],
    [33, "D", 1],
    [32, "F", 0],
    [0, "F", 0],
  ];

  it.each(cases)("%i -> %s (%.2f points)", (marks, grade, points) => {
    const result = gradeFromMark(marks, DEFAULT_GRADE_BANDS);
    expect(result.grade).toBe(grade);
    expect(result.points).toBe(points);
    expect(result.fail).toBe(points === 0);
  });

  it("throws when no band covers the mark (broken settings)", () => {
    const bands = DEFAULT_GRADE_BANDS.filter((b) => b.grade !== "A+");
    expect(() => gradeFromMark(95, bands)).toThrow(/No grade band covers/);
  });
});

describe("evaluateSubject — absent handling", () => {
  it("treats null marks as absent, honestly labelled and graded as a fail", () => {
    const result = evaluateSubject(null, DEFAULT_GRADE_BANDS);
    expect(result.absent).toBe(true);
    expect(result.grade).toBe("—");
    expect(result.points).toBe(0);
    expect(result.fail).toBe(true);
  });

  it("evaluates a written mark normally", () => {
    expect(evaluateSubject(85, DEFAULT_GRADE_BANDS)).toMatchObject({
      marks: 85,
      absent: false,
      grade: "A+",
      points: 5,
      fail: false,
    });
  });
});

describe("termGpa — averaging and the fail cap", () => {
  const bands = DEFAULT_GRADE_BANDS;

  it("averages subject points (A+ and A -> 4.50)", () => {
    const subjects = [evaluateSubject(90, bands), evaluateSubject(75, bands)];
    const result = termGpa(subjects, { failCapsGpa: false });
    expect(result.gpa).toBe(4.5);
    expect(result.grade).toBe("A");
    expect(result.failedSubjects).toBe(0);
    expect(result.subjectCount).toBe(2);
  });

  it("fail cap ON: any failed subject caps the GPA at 0.00 (board practice)", () => {
    const subjects = [evaluateSubject(90, bands), evaluateSubject(20, bands)];
    const result = termGpa(subjects, { failCapsGpa: true });
    expect(result.gpa).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.failedSubjects).toBe(1);
  });

  it("fail cap OFF: the same sheets average to 2.50", () => {
    const subjects = [evaluateSubject(90, bands), evaluateSubject(20, bands)];
    const result = termGpa(subjects, { failCapsGpa: false });
    expect(result.gpa).toBe(2.5);
    expect(result.grade).toBe("C");
    expect(result.failedSubjects).toBe(1);
  });

  it("absent subjects count as a fail for the cap", () => {
    const subjects = [evaluateSubject(90, bands), evaluateSubject(null, bands)];
    const result = termGpa(subjects, { failCapsGpa: true });
    expect(result.gpa).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.failedSubjects).toBe(1);
  });

  it("handles an empty subject list without dividing by zero", () => {
    const result = termGpa([], { failCapsGpa: true });
    expect(result.gpa).toBe(0);
    expect(result.subjectCount).toBe(0);
  });
});

describe("gradeFromGpa — GPA to letter grade", () => {
  const cases: Array<[number, string]> = [
    [5, "A+"],
    [4.99, "A"],
    [4, "A"],
    [3.99, "A-"],
    [3.5, "A-"],
    [3.49, "B"],
    [3, "B"],
    [2.99, "C"],
    [2, "C"],
    [1.99, "D"],
    [1, "D"],
    [0.99, "F"],
    [0, "F"],
  ];

  it.each(cases)("gpa %.2f -> %s", (gpa, grade) => {
    expect(gradeFromGpa(gpa)).toBe(grade);
  });
});

describe("validateBands — band table structure", () => {
  it("accepts the default school bands", () => {
    expect(validateBands(DEFAULT_GRADE_BANDS)).toEqual({ ok: true });
  });

  it("rejects a gap between bands (79 -> 81)", () => {
    const bands = [
      { min: 80, max: 100, grade: "A+", points: 5 },
      { min: 0, max: 79, grade: "F", points: 0 },
      { min: 81, max: 82, grade: "X", points: 1 },
    ];
    const result = validateBands(bands);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/contiguous|below min/i);
  });

  it("rejects a table that does not start at 0", () => {
    const bands = DEFAULT_GRADE_BANDS.filter((b) => b.grade !== "F");
    const result = validateBands(bands);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/start at 0/i);
  });

  it("rejects a table that does not reach 100", () => {
    const bands = DEFAULT_GRADE_BANDS.filter((b) => b.grade !== "A+");
    const result = validateBands(bands);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/end at 100/i);
  });

  it("rejects an empty table", () => {
    expect(validateBands([]).ok).toBe(false);
  });
});
