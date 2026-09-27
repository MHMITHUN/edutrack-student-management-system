import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * scrypt password hashing (src/lib/auth/password.ts):
 * roundtrip, rejection of wrong passwords, unique salts per hash and
 * rejection of malformed stored values.
 */

describe("hashPassword / verifyPassword", () => {
  it("roundtrips: a hashed password verifies as correct", () => {
    const stored = hashPassword("Demo@12345");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Demo@12345", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("Demo@12345");
    expect(verifyPassword("Demo@12346", stored)).toBe(false);
    expect(verifyPassword("demo@12345", stored)).toBe(false); // case-sensitive
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("generates a unique salt per hash (same password, different stored values)", () => {
    const first = hashPassword("SamePassword1!");
    const second = hashPassword("SamePassword1!");
    expect(first).not.toBe(second);

    const [, saltA] = first.split("$");
    const [, saltB] = second.split("$");
    expect(saltA).not.toBe(saltB);

    // Both hashes must still verify against the same password.
    expect(verifyPassword("SamePassword1!", first)).toBe(true);
    expect(verifyPassword("SamePassword1!", second)).toBe(true);
  });

  it("rejects malformed stored hashes instead of throwing", () => {
    expect(verifyPassword("Demo@12345", "")).toBe(false);
    expect(verifyPassword("Demo@12345", "plaintext")).toBe(false);
    expect(verifyPassword("Demo@12345", "bcrypt$salt$hash")).toBe(false);
    expect(verifyPassword("Demo@12345", "scrypt$onlytwo")).toBe(false);
    expect(verifyPassword("Demo@12345", "scrypt$$hash")).toBe(false); // empty salt
    expect(verifyPassword("Demo@12345", "scrypt$salt$")).toBe(false); // empty hash
    expect(verifyPassword("Demo@12345", "scrypt$not-hex$also-not-hex")).toBe(false);
  });
});
