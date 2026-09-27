import { z } from "zod";

/**
 * Auth request schemas, shared by the server actions in
 * src/app/actions/auth.ts and unit-tested in tests/validators.test.ts.
 * Kept in this module — a "use server" file may only export async functions,
 * so the schemas must live outside it to be importable by tests.
 */

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
