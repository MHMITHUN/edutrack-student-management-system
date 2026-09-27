"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Auth server actions. EduTrack is an internal school system — there is no
 * public self-registration; accounts are managed by the administrator.
 */

export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

/** Landing page per role after sign-in. */
function homeForRole(role: "ADMIN" | "TEACHER" | "STUDENT"): string {
  if (role === "ADMIN") return "/admin";
  if (role === "TEACHER") return "/teacher";
  return "/student";
}

/** First validation message per field, from a zod error's issues. */
function fieldErrorsFromIssues(
  issues: z.ZodIssue[],
): AuthFormState["fieldErrors"] {
  const out: AuthFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if ((key === "email" || key === "password") && !out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  // Only same-site absolute paths, no protocol tricks.
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return { fieldErrors: fieldErrorsFromIssues(issues) };
  }

  const { email, password } = parsed.data;
  const store = await getStore();
  const user = await store.getUserByEmail(email);
  if (
    !user ||
    user.status !== "active" ||
    !verifyPassword(password, user.passwordHash)
  ) {
    return { error: "Incorrect email or password." };
  }

  await setSessionCookie(
    createSessionToken({ uid: user.id, role: user.role }),
  );

  const next = safeNextPath(formData.get("next"));
  redirect(next ?? homeForRole(user.role));
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
