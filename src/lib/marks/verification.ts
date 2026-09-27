import { createHash } from "node:crypto";

/**
 * Deterministic verification ID for printed marksheets (spec 18.8). The same
 * student+exam+year always produces the same 10-character key, so a printed
 * sheet can be matched against the system later. This is a DEMO lookup key —
 * every print labels it as such; it is not a cryptographic seal.
 */
export function verificationId(
  studentId: string,
  exam: string,
  year: string,
): string {
  return createHash("sha256")
    .update(`${studentId}|${exam}|${year}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}
