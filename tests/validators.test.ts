import { describe, it, expect } from "vitest";
import { loginSchema } from "@/lib/validation/auth";

/** Login schema (src/lib/validation/auth.ts). */

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const parsed = loginSchema.safeParse({
      email: "teacher@demo.local",
      password: "Demo@12345",
    });
    expect(parsed.success).toBe(true);
  });

  it("trims the email before validating", () => {
    const parsed = loginSchema.safeParse({
      email: "  student@demo.local  ",
      password: "Demo@12345",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing email, invalid email and missing password", () => {
    expect(
      loginSchema.safeParse({ email: "", password: "Demo@12345" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "x" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@demo.local", password: "" }).success,
    ).toBe(false);
  });
});
