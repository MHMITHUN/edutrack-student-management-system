import type { NextRequest } from "next/server";
import { apiGuard } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { csvResponse, csvTimestamp, toCsv } from "@/lib/csv";
import { buildStudentTermResult } from "@/lib/marks/results";
import type { Exam } from "@/lib/db/types";
import { ExamSchema } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const isExam = (value: string): value is Exam =>
  (ExamSchema.options as readonly string[]).includes(value);

/**
 * Admin CSV export of one class's results for one published exam+year:
 * one row per student with every subject's marks/grade/points plus the term
 * GPA. Only PUBLISHED sheets are read — same rule the student UI follows.
 */
export async function GET(req: NextRequest) {
  const guard = await apiGuard(req, ["ADMIN"]);
  if ("response" in guard) return guard.response;

  const params = req.nextUrl.searchParams;
  const classId = params.get("class") ?? "";
  const examParam = params.get("exam") ?? "";
  const yearId = params.get("year") ?? "";
  if (!classId || !isExam(examParam) || !yearId) {
    return Response.json(
      { error: "Provide class, exam and year query parameters." },
      { status: 400 },
    );
  }
  const exam: Exam = examParam;

  const store = await getStore();
  const [classes, subjects, settings, roster, sheets] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
    store.getSettings(),
    store.listStudentsByClass(classId),
    store.listMarkSheets({ classId, exam, academicYearId: yearId, status: "published" }),
  ]);
  if (sheets.length === 0) {
    return Response.json(
      { error: "No published result sheets for that class, exam and year." },
      { status: 404 },
    );
  }

  const klass = classes.find((c) => c.id === classId);
  const classLabel = klass ? `${klass.name}-${klass.section}` : classId;
  const subjectColumns = subjects
    .filter((subject) => sheets.some((s) => s.subjectSlug === subject.slug))
    .sort((a, b) => a.code.localeCompare(b.code));

  const rows = roster.map((student) => {
    const result = buildStudentTermResult(sheets, student.id, subjects, settings);
    const bySlug = new Map(result.subjects.map((s) => [s.subjectSlug, s]));
    const marks = subjectColumns.map((subject) => {
      const cell = bySlug.get(subject.slug);
      if (!cell) return "";
      return cell.absent ? "Absent" : `${cell.marks} (${cell.grade})`;
    });
    return [student.roll, student.name, ...marks, result.gpa.toFixed(2), result.grade];
  });

  const csv = toCsv(
    ["Roll", "Student", ...subjectColumns.map((s) => `${s.name} (${s.code})`), "GPA (5.00)", "Grade"],
    rows,
  );
  const yearLabel = (await store.listAcademicYears()).find((y) => y.id === yearId)?.label ?? yearId;
  return csvResponse(
    `edutrack-results-${classLabel}-${examParam.replace(/\s+/g, "-").toLowerCase()}-${yearLabel}-${csvTimestamp()}.csv`,
    csv,
  );
}
