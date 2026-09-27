"use client";

import { useActionState, useState } from "react";
import { Plus, Trash } from "lucide-react";
import { updateSettingsAction, type SettingsFormState } from "@/app/actions/settings";
import { validateBands } from "@/lib/grading";
import type { GradeBand } from "@/lib/db/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

/**
 * Admin grade-bands editor: add/remove/reorder-free row editing with
 * immediate validation (contiguous 0-100 coverage, no overlaps). The whole
 * table is submitted as JSON; the server re-validates via the settings
 * service before anything is written and the change is audited there.
 */

interface BandRow {
  min: string;
  max: string;
  grade: string;
  points: string;
}

function toRow(band: GradeBand): BandRow {
  return {
    min: String(band.min),
    max: String(band.max),
    grade: band.grade,
    points: String(band.points),
  };
}

function parseRows(rows: BandRow[]): { bands: GradeBand[] | null; error?: string } {
  const bands: GradeBand[] = [];
  for (const row of rows) {
    const min = Number(row.min);
    const max = Number(row.max);
    const points = Number(row.points);
    const grade = row.grade.trim();
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      !Number.isFinite(points) ||
      min < 0 ||
      max > 100 ||
      max < min ||
      grade === "" ||
      points < 0 ||
      points > 5
    ) {
      return {
        bands: null,
        error: `Row "${row.grade || "(empty)"}" is invalid: min/max must be integers (min ≤ max ≤ 100), grade required, points 0-5.`,
      };
    }
    bands.push({ min, max, grade, points });
  }
  const check = validateBands(bands);
  if (!check.ok) return { bands: null, error: check.error };
  return { bands };
}

export function GradeBandsEditor({
  initialBands,
  failCapsGpa,
  attendanceWarnPercent,
}: {
  initialBands: GradeBand[];
  failCapsGpa: boolean;
  attendanceWarnPercent: number;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSettingsAction,
    {} as SettingsFormState,
  );
  const [rows, setRows] = useState<BandRow[]>(initialBands.map(toRow));
  const [warnPercent, setWarnPercent] = useState(String(attendanceWarnPercent));

  const parsed = parseRows(rows);
  const warnValid = /^\d+$/.test(warnPercent.trim()) && Number(warnPercent) >= 0 && Number(warnPercent) <= 100;
  const canSubmit = parsed.bands !== null && warnValid;

  const updateRow = (index: number, patch: Partial<BandRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { min: "", max: "100", grade: "", points: "0" },
    ]);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input
        type="hidden"
        name="bands"
        value={JSON.stringify(parsed.bands ?? rows.map((r) => ({ ...r, grade: r.grade.trim() })))}
      />

      {state.error && <Alert tone="danger" title="Not saved">{state.error}</Alert>}
      {state.message && <Alert tone="success" title="Settings saved">{state.message}</Alert>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-125 text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-2 py-2 font-medium">Min mark</th>
              <th scope="col" className="px-2 py-2 font-medium">Max mark</th>
              <th scope="col" className="px-2 py-2 font-medium">Grade</th>
              <th scope="col" className="px-2 py-2 font-medium">Points</th>
              <th scope="col" className="px-2 py-2 font-medium sr-only">Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={row.min}
                    onChange={(e) => updateRow(index, { min: e.target.value })}
                    aria-label={`Band ${index + 1} minimum mark`}
                    className="h-9 w-24"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={row.max}
                    onChange={(e) => updateRow(index, { max: e.target.value })}
                    aria-label={`Band ${index + 1} maximum mark`}
                    className="h-9 w-24"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="text"
                    maxLength={8}
                    value={row.grade}
                    onChange={(e) => updateRow(index, { grade: e.target.value })}
                    aria-label={`Band ${index + 1} grade name`}
                    className="h-9 w-20"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={row.points}
                    onChange={(e) => updateRow(index, { points: e.target.value })}
                    aria-label={`Band ${index + 1} grade points`}
                    className="h-9 w-24"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                    aria-label={`Remove band ${row.grade || index + 1}`}
                  >
                    <Trash className="size-4" aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" aria-hidden="true" />
          Add band
        </Button>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendanceWarnPercent">Attendance warning threshold (%)</Label>
          <Input
            id="attendanceWarnPercent"
            name="attendanceWarnPercent"
            type="number"
            min={0}
            max={100}
            value={warnPercent}
            onChange={(e) => setWarnPercent(e.target.value)}
            className="h-9 w-28"
            aria-describedby="warn-hint"
          />
          <p id="warn-hint" className="text-xs text-muted">
            Students below this percent are flagged for teachers.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="failCapsGpa">Fail rule</Label>
          <label className="flex h-9 items-center gap-2 text-sm text-fg">
            <input
              id="failCapsGpa"
              name="failCapsGpa"
              type="checkbox"
              defaultChecked={failCapsGpa}
              className="size-4 rounded border-border accent-[#1d4ed8]"
            />
            Any failed subject caps the term GPA at 0.00
          </label>
        </div>
      </div>

      {!canSubmit && !isPending && (
        <p role="alert" className="text-sm text-danger">
          {parsed.error ??
            (warnValid ? null : "Attendance threshold must be a whole number between 0 and 100.")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending} disabled={!canSubmit}>
          Save Settings
        </Button>
        <p className="text-xs text-muted">
          Saving writes an audit entry and applies to every future grade and
          GPA computation immediately.
        </p>
      </div>
    </form>
  );
}
