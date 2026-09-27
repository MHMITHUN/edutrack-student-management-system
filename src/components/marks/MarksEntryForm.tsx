"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableBody, TableHead, TableRow, TD, TH } from "@/components/ui/Table";
import { saveMarkSheetAction, type MarksFormState } from "@/app/actions/marks";

/**
 * Teacher's mark entry grid (spec 18.4): one marks input + absent checkbox
 * per rostered student. Marks may be blank in a draft; submitting requires
 * every student to have marks or an absent flag (checked again server-side —
 * this validation is only for fast feedback).
 */

export interface MarkSheetRow {
  studentId: string;
  roll: number;
  name: string;
  marks: number | null;
  absent: boolean;
}

export function MarksEntryForm({
  classId,
  subjectSlug,
  exam,
  academicYearId,
  rows,
}: {
  classId: string;
  subjectSlug: string;
  exam: string;
  academicYearId: string;
  rows: MarkSheetRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    saveMarkSheetAction,
    {} as MarksFormState,
  );
  const [absentIds, setAbsentIds] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.absent).map((r) => r.studentId)),
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [intent, setIntent] = useState<"draft" | "submit">("draft");

  const toggleAbsent = (studentId: string, checked: boolean) => {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  };

  /**
   * Roster focus management: ArrowUp/ArrowDown (and Enter) move focus between
   * the marks inputs of consecutive students, skipping rows disabled by an
   * Absent tick. A11y win for teachers entering a full column of marks.
   */
  const handleMarksKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    const delta = event.key === "ArrowUp" ? -1 : 1;
    const container = event.currentTarget.closest("table");
    if (!container) return;
    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>("input[data-marks-input]"),
    );
    let targetIndex = index + delta;
    while (targetIndex >= 0 && targetIndex < inputs.length && inputs[targetIndex].disabled) {
      targetIndex += delta;
    }
    if (targetIndex < 0 || targetIndex >= inputs.length) return;
    event.preventDefault();
    inputs[targetIndex].focus();
    inputs[targetIndex].select();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (intent !== "submit") {
      setClientError(null);
      return;
    }
    const form = event.currentTarget;
    const missing = rows.some((row) => {
      if (absentIds.has(row.studentId)) return false;
      const value = form.querySelector<HTMLInputElement>(
        `input[name="marks_${row.studentId}"]`,
      )?.value;
      return value === undefined || value.trim() === "";
    });
    if (missing) {
      event.preventDefault();
      setClientError(
        "Enter marks for every student — or tick Absent — before submitting.",
      );
    } else {
      setClientError(null);
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectSlug" value={subjectSlug} />
      <input type="hidden" name="exam" value={exam} />
      <input type="hidden" name="academicYearId" value={academicYearId} />

      {state.error && (
        <Alert tone="danger" title="Not saved">{state.error}</Alert>
      )}
      {clientError && (
        <Alert tone="danger" title="Not submitted">{clientError}</Alert>
      )}
      {state.message && (
        <Alert tone="success" title="Done">{state.message}</Alert>
      )}

      <Table>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            <TH className="w-16">Roll</TH>
            <TH>Student</TH>
            <TH className="w-28">Marks (0-100)</TH>
            <TH className="w-20">Absent</TH>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const absent = absentIds.has(row.studentId);
            return (
              <TableRow key={row.studentId}>
                <TD className="tabular-nums">{row.roll}</TD>
                <TD className="font-medium">{row.name}</TD>
                <TD>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    name={`marks_${row.studentId}`}
                    defaultValue={row.marks === null ? "" : String(row.marks)}
                    disabled={absent}
                    aria-label={`Marks for ${row.name}`}
                    className="h-9 w-24"
                    data-marks-input=""
                    onKeyDown={(e) => handleMarksKeyDown(e, index)}
                  />
                </TD>
                <TD>
                  <input
                    type="checkbox"
                    name={`absent_${row.studentId}`}
                    checked={absent}
                    onChange={(e) => toggleAbsent(row.studentId, e.target.checked)}
                    aria-label={`Mark ${row.name} absent`}
                    className="size-4 rounded border-border accent-[#1d4ed8]"
                  />
                </TD>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="outline"
          name="intent"
          value="draft"
          loading={isPending && intent === "draft"}
          onClick={() => setIntent("draft")}
        >
          Save Draft
        </Button>
        <Button
          type="submit"
          name="intent"
          value="submit"
          loading={isPending && intent === "submit"}
          onClick={() => setIntent("submit")}
        >
          Submit for Review
        </Button>
        <p className="text-xs text-muted">
          Drafts stay private to you. Submitting locks the sheet until an
          administrator publishes or returns it. Tip: use the ↑/↓ arrow keys
          (or Enter) to move between mark fields.
        </p>
      </div>
    </form>
  );
}
