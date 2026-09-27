"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { SettingsError, updateSchoolSettings } from "@/lib/settings/service";

/**
 * Grade band editor action. The client editor submits the band table as one
 * JSON field (it manages rows dynamically); the server parses and validates
 * everything again via the settings service — never trusting the client.
 */

export interface SettingsFormState {
  error?: string;
  message?: string;
}

export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireRole(["ADMIN"], "/admin/settings");
  const store = await getStore();

  let bandsRaw: unknown;
  try {
    bandsRaw = JSON.parse(String(formData.get("bands") ?? "[]"));
  } catch {
    return { error: "The band table could not be read — reload the page and try again." };
  }
  if (!Array.isArray(bandsRaw)) {
    return { error: "The band table is malformed." };
  }
  const bands = bandsRaw.map((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    return {
      min: Number(record.min),
      max: Number(record.max),
      grade: String(record.grade ?? "").trim(),
      points: Number(record.points),
    };
  });

  const warnRaw = String(formData.get("attendanceWarnPercent") ?? "");
  const warnPercent = Number(warnRaw);
  if (warnRaw.trim() === "" || !Number.isInteger(warnPercent) || warnPercent < 0 || warnPercent > 100) {
    return { error: "Attendance warning threshold must be a whole number between 0 and 100." };
  }

  try {
    const settings = await updateSchoolSettings(store, { id: user.id, name: user.name }, {
      gradeBands: bands,
      failCapsGpa: formData.get("failCapsGpa") === "on",
      attendanceWarnPercent: warnPercent,
    });
    // Every grading surface reads settings live; revalidate the visible ones.
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/student/results");
    revalidatePath("/student");
    return {
      message: `Saved. ${settings.gradeBands.length} bands active, warning threshold ${settings.attendanceWarnPercent}% — all future grades and GPAs use the new rules.`,
    };
  } catch (err) {
    if (err instanceof SettingsError) return { error: err.message };
    if (err instanceof Error && err.message) return { error: err.message };
    return { error: "Could not save the settings." };
  }
}
