"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  MarksWorkflowError,
  publishMarkSheet,
  returnMarkSheet,
  saveMarkSheetDraft,
  submitMarkSheet,
  type MarkSheetInput,
} from "@/lib/marks/workflow";

/**
 * Marks workflow server actions (spec 18.4). Every action re-authenticates
 * the session server-side, delegates to the workflow rules layer, writes an
 * audit row on success, and revalidates the affected pages. The client never
 * decides permissions — it only renders what these actions allow.
 */

export interface MarksFormState {
  error?: string;
  message?: string;
}

/** Build validated entries from the roster grid's form fields.
 *  Blank non-absent rows are dropped here; submit coverage is checked in the
 *  workflow (which knows the roster). */
async function entriesFromFormData(
  formData: FormData,
): Promise<{ entries: MarkSheetInput["entries"]; error?: string }> {
  const classId = String(formData.get("classId") ?? "");
  const store = await getStore();
  const roster = await store.listStudentsByClass(classId);
  const entries: MarkSheetInput["entries"] = [];
  for (const student of roster) {
    const absent = formData.get(`absent_${student.id}`) === "on";
    const raw = String(formData.get(`marks_${student.id}`) ?? "").trim();
    if (absent) {
      entries.push({ studentId: student.id, marks: null, absent: true });
      continue;
    }
    if (raw === "") continue; // unmarked row: fine for a draft, blocked on submit
    const marks = Number(raw);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
      return {
        entries: [],
        error: `Marks for ${student.name} (roll ${student.roll}) must be a number between 0 and 100.`,
      };
    }
    entries.push({ studentId: student.id, marks });
  }
  return { entries };
}

function markSheetInput(formData: FormData, entries: MarkSheetInput["entries"]): MarkSheetInput {
  return {
    classId: String(formData.get("classId") ?? ""),
    subjectSlug: String(formData.get("subjectSlug") ?? ""),
    exam: String(formData.get("exam") ?? ""),
    academicYearId: String(formData.get("academicYearId") ?? ""),
    entries,
  };
}

function workflowErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof MarksWorkflowError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** TEACHER: save the current grid as a draft, or save + submit for review. */
export async function saveMarkSheetAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const user = await requireRole(["TEACHER"], "/teacher/marks");
  const store = await getStore();
  const teacher = await store.getTeacherByUserId(user.id);
  if (!teacher) return { error: "No teacher profile is linked to your account." };

  const { entries, error } = await entriesFromFormData(formData);
  if (error) return { error };
  const input = markSheetInput(formData, entries);
  const intent = String(formData.get("intent") ?? "draft");

  try {
    if (intent === "submit") {
      const sheet = await submitMarkSheet(store, { role: "TEACHER", user, teacher }, input);
      await logAudit(
        { id: user.id, name: user.name },
        "marksheet.submit",
        "markSheet",
        sheet.id,
        {
          classId: sheet.classId,
          subjectSlug: sheet.subjectSlug,
          exam: sheet.exam,
          academicYearId: sheet.academicYearId,
          entryCount: sheet.entries.length,
        },
      );
      revalidatePath("/teacher/marks");
      revalidatePath("/admin/marks");
      return { message: "Mark sheet submitted for review. It is now read-only until the administration responds." };
    }
    const sheet = await saveMarkSheetDraft(store, { role: "TEACHER", user, teacher }, input);
    await logAudit(
      { id: user.id, name: user.name },
      "marksheet.save",
      "markSheet",
      sheet.id,
      {
        classId: sheet.classId,
        subjectSlug: sheet.subjectSlug,
        exam: sheet.exam,
        academicYearId: sheet.academicYearId,
        entryCount: sheet.entries.length,
      },
    );
    revalidatePath("/teacher/marks");
    return { message: "Draft saved. You can come back and finish it later." };
  } catch (err) {
    return { error: workflowErrorMessage(err, "Could not save the mark sheet.") };
  }
}

/** ADMIN: publish a submitted sheet — results become visible to students. */
export async function publishMarkSheetAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const user = await requireRole(["ADMIN"], "/admin/marks");
  const store = await getStore();
  const sheetId = String(formData.get("sheetId") ?? "");
  try {
    const sheet = await publishMarkSheet(store, { role: "ADMIN", user }, sheetId);
    await logAudit(
      { id: user.id, name: user.name },
      "marksheet.publish",
      "markSheet",
      sheet.id,
      {
        classId: sheet.classId,
        subjectSlug: sheet.subjectSlug,
        exam: sheet.exam,
        academicYearId: sheet.academicYearId,
      },
    );
    revalidatePath("/admin/marks");
    revalidatePath(`/admin/marks/${sheetId}`);
    revalidatePath("/student/results");
    return { message: "Result published — students can now see it." };
  } catch (err) {
    return { error: workflowErrorMessage(err, "Could not publish the mark sheet.") };
  }
}

/** ADMIN: return a submitted sheet to its teacher for correction. */
export async function returnMarkSheetAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const user = await requireRole(["ADMIN"], "/admin/marks");
  const store = await getStore();
  const sheetId = String(formData.get("sheetId") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);
  try {
    const sheet = await returnMarkSheet(store, { role: "ADMIN", user }, sheetId);
    await logAudit(
      { id: user.id, name: user.name },
      "marksheet.return",
      "markSheet",
      sheet.id,
      {
        classId: sheet.classId,
        subjectSlug: sheet.subjectSlug,
        exam: sheet.exam,
        academicYearId: sheet.academicYearId,
        ...(note !== "" ? { note } : {}),
      },
    );
    revalidatePath("/admin/marks");
    revalidatePath(`/admin/marks/${sheetId}`);
    revalidatePath("/teacher/marks");
    return { message: "Sheet returned to the teacher for correction." };
  } catch (err) {
    return { error: workflowErrorMessage(err, "Could not return the mark sheet.") };
  }
}
