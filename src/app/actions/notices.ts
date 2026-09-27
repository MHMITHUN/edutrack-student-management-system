"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canCreateNotice } from "@/lib/notices/rules";
import { noticeSchema } from "@/lib/validation/notices";

/** Notice server action — audience rules enforced in src/lib/notices/rules.ts. */

export interface NoticeFormState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"title" | "bodyMd" | "audience" | "classId", string>>;
}

export async function createNoticeAction(
  _prev: NoticeFormState,
  formData: FormData,
): Promise<NoticeFormState> {
  const user = await requireRole(["ADMIN", "TEACHER"]);
  const store = await getStore();

  const parsed = noticeSchema.safeParse({
    title: formData.get("title"),
    bodyMd: formData.get("bodyMd"),
    audience: formData.get("audience"),
    classId: formData.get("classId") || undefined,
    priority: formData.get("priority") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NoticeFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        (key === "title" || key === "bodyMd" || key === "audience" || key === "classId") &&
        !fieldErrors[key]
      ) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { title, bodyMd, audience, classId, priority } = parsed.data;

  // Role rules: teachers cannot address staff; class notices target own classes.
  let ownClassIds: string[] = [];
  if (user.role === "TEACHER") {
    const teacher = await store.getTeacherByUserId(user.id);
    if (!teacher) return { error: "No teacher profile is linked to your account." };
    ownClassIds = [...new Set(teacher.classAssignments.map((a) => a.classId))];
  }
  const permission = canCreateNotice(user.role, audience, classId, ownClassIds);
  if (!permission.allowed) {
    return audience === "class"
      ? { fieldErrors: { classId: permission.reason } }
      : { error: permission.reason };
  }

  const notice = await store.createNotice({
    title,
    bodyMd,
    audience,
    ...(audience === "class" && classId ? { classId } : {}),
    authorId: user.id,
    priority,
  });
  await logAudit(
    { id: user.id, name: user.name },
    "notice.create",
    "notice",
    notice.id,
    { audience: notice.audience, title: notice.title },
  );

  revalidatePath("/admin/notices");
  revalidatePath("/teacher/notices");
  revalidatePath("/student/notices");
  return { message: "Notice published." };
}
