import { CLASS_IDS } from "./catalog";
import type { Notice, NoticePriority } from "../types";

/**
 * Notice seeds — 8 realistic school notices covering the audience rules:
 * all, students, class (one targeted class) and teachers (teacher-only).
 * Fixed ISO dates Jan-Sep 2026. Published immediately (simple system).
 */

const ADMIN_ID = "usr-admin-01"; // Md. Rafiqul Islam
const TCH03_ID = "usr-teacher-03"; // Md. Anisur Rahman (class teacher, Ten Science)
const TCH05_ID = "usr-teacher-05"; // Shamima Akter (science department)

interface NoticeSpec {
  id: string;
  title: string;
  bodyMd: string;
  audience: Notice["audience"];
  classId?: string;
  authorId: string;
  publishedAt: string;
  priority?: NoticePriority;
}

const SPECS: NoticeSpec[] = [
  {
    id: "ntc-001",
    title: "First Term Examination Routine 2026 Published",
    bodyMd:
      "The First Term Examination for classes Nine and Ten starts on **6 April 2026**. The full routine is posted on the notice board outside the academic office.\n\n- Exams begin at 10:00 AM sharp; students must be seated by 9:45 AM.\n- Bring your own instruments; borrowing is not allowed in the exam hall.\n- Mobile phones are strictly prohibited.",
    audience: "all",
    authorId: ADMIN_ID,
    publishedAt: "2026-03-02T09:00:00.000Z",
    priority: "important",
  },
  {
    id: "ntc-002",
    title: "Parent-Teacher Meeting — Classes Nine & Ten",
    bodyMd:
      "A parent-teacher meeting will be held on **Saturday, 11 April 2026 at 10:00 AM** in the college auditorium. First Term answer scripts will be shown to guardians.\n\nGuardians are requested to bring the invitation slip sent with the student.",
    audience: "all",
    authorId: ADMIN_ID,
    publishedAt: "2026-04-05T11:00:00.000Z",
  },
  {
    id: "ntc-003",
    title: "April Tuition Fee Reminder",
    bodyMd:
      "Students are reminded that the April 2026 tuition fee must be paid by **20 April 2026**. A late fee of 100 taka per week applies after the deadline.\n\nPayments are accepted at the accounts office (Room 104) from 9:00 AM to 2:00 PM on school days.",
    audience: "students",
    authorId: ADMIN_ID,
    publishedAt: "2026-04-10T09:30:00.000Z",
  },
  {
    id: "ntc-004",
    title: "May Day Holiday",
    bodyMd:
      "The college will remain closed on **1 May 2026 (Friday)** on the occasion of May Day. Classes resume on Sunday, 3 May 2026 as usual.",
    audience: "all",
    authorId: ADMIN_ID,
    publishedAt: "2026-04-28T10:00:00.000Z",
  },
  {
    id: "ntc-005",
    title: "First Term Results Published",
    bodyMd:
      "First Term results for all classes have been published and are now visible under **Results** in the student portal. Mark sheets can be collected from the class teacher after the parent-teacher meeting.\n\nStudents with attendance below 75% are advised to meet the academic coordinator.",
    audience: "students",
    authorId: ADMIN_ID,
    publishedAt: "2026-04-25T14:00:00.000Z",
    priority: "important",
  },
  {
    id: "ntc-006",
    title: "Annual Science Fair 2026 — Registration Open",
    bodyMd:
      "Registration for the Annual Science Fair is open until **20 May 2026**. Projects may be individual or in teams of up to three.\n\nRegister with your science teacher. The fair will be held on 5 June 2026 in the college playground.",
    audience: "students",
    authorId: TCH05_ID,
    publishedAt: "2026-05-04T09:00:00.000Z",
  },
  {
    id: "ntc-007",
    title: "Class Party — Class Ten (Science)",
    bodyMd:
      "Our class party is planned for **Thursday, 28 May 2026** after the sixth period in the classroom. Each student contributes 200 taka to the class fund.\n\nVolunteers for decoration should meet the class captain on Monday.",
    audience: "class",
    classId: CLASS_IDS.tenScience,
    authorId: TCH03_ID,
    publishedAt: "2026-05-18T13:00:00.000Z",
  },
  {
    id: "ntc-008",
    title: "Staff Meeting: Marks Submission Deadline",
    bodyMd:
      "All subject teachers must submit their Half Yearly mark sheets by **30 September 2026**. Draft sheets pending for more than seven days will be returned by the academic office.\n\nAttendance marks entry should be up to date before submission.",
    audience: "teachers",
    authorId: ADMIN_ID,
    publishedAt: "2026-09-15T08:30:00.000Z",
    priority: "important",
  },
];

export const seedNotices: Notice[] = SPECS.map((spec) => ({
  id: spec.id,
  title: spec.title,
  bodyMd: spec.bodyMd,
  audience: spec.audience,
  ...(spec.classId !== undefined ? { classId: spec.classId } : {}),
  authorId: spec.authorId,
  publishedAt: spec.publishedAt,
  priority: spec.priority ?? "normal",
}));
