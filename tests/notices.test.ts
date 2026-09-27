import { describe, it, expect, beforeEach } from "vitest";
import { DemoStore } from "@/lib/db/demo-store";
import { resetStoreForTests } from "@/lib/db";
import { CLASS_IDS } from "@/lib/db/seeds/catalog";
import { canCreateNotice, isNoticeVisible, noticesVisibleTo } from "@/lib/notices/rules";
import { noticeSchema } from "@/lib/validation/notices";

/**
 * Notice tests (spec: audience rules): students never see teacher-only
 * notices, class notices reach only the targeted class, and creation
 * permissions follow the role rules. Plus the audit row a real creation
 * writes.
 */

const TEN_SCIENCE = CLASS_IDS.tenScience;
const NINE_SCIENCE = CLASS_IDS.nineScience;

beforeEach(() => {
  resetStoreForTests();
  delete process.env.MONGODB_URI;
});

describe("audience visibility filtering", () => {
  it("students never see teacher-only notices", async () => {
    const store = await DemoStore.create();
    const notices = await store.listNotices();
    const staffNotice = notices.find((n) => n.audience === "teachers");
    expect(staffNotice).toBeDefined();

    const visible = noticesVisibleTo(notices, {
      role: "STUDENT",
      classIds: [TEN_SCIENCE],
    });
    expect(visible.some((n) => n.id === staffNotice!.id)).toBe(false);
    expect(visible.every((n) => n.audience !== "teachers")).toBe(true);
  });

  it("students see all/students notices and class notices for their OWN class only", async () => {
    const store = await DemoStore.create();
    // A class notice for a different class, created like a real mutation would.
    await store.createNotice({
      title: "Nine Science extra class",
      bodyMd: "Extra mathematics class on Sunday morning.",
      audience: "class",
      classId: NINE_SCIENCE,
      authorId: "usr-teacher-03",
    });
    const notices = await store.listNotices();

    const visible = noticesVisibleTo(notices, {
      role: "STUDENT",
      classIds: [TEN_SCIENCE],
    });
    const classNotices = visible.filter((n) => n.audience === "class");
    expect(classNotices).toHaveLength(1);
    expect(classNotices[0].classId).toBe(TEN_SCIENCE);

    expect(visible.some((n) => n.audience === "all")).toBe(true);
    expect(visible.some((n) => n.audience === "students")).toBe(true);
  });

  it("teachers see staff notices and class notices for classes they teach", async () => {
    const store = await DemoStore.create();
    const notices = await store.listNotices();

    // tch-01 teaches Bangla in ALL four classes.
    const visible = noticesVisibleTo(notices, {
      role: "TEACHER",
      classIds: [NINE_SCIENCE, CLASS_IDS.nineBusiness, TEN_SCIENCE, CLASS_IDS.tenBusiness],
    });
    expect(visible.some((n) => n.audience === "teachers")).toBe(true);
    expect(visible.some((n) => n.audience === "class" && n.classId === TEN_SCIENCE)).toBe(true);

    // A teacher with no assignment in Ten Science must not see its class notice.
    const outsider = noticesVisibleTo(notices, {
      role: "TEACHER",
      classIds: [NINE_SCIENCE],
    });
    expect(outsider.some((n) => n.audience === "class" && n.classId === TEN_SCIENCE)).toBe(false);
  });

  it("admins see everything", async () => {
    const store = await DemoStore.create();
    const notices = await store.listNotices();
    const visible = noticesVisibleTo(notices, { role: "ADMIN", classIds: [] });
    expect(visible).toHaveLength(notices.length);
  });

  it("isNoticeVisible treats an audience-class notice without classId as invisible", () => {
    const notice = {
      id: "x",
      title: "t",
      bodyMd: "b",
      audience: "class" as const,
      authorId: "usr-admin-01",
      publishedAt: "2026-01-01T00:00:00.000Z",
      priority: "normal" as const,
    };
    expect(isNoticeVisible(notice, { role: "STUDENT", classIds: [TEN_SCIENCE] })).toBe(false);
    expect(isNoticeVisible(notice, { role: "ADMIN", classIds: [] })).toBe(true);
  });
});

describe("creation permissions", () => {
  it("students cannot publish notices", () => {
    expect(canCreateNotice("STUDENT", "all", undefined, []).allowed).toBe(false);
  });

  it("teachers cannot address the teaching staff", () => {
    const result = canCreateNotice("TEACHER", "teachers", undefined, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/administration/i);
  });

  it("teachers can post class notices only for their own classes", () => {
    expect(canCreateNotice("TEACHER", "class", TEN_SCIENCE, [NINE_SCIENCE]).allowed).toBe(false);
    expect(canCreateNotice("TEACHER", "class", NINE_SCIENCE, [NINE_SCIENCE]).allowed).toBe(true);
    expect(canCreateNotice("TEACHER", "class", undefined, [NINE_SCIENCE]).allowed).toBe(false);
    expect(canCreateNotice("TEACHER", "students", undefined, []).allowed).toBe(true);
    expect(canCreateNotice("TEACHER", "all", undefined, []).allowed).toBe(true);
  });

  it("admins can post anything, including staff notices", () => {
    expect(canCreateNotice("ADMIN", "teachers", undefined, []).allowed).toBe(true);
    expect(canCreateNotice("ADMIN", "class", TEN_SCIENCE, []).allowed).toBe(true);
  });
});

describe("notice store + audit", () => {
  it("creates notices published immediately and lists them newest first", async () => {
    const store = await DemoStore.create();
    const created = await store.createNotice({
      title: "Library closed tomorrow",
      bodyMd: "The library will remain closed for inventory.",
      audience: "students",
      authorId: "usr-admin-01",
      priority: "important",
    });
    expect(created.publishedAt).toBeDefined();
    expect(created.priority).toBe("important");

    const listed = await store.listNotices({ audience: "students" });
    expect(listed[0].id).toBe(created.id); // newest first

    // The audit row a real creation writes.
    await store.createAuditLog({
      actorId: "usr-admin-01",
      actorName: "Md. Rafiqul Islam",
      action: "notice.create",
      resource: "notice",
      resourceId: created.id,
      metadata: { audience: "students", title: created.title },
    });
    const audit = await store.listAuditLogs({ action: "notice.create", resource: "notice" });
    expect(audit.total).toBeGreaterThanOrEqual(2); // seed row(s) + this one
    expect(audit.logs[0].resourceId).toBe(created.id);
  });
});

describe("notice validation schema", () => {
  it("accepts a valid notice and defaults priority to normal", () => {
    const parsed = noticeSchema.safeParse({
      title: "Exam routine published",
      bodyMd: "Check the notice board for the full routine.",
      audience: "all",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priority).toBe("normal");
  });

  it("requires a class for class-targeted notices", () => {
    const parsed = noticeSchema.safeParse({
      title: "Class party",
      bodyMd: "Bring your own snacks to the party.",
      audience: "class",
      classId: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty body and an unknown audience", () => {
    expect(
      noticeSchema.safeParse({ title: "T", bodyMd: "", audience: "all" }).success,
    ).toBe(false);
    expect(
      noticeSchema.safeParse({
        title: "Title here",
        bodyMd: "Body is long enough.",
        audience: "parents",
      }).success,
    ).toBe(false);
  });
});
