import { seedTeachers } from "./users";
import { seedMarkSheets } from "./markSheets";
import { seedNotices } from "./notices";
import type { AuditLog } from "../types";

/**
 * Audit seed rows that make the seeded scenario auditable: every published
 * sheet has its publication recorded, every submitted sheet its submission,
 * the one draft sheet its last save, and every notice its creation — with
 * the same actor/timestamp story the seeds tell. Runtime mutations append
 * their own rows via src/lib/audit.
 */

const ADMIN = { id: "usr-admin-01", name: "Md. Rafiqul Islam" };

function teacherUser(teacherId: string): { id: string; name: string } | null {
  const teacher = seedTeachers.find((t) => t.id === teacherId);
  return teacher ? { id: teacher.userId, name: teacher.name } : null;
}

function buildAuditSeeds(): AuditLog[] {
  const rows: AuditLog[] = [];
  let seq = 0;

  const push = (row: Omit<AuditLog, "id">) => {
    seq += 1;
    rows.push({ id: `aud-seed-${String(seq).padStart(3, "0")}`, ...row });
  };

  for (const sheet of seedMarkSheets) {
    const meta = {
      classId: sheet.classId,
      subjectSlug: sheet.subjectSlug,
      exam: sheet.exam,
      academicYearId: sheet.academicYearId,
    };
    if (sheet.status === "published" && sheet.publishedAt) {
      push({
        actorId: ADMIN.id,
        actorName: ADMIN.name,
        action: "marksheet.publish",
        resource: "markSheet",
        resourceId: sheet.id,
        metadata: meta,
        createdAt: sheet.publishedAt,
      });
    }
    if (sheet.submittedAt) {
      const actor = teacherUser(sheet.teacherId);
      if (actor) {
        push({
          actorId: actor.id,
          actorName: actor.name,
          action: "marksheet.submit",
          resource: "markSheet",
          resourceId: sheet.id,
          metadata: meta,
          createdAt: sheet.submittedAt,
        });
      }
    }
    if (sheet.status === "draft") {
      const actor = teacherUser(sheet.teacherId);
      if (actor) {
        push({
          actorId: actor.id,
          actorName: actor.name,
          action: "marksheet.save",
          resource: "markSheet",
          resourceId: sheet.id,
          metadata: { ...meta, entryCount: sheet.entries.length },
          createdAt: sheet.updatedAt,
        });
      }
    }
  }

  for (const notice of seedNotices) {
    const actor =
      notice.authorId === ADMIN.id
        ? ADMIN
        : (() => {
            const teacher = seedTeachers.find((t) => t.userId === notice.authorId);
            return teacher ? { id: teacher.userId, name: teacher.name } : null;
          })();
    if (actor) {
      push({
        actorId: actor.id,
        actorName: actor.name,
        action: "notice.create",
        resource: "notice",
        resourceId: notice.id,
        metadata: { audience: notice.audience, title: notice.title },
        createdAt: notice.publishedAt,
      });
    }
  }

  return rows;
}

export const seedAuditLogs: AuditLog[] = buildAuditSeeds();
