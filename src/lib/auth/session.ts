import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";

/**
 * Stateless session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 *
 * SECURITY NOTE: when SESSION_SECRET is unset we fall back to a fixed demo
 * secret so the app runs out of the box. Production deployments MUST set
 * SESSION_SECRET (see .env.example) — with the fallback secret anyone could
 * forge a session token.
 */

const DEMO_FALLBACK_SECRET = "demo-session-secret-change-me";

export const SESSION_COOKIE = "edutrack_session";
/** 7 days in seconds. */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export const SessionPayloadSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
  /** Unix expiry in seconds. */
  exp: z.number().int().positive(),
});
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

function getSecret(): string {
  return process.env.SESSION_SECRET || DEMO_FALLBACK_SECRET;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function sign(data: string): Buffer {
  return createHmac("sha256", getSecret()).update(data).digest();
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const full: SessionPayload = { ...payload, exp };
  const encodedPayload = base64UrlEncode(JSON.stringify(full));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const encodedPayload = token.slice(0, dotIndex);
  const encodedSignature = token.slice(dotIndex + 1);

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = sign(encodedPayload);
    actual = base64UrlDecode(encodedSignature);
  } catch {
    return null;
  }

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = SessionPayloadSchema.safeParse(
      JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")),
    );
    if (!parsed.success) return null;

    const { exp } = parsed.data;
    if (exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Set the session cookie (httpOnly, lax, secure in production, 7d). */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clear the session cookie. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
