import type { Notice, Role } from "@/lib/db/types";

/**
 * Notice audience rules (spec: simple, honest, published immediately).
 *
 * Visibility:
 * - ADMIN sees everything.
 * - TEACHER sees all / teachers / students notices, plus class notices for
 *   classes they teach.
 * - STUDENT sees all / students notices, plus class notices for their OWN
 *   class. Teacher-only notices are never visible to students.
 *
 * Creation:
 * - ADMIN may create any notice.
 * - TEACHER may create notices for audiences all/students/class, where a
 *   class notice must target one of their own assigned classes. Only the
 *   administration may address the teaching staff.
 * - STUDENT cannot create notices.
 */

export interface NoticeViewer {
  role: Role;
  /** Classes the viewer may see class-notices for (own class / assignments). */
  classIds: string[];
}

export function isNoticeVisible(notice: Notice, viewer: NoticeViewer): boolean {
  if (viewer.role === "ADMIN") return true;
  if (notice.audience === "teachers") return viewer.role === "TEACHER";
  if (notice.audience === "class") {
    return notice.classId !== undefined && viewer.classIds.includes(notice.classId);
  }
  // "all" and "students" reach both teachers and students.
  return true;
}

export function noticesVisibleTo(notices: Notice[], viewer: NoticeViewer): Notice[] {
  return notices.filter((notice) => isNoticeVisible(notice, viewer));
}

export function canCreateNotice(
  role: Role,
  audience: Notice["audience"],
  classId: string | undefined,
  ownClassIds: string[],
): { allowed: boolean; reason?: string } {
  if (role === "STUDENT") {
    return { allowed: false, reason: "Students cannot publish notices." };
  }
  if (role === "TEACHER") {
    if (audience === "teachers") {
      return {
        allowed: false,
        reason: "Only the administration can send notices to the teaching staff.",
      };
    }
  }
  if (audience === "class") {
    if (!classId) {
      return { allowed: false, reason: "Choose the class this notice targets." };
    }
    if (role === "TEACHER" && !ownClassIds.includes(classId)) {
      return {
        allowed: false,
        reason: "You can only post class notices for classes you teach.",
      };
    }
  }
  return { allowed: true };
}

export const AUDIENCE_LABELS: Record<Notice["audience"], string> = {
  all: "Everyone",
  teachers: "Teachers only",
  students: "All students",
  class: "Specific class",
};
