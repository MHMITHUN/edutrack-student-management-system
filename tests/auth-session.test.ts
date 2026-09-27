import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE,
  type SessionPayload,
} from "@/lib/auth/session";

/**
 * Stateless session tokens (src/lib/auth/session.ts): roundtrip, tamper
 * rejection, expiry rejection and payload-schema enforcement. Cookie helper
 * functions (setSessionCookie etc.) need a Next.js request scope and are
 * covered by the e2e login flow instead.
 */

const TEST_SECRET = "unit-test-session-secret";

/** Sign a payload with the same scheme the module uses (HMAC-SHA256). */
function forgeToken(payload: SessionPayload, secret: string): string {
  const b64url = (input: Buffer | string) =>
    Buffer.from(input)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest();
  return `${encoded}.${b64url(signature)}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("createSessionToken / verifySessionToken", () => {
  it("roundtrips: a fresh token verifies and carries the same uid and role", () => {
    const token = createSessionToken({ uid: "usr-student-01", role: "STUDENT" });
    const payload = verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe("usr-student-01");
    expect(payload!.role).toBe("STUDENT");
    // Expiry is one session-window ahead, never in the past.
    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload!.exp).toBeGreaterThan(nowSec);
    expect(payload!.exp).toBeLessThanOrEqual(nowSec + SESSION_MAX_AGE);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = createSessionToken({ uid: "usr-student-01", role: "STUDENT" });
    const [encodedPayload, encodedSignature] = token.split(".");

    // Decode, escalate the role, re-encode - the signature is untouched.
    const payload = JSON.parse(
      Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as SessionPayload;
    payload.role = "ADMIN";
    const forgedPayload = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(
      verifySessionToken(`${forgedPayload}.${encodedSignature}`),
    ).toBeNull();
  });

  it("rejects a signature made with the wrong secret", () => {
    const payload: SessionPayload = {
      uid: "usr-student-01",
      role: "STUDENT",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    expect(verifySessionToken(forgeToken(payload, "a-different-secret"))).toBeNull();
  });

  it("rejects an expired token", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expired: SessionPayload = {
      uid: "usr-student-01",
      role: "STUDENT",
      exp: nowSec - 1, // one second in the past
    };
    expect(verifySessionToken(forgeToken(expired, TEST_SECRET))).toBeNull();
  });

  it("rejects a token whose expiry is exactly now (boundary is inclusive)", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const boundary: SessionPayload = {
      uid: "usr-student-01",
      role: "STUDENT",
      exp: nowSec,
    };
    expect(verifySessionToken(forgeToken(boundary, TEST_SECRET))).toBeNull();
  });

  it("rejects a valid-signature token with an invalid payload schema", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Role outside the allowed enum - schema must reject after signature check.
    const badRole = forgeToken(
      { uid: "usr-1", role: "SUPERUSER", exp: nowSec + 60 } as unknown as SessionPayload,
      TEST_SECRET,
    );
    expect(verifySessionToken(badRole)).toBeNull();

    // Missing expiry.
    const noExp = forgeToken(
      { uid: "usr-1", role: "STUDENT" } as unknown as SessionPayload,
      TEST_SECRET,
    );
    expect(verifySessionToken(noExp)).toBeNull();

    // Empty uid.
    const emptyUid = forgeToken(
      { uid: "", role: "STUDENT", exp: nowSec + 60 } as unknown as SessionPayload,
      TEST_SECRET,
    );
    expect(verifySessionToken(emptyUid)).toBeNull();
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("nodots")).toBeNull();
    expect(verifySessionToken(".signature")).toBeNull();
    expect(verifySessionToken("payload.")).toBeNull();
    expect(verifySessionToken("not-base64.!!!")).toBeNull();
  });
});
