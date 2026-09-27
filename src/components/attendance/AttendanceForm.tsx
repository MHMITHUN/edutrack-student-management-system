"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableHead, TableRow, TD, TH } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/db/types";
import {
  saveAttendanceAction,
  type AttendanceFormState,
} from "@/app/actions/attendance";

/**
 * Teacher's daily attendance grid (spec 18.6): one present/absent/late radio
 * per rostered student, defaulting to Present, with a bulk "mark all present"
 * shortcut. Re-saving a date replaces the stored record (upsert).
 */

export interface AttendanceRow {
  studentId: string;
  roll: number;
  name: string;
  status: AttendanceStatus;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
];

export function AttendanceForm({
  classId,
  subjectSlug,
  date,
  rows,
}: {
  classId: string;
  subjectSlug: string;
  date: string;
  rows: AttendanceRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    saveAttendanceAction,
    {} as AttendanceFormState,
  );
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, r.status])),
  );

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    setStatuses(Object.fromEntries(rows.map((r) => [r.studentId, "present" as const])));
  };

  const counts = rows.reduce(
    (acc, row) => {
      acc[statuses[row.studentId] ?? "present"] += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0 },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectSlug" value={subjectSlug} />
      <input type="hidden" name="date" value={date} />

      {state.error && <Alert tone="danger" title="Not saved">{state.error}</Alert>}
      {state.message && <Alert tone="success" title="Saved">{state.message}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {counts.present} present · {counts.late} late · {counts.absent} absent
        </p>
        <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
          Mark all present
        </Button>
      </div>

      <Table>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            <TH className="w-16">Roll</TH>
            <TH>Student</TH>
            <TH className="w-64">Status</TH>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const current = statuses[row.studentId] ?? "present";
            return (
              <TableRow key={row.studentId}>
                <TD className="tabular-nums">{row.roll}</TD>
                <TD className="font-medium">{row.name}</TD>
                <TD>
                  <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={`Attendance for ${row.name}`}>
                    {STATUS_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm",
                          current === option.value
                            ? "font-medium text-fg"
                            : "text-muted hover:text-fg",
                        )}
                      >
                        <input
                          type="radio"
                          name={`status_${row.studentId}`}
                          value={option.value}
                          checked={current === option.value}
                          onChange={() => setStatus(row.studentId, option.value)}
                          className="size-4 accent-[#1d4ed8]"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </TD>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending}>
          Save Attendance
        </Button>
        <p className="text-xs text-muted">
          Saving again for the same class, subject and date replaces the record.
        </p>
      </div>
    </form>
  );
}
