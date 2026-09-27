import type { Metadata } from "next";
import { ClipboardEdit, Info } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { ExamSchema, type Exam } from "@/lib/db/types";
import { evaluateSubject } from "@/lib/grading";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarksEntryForm } from "@/components/marks/MarksEntryForm";
import { MarkSheetStatusBadge } from "@/components/marks/MarkSheetStatusBadge";
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
} from "@/components/ui";
import { formatDate, searchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Marks Entry" };
export const dynamic = "force-dynamic";

/** True when the value is one of the four fixed exams. */
function isExam(value: string | undefined): value is Exam {
  return (ExamSchema.options as readonly string[]).includes(value ?? "");
}

export default async function TeacherMarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["TEACHER"], "/teacher/marks");
  const sp = await searchParams;
  const store = await getStore();

  const teacher = await store.getTeacherByUserId(user.id);
  if (!teacher) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Marks Entry" description="Enter marks for your assigned classes." />
        <EmptyState
          title="No teacher profile"
          description="Your account is not linked to a teacher record. Ask the administrator to fix the linkage."
        />
      </div>
    );
  }

  const [classes, subjects, years, settings] = await Promise.all([
    store.listClasses(),
    store.listSubjects(),
    store.listAcademicYears(),
    store.getSettings(),
  ]);

  // Only the teacher's OWN assignments are ever offered (server-side filter).
  const assignmentClassIds = [...new Set(teacher.classAssignments.map((a) => a.classId))];
  const myClasses = classes.filter((c) => assignmentClassIds.includes(c.id));
  if (myClasses.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Marks Entry" description="Enter marks for your assigned classes." />
        <EmptyState
          icon={ClipboardEdit}
          title="No class assignments yet"
          description="You have no class and subject assigned. The administration assigns teaching loads."
        />
      </div>
    );
  }

  const selectedClassId = searchParam(sp, "class") ?? myClasses[0].id;
  const classIsMine = myClasses.some((c) => c.id === selectedClassId);
  const effectiveClassId = classIsMine ? selectedClassId : myClasses[0].id;
  const mySubjectsInClass = teacher.classAssignments.filter((a) => a.classId === effectiveClassId);
  const subjectOptions = mySubjectsInClass
    .map((a) => subjects.find((s) => s.slug === a.subjectSlug))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const requestedSubject = searchParam(sp, "subject");
  const selectedSubjectSlug =
    requestedSubject && mySubjectsInClass.some((a) => a.subjectSlug === requestedSubject)
      ? requestedSubject
      : (subjectOptions[0]?.slug ?? "");

  const activeYear = years.find((y) => y.active) ?? years[years.length - 1];
  const requestedYear = searchParam(sp, "year");
  const selectedYearId =
    requestedYear && years.some((y) => y.id === requestedYear)
      ? requestedYear
      : (activeYear?.id ?? "");

  const requestedExam = searchParam(sp, "exam");
  const selectedExam: Exam = isExam(requestedExam) ? requestedExam : ExamSchema.options[0];

  const examIsOpen =
    effectiveClassId !== "" &&
    selectedSubjectSlug !== "" &&
    selectedYearId !== "" &&
    mySubjectsInClass.some((a) => a.subjectSlug === selectedSubjectSlug);

  // Existing sheet for the selected class+subject+exam+year (any status).
  const existing = examIsOpen
    ? await store.findMarkSheet({
        classId: effectiveClassId,
        subjectSlug: selectedSubjectSlug,
        exam: selectedExam,
        academicYearId: selectedYearId,
      })
    : null;

  const roster = examIsOpen ? await store.listStudentsByClass(effectiveClassId) : [];
  const entryByStudent = new Map((existing?.entries ?? []).map((e) => [e.studentId, e]));
  const subjectName = subjects.find((s) => s.slug === selectedSubjectSlug)?.name ?? selectedSubjectSlug;
  const classLabel = (() => {
    const klass = classes.find((c) => c.id === effectiveClassId);
    return klass ? `${klass.name} (${klass.section})` : effectiveClassId;
  })();

  const locked = existing !== null && existing.status !== "draft";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marks Entry"
        description="Select your class, subject and exam. Only your own assignments are listed."
      />

      {/* Selection is a plain GET form — no client state needed. */}
      <form method="get" action="/teacher/marks">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="tm-class"
              label="Class"
              name="class"
              defaultValue={effectiveClassId}
              className="min-w-44 flex-1"
              options={myClasses.map((klass) => ({
                value: klass.id,
                label: `${klass.name} (${klass.section})`,
              }))}
            />
            <LabeledSelect
              id="tm-subject"
              label="Subject"
              name="subject"
              defaultValue={selectedSubjectSlug}
              className="min-w-44 flex-1"
              options={subjectOptions.map((subject) => ({
                value: subject.slug,
                label: subject.name,
              }))}
            />
            <LabeledSelect
              id="tm-exam"
              label="Exam"
              name="exam"
              defaultValue={selectedExam}
              className="min-w-44 flex-1"
              options={ExamSchema.options.map((exam) => ({ value: exam, label: exam }))}
            />
            <LabeledSelect
              id="tm-year"
              label="Academic year"
              name="year"
              defaultValue={selectedYearId}
              className="min-w-36 flex-1"
              options={years.map((year) => ({
                value: year.id,
                label: `${year.label}${year.active ? " (active)" : ""}`,
              }))}
            />
            <div>
              <Button type="submit">Load Roster</Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {examIsOpen && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>
                {classLabel} · {subjectName} · {selectedExam}
              </CardTitle>
              <p className="text-sm text-muted">
                {roster.length} students on the roll
                {existing
                  ? ` · last saved ${formatDate(existing.updatedAt)}`
                  : " · no sheet started yet"}
              </p>
            </div>
            {existing && <MarkSheetStatusBadge status={existing.status} />}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {locked && (
              <Alert
                tone={existing.status === "published" ? "success" : "info"}
                title={
                  existing.status === "published"
                    ? "Result published"
                    : "Submitted for review"
                }
              >
                {existing.status === "published"
                  ? `Published on ${existing.publishedAt ? formatDate(existing.publishedAt) : ""}. Published sheets are immutable.`
                  : `Submitted on ${existing.submittedAt ? formatDate(existing.submittedAt) : ""}. The sheet is read-only until the administration publishes it or returns it to you.`}
              </Alert>
            )}

            {locked ? (
              <Table>
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TH className="w-16">Roll</TH>
                    <TH>Student</TH>
                    <TH className="w-28">Marks</TH>
                    <TH className="w-20">Grade</TH>
                    <TH className="w-20">Points</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {roster.map((student) => {
                    const entry = entryByStudent.get(student.id);
                    const marks = entry?.marks ?? null;
                    const evaluation = evaluateSubject(marks, settings.gradeBands);
                    return (
                      <TableRow key={student.id}>
                        <TD className="tabular-nums">{student.roll}</TD>
                        <TD className="font-medium">{student.name}</TD>
                        <TD>
                          {evaluation.absent ? (
                            <Badge tone="danger">Absent</Badge>
                          ) : (
                            <span className="tabular-nums">{marks}</span>
                          )}
                        </TD>
                        <TD>{evaluation.grade}</TD>
                        <TD className="tabular-nums">{evaluation.points.toFixed(2)}</TD>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <MarksEntryForm
                classId={effectiveClassId}
                subjectSlug={selectedSubjectSlug}
                exam={selectedExam}
                academicYearId={selectedYearId}
                rows={roster.map((student) => {
                  const entry = entryByStudent.get(student.id);
                  return {
                    studentId: student.id,
                    roll: student.roll,
                    name: student.name,
                    marks: entry?.marks ?? null,
                    absent: entry?.absent === true,
                  };
                })}
              />
            )}

            <Alert tone="info">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                Blank cells are allowed in a draft. Submitting requires marks (or an
                absent flag) for every student on the roll.
              </p>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
