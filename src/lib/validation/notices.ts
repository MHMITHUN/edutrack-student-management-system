import { z } from "zod";
import { NoticeAudienceSchema, NoticePrioritySchema } from "@/lib/db/types";

/**
 * Notice request schema, shared by the notices server action and unit tests.
 * Lives outside the "use server" file (those may only export async functions).
 */
export const noticeSchema = z
  .object({
    title: z.string().trim().min(4, "Title must be at least 4 characters.").max(120, "Title must be at most 120 characters."),
    bodyMd: z.string().trim().min(10, "The notice body must be at least 10 characters.").max(4000, "The notice body must be at most 4000 characters."),
    audience: NoticeAudienceSchema,
    classId: z.string().trim().optional(),
    priority: NoticePrioritySchema.default("normal"),
  })
  .refine((data) => data.audience !== "class" || (data.classId ?? "") !== "", {
    message: "Choose the class this notice targets.",
    path: ["classId"],
  });

export type NoticeInput = z.infer<typeof noticeSchema>;
