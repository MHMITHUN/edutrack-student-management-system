import { z } from "zod";
import type { Store } from "@/lib/db";
import { SettingsSchema, type GradeBand, type Settings } from "@/lib/db/types";
import { validateBands } from "@/lib/grading";
import { logAudit } from "@/lib/audit";

/**
 * School settings update rules (spec 18.5: "allow the school configuration
 * to change" the grading rules). Validation happens HERE — the admin UI shows
 * fast feedback, but the server is the authority. A successful update is
 * audited, and because every grade/GPA computation reads
 * store.getSettings() live, the change affects all future computations
 * immediately (nothing caches band tables in modules).
 */

export class SettingsError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid" = "invalid",
  ) {
    super(message);
    this.name = "SettingsError";
  }
}

const GradeBandInput = z.object({
  min: z.number().int().min(0).max(100),
  max: z.number().int().min(0).max(100),
  grade: z.string().trim().min(1).max(8),
  points: z.number().min(0).max(5),
});

export const SettingsUpdateSchema = z.object({
  gradeBands: z.array(GradeBandInput).min(1),
  failCapsGpa: z.boolean(),
  attendanceWarnPercent: z.number().int().min(0).max(100),
});

export type SettingsUpdateInput = z.infer<typeof SettingsUpdateSchema>;

export async function updateSchoolSettings(
  store: Store,
  actor: { id: string; name: string },
  input: unknown,
): Promise<Settings> {
  const parsed = SettingsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new SettingsError("Grade bands, the fail-cap switch and the attendance threshold are all required.");
  }

  const bands: GradeBand[] = parsed.data.gradeBands;
  const bandsCheck = validateBands(bands);
  if (!bandsCheck.ok) {
    throw new SettingsError(bandsCheck.error ?? "The grade band table is invalid.");
  }

  // Full settings-document validation (contiguity, shapes) before writing.
  const previous = await store.getSettings();
  const candidate: Settings = {
    id: "school",
    schoolName: previous.schoolName,
    gradeBands: bands,
    failCapsGpa: parsed.data.failCapsGpa,
    attendanceWarnPercent: parsed.data.attendanceWarnPercent,
  };
  const document = SettingsSchema.safeParse(candidate);
  if (!document.success) {
    throw new SettingsError("The settings document failed validation — check the band table.");
  }

  const updated = await store.updateSettings({
    gradeBands: bands,
    failCapsGpa: parsed.data.failCapsGpa,
    attendanceWarnPercent: parsed.data.attendanceWarnPercent,
  });

  const summarize = (list: GradeBand[]) =>
    list.map((b) => `${b.min}-${b.max}:${b.grade}`).join("; ");
  await logAudit(
    actor,
    "settings.update",
    "settings",
    "school",
    {
      previousBands: summarize(previous.gradeBands),
      newBands: summarize(bands),
      failCapsGpa: updated.failCapsGpa,
      attendanceWarnPercent: updated.attendanceWarnPercent,
    },
    store,
  );

  return updated;
}
