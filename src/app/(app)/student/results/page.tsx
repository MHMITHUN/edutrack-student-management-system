import type { Metadata } from "next";
import { Award } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import type { MarkSheet } from "@/lib/db/types";
import { buildStudentTermResult } from "@/lib/marks/results";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LabeledSelect,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";
import { formatDate, searchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

export default async function StudentResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["STUDENT"], "/student/results");
  const sp = await searchParams;
  const store = await getStore();

  const student = await store.getStudentByUserId(user.id);
  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Results" description="Published exam results for your class." />
        <EmptyState
          title="No student profile"
          description="Your account is not linked to a student record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  const [subjects, settings, years] = await Promise.all([
    store.listSubjects(),
    store.getSettings(),
    store.listAcademicYears(),
  ]);

  // ONLY published sheets are ever fetched for a student — the store query
  // enforces it, so drafts/submitted sheets cannot leak into this page.
  const published = await store.listMarkSheets({
    classId: student.classId,
    status: "published",
  });

  if (published.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Results" description="Published exam results for your class." />
        <EmptyState
          icon={Award}
          title="No published results yet"
          description="Your marks, grades and GPA appear here as soon as the administration publishes a result sheet. Nothing is shown before publishing — draft and submitted mark sheets stay private."
        />
      </div>
    );
  }

  // Distinct exam+year options, newest publication first.
  const terms = [...published.reduce((map, sheet) => {
    const key = `${sheet.exam}|${sheet.academicYearId}`;
    if (!map.has(key)) map.set(key, { key, sheet });
    const current = map.get(key)!;
    if (sheet.publishedAt && (!current.sheet.publishedAt || sheet.publishedAt > current.sheet.publishedAt)) {
      map.set(key, { key, sheet });
    }
    return map;
  }, new Map<string, { key: string; sheet: MarkSheet }>()).values()].sort((a, b) =>
    (b.sheet.publishedAt ?? "").localeCompare(a.sheet.publishedAt ?? ""),
  );

  const requestedTerm = searchParam(sp, "term");
  const selected = terms.some((t) => t.key === requestedTerm)
    ? (terms.find((t) => t.key === requestedTerm)!)
    : terms[0];
  const [selectedExam, selectedYearId] = selected.key.split("|");

  const termSheets = published.filter(
    (sheet) => sheet.exam === selectedExam && sheet.academicYearId === selectedYearId,
  );
  const result = buildStudentTermResult(termSheets, student.id, subjects, settings);
  const yearLabel = years.find((y) => y.id === selectedYearId)?.label ?? selectedYearId;
  const latestPublish = termSheets.reduce(
    (max, sheet) => (sheet.publishedAt && sheet.publishedAt > max ? sheet.publishedAt : max),
    "",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Results"
        description={`Published results for roll ${student.roll}. Absences are shown as they are.`}
      />

      <form method="get" action="/student/results">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="sr-term"
              label="Exam"
              name="term"
              defaultValue={selected.key}
              className="min-w-56 flex-1"
              options={terms.map((term) => {
                const [exam, yearId] = term.key.split("|");
                const label = years.find((y) => y.id === yearId)?.label ?? yearId;
                return { value: term.key, label: `${exam} — ${label}` };
              })}
            />
            <div>
              <Button type="submit" variant="outline">
                Show Result
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Term GPA — {selectedExam} {yearLabel}
            </p>
            <p className="mt-2 text-4xl font-semibold text-fg tabular-nums">
              {result.gpa.toFixed(2)}
              <span className="ml-1 text-base font-normal text-muted">/ 5.00</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={result.gpa >= 3 ? "success" : result.gpa >= 2 ? "warning" : "danger"}>
                Grade {result.grade}
              </Badge>
              <Badge tone="neutral">{result.subjects.length} subjects</Badge>
              {result.failedSubjects > 0 && (
                <Badge tone="danger">
                  {result.failedSubjects} failed subject{result.failedSubjects > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {settings.failCapsGpa && result.failedSubjects > 0 && (
              <p className="mt-3 text-xs text-muted">
                School rule: any failed subject caps the term GPA at 0.00 (board
                practice). Improve the failed subject to lift the GPA.
              </p>
            )}
            {latestPublish && (
              <p className="mt-3 text-xs text-muted">
                Published {formatDate(latestPublish)}.
              </p>
            )}
            <a
              href={`/student/results/${encodeURIComponent(selectedExam)}/print?year=${selectedYearId}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              <Award className="size-4" aria-hidden="true" />
              Printable marksheet
            </a>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Subject results — {selectedExam} {yearLabel}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Subject</TH>
                  <TH className="w-24">Marks</TH>
                  <TH className="w-20">Grade</TH>
                  <TH className="w-20">Points</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.subjects.length === 0 && (
                  <TableEmpty colSpan={4}>
                    No published marks found for you in this exam yet.
                  </TableEmpty>
                )}
                {result.subjects.map((subject) => (
                  <TableRow key={subject.subjectSlug}>
                    <TD className="font-medium">{subject.subjectName}</TD>
                    <TD>
                      {subject.absent ? (
                        <Badge tone="danger">Absent</Badge>
                      ) : (
                        <span className="tabular-nums">{subject.marks}</span>
                      )}
                    </TD>
                    <TD>{subject.grade}</TD>
                    <TD className="tabular-nums">{subject.points.toFixed(2)}</TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {result.failedSubjects > 0 && (
        <Alert tone="warning" title="Failed subject on this term">
          {result.failedSubjects} subject{result.failedSubjects > 1 ? "s" : ""} below the
          pass grade. Talk to your class teacher about a retake or improvement plan.
        </Alert>
      )}
    </div>
  );
}
