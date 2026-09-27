"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  AttendanceError,
  saveClassAttendance,
  type AttendanceActor,
} from "@/lib/attendance/service";
import type { AttendanceEntry } from "@/lib/db/types";

/** Attendance server action — see src/lib/attendance/service.ts for the rules. */

export interface AttendanceFormState {
  error?: string;
  message?: string;
}

export async function saveAttendanceAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const user = await requireRole(["TEACHER"], "/teacher/attendance");
  const store = await getStore();
  const teacher = await store.getTeacherByUserId(user.id);
  if (!teacher) return { error: "No teacher profile is linked to your account." };

  const classId = String(formData.get("classId") ?? "");
  const subjectSlug = String(formData.get("subjectSlug") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!classId || !subjectSlug || !date) {
    return { error: "Choose a class, subject and date first." };
  }

  const roster = await store.listStudentsByClass(classId);
  const entries: AttendanceEntry[] = [];
  for (const student of roster) {
    const raw = String(formData.get(`status_${student.id}`) ?? "present");
    if (raw !== "present" && raw !== "absent" && raw !== "late") {
      return { error: `Invalid attendance status for ${student.name}.` };
    }
    entries.push({ studentId: student.id, status: raw });
  }
  if (entries.length === 0) {
    return { error: "This class has no students." };
  }

  const actor: AttendanceActor = { role: user.role, user, teacher };
  try {
    const record = await saveClassAttendance(store, actor, {
      date,
      classId,
      subjectSlug,
      entries,
    });
    const present = record.entries.filter((e) => e.status === "present").length;
    const absent = record.entries.filter((e) => e.status === "absent").length;
    const late = record.entries.filter((e) => e.status === "late").length;
    await logAudit(
      { id: user.id, name: user.name },
      "attendance.save",
      "attendanceRecord",
      record.id,
      { date: record.date, classId: record.classId, subjectSlug: record.subjectSlug, present, absent, late },
    );
    revalidatePath("/teacher/attendance");
    revalidatePath("/student/attendance");
    revalidatePath("/admin/attendance");
    return {
      message: `Attendance saved for ${date} — ${present} present, ${late} late, ${absent} absent.`,
    };
  } catch (error) {
    if (error instanceof AttendanceError) return { error: error.message };
    if (error instanceof Error && error.message) return { error: error.message };
    return { error: "Could not save attendance." };
  }
}
