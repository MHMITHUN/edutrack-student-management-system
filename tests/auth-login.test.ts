import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loginAction } from "@/app/actions/auth";
import {
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth/session";
import { getStore, resetStoreForTests, type Store } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

/**
 * loginAction unit tests: validation, the single generic failure message
 * (unknown email / wrong password / DISABLED account), the session cookie
 * the action sets, and where each role lands after sign-in. cookies() and
 * redirect() are mocked so the "use server" action runs as a function.
 */

const harness = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    clear: () => jar.clear(),
    cookies: async () => ({
      get: (name: string) =>
        jar.has(name) ? { name, value: jar.get(name) as string } : undefined,
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
    }),
  };
});

const redirectLog = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("next/headers", () => ({ cookies: harness.cookies }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    redirectLog.urls.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

function loginFormData(email: string, password: string, next?: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  if (next !== undefined) fd.set("next", next);
  return fd;
}

let store: Store;

beforeEach(async () => {
  process.env.SESSION_SECRET = "login-test-secret";
  resetStoreForTests();
  resetRateLimitsForTests();
  delete process.env.MONGODB_URI;
  harness.clear();
  redirectLog.urls.length = 0;
  // loginAction reads users through the getStore() singleton — disable the
  // account on THAT instance so the action actually sees it.
  store = await getStore();
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("loginAction — validation", () => {
  it("returns per-field errors for an invalid email and empty password", async () => {
    const state = await loginAction({}, loginFormData("not-an-email", ""));
    expect(state.error).toBeUndefined();
    expect(state.fieldErrors?.email).toBe("Enter a valid email address.");
    expect(state.fieldErrors?.password).toBe("Password is required.");

    // Nothing was signed in: no cookie, no redirect.
    expect(harness.jar.has(SESSION_COOKIE)).toBe(false);
    expect(redirectLog.urls).toEqual([]);
  });
});

describe("loginAction — failed sign-ins", () => {
  it("gives the same generic error for an unknown email", async () => {
    const state = await loginAction(
      {},
      loginFormData("nobody@demo.local", "Demo@12345"),
    );
    expect(state).toEqual({ error: "Incorrect email or password." });
    expect(harness.jar.has(SESSION_COOKIE)).toBe(false);
    expect(redirectLog.urls).toEqual([]);
  });

  it("gives the same generic error for a wrong password", async () => {
    const state = await loginAction(
      {},
      loginFormData("admin@demo.local", "Wrong@12345"),
    );
    expect(state).toEqual({ error: "Incorrect email or password." });
    expect(harness.jar.has(SESSION_COOKIE)).toBe(false);
    expect(redirectLog.urls).toEqual([]);
  });

  it("blocks a DISABLED account even with the correct password", async () => {
    // stu-060 (Payel Sen, Class Ten Business) is disabled by the admin first.
    const user = await store.getUserByEmail("payel.sen@std.demo.local");
    expect(user?.status).toBe("active");
    await store.setUserStatus(user!.id, "disabled");

    const state = await loginAction(
      {},
      loginFormData("payel.sen@std.demo.local", "Demo@12345"),
    );
    expect(state).toEqual({ error: "Incorrect email or password." });

    // No session cookie was set and no redirect happened.
    expect(harness.jar.has(SESSION_COOKIE)).toBe(false);
    expect(redirectLog.urls).toEqual([]);
  });
});

describe("loginAction — brute-force guard", () => {
  it("refuses even correct credentials once the per-email limit is hit", async () => {
    // 10 failed attempts exhaust the 10-per-10-minutes window ...
    for (let i = 0; i < 10; i += 1) {
      const state = await loginAction(
        {},
        loginFormData("teacher@demo.local", "Wrong@12345"),
      );
      expect(state).toEqual({ error: "Incorrect email or password." });
    }

    // ... so the 11th attempt is refused with a generic message before the
    // credential check, even with the correct password.
    const state = await loginAction(
      {},
      loginFormData("teacher@demo.local", "Demo@12345"),
    );
    expect(state.error).toMatch(
      /^Too many attempts - try again in \d+ minutes?\.$/,
    );
    expect(state.fieldErrors).toBeUndefined();

    // Nothing was signed in: no cookie, no redirect.
    expect(harness.jar.has(SESSION_COOKIE)).toBe(false);
    expect(redirectLog.urls).toEqual([]);
  });

  it("counts attempts per email — another account is unaffected", async () => {
    for (let i = 0; i < 10; i += 1) {
      await loginAction({}, loginFormData("nobody@demo.local", "Wrong@12345"));
    }
    const state = await loginAction(
      {},
      loginFormData("admin@demo.local", "Wrong@12345"),
    );
    expect(state).toEqual({ error: "Incorrect email or password." });
  });
});

describe("loginAction — successful sign-ins", () => {
  it("sets a verifiable session cookie and lands the student on /student", async () => {
    await expect(
      loginAction({}, loginFormData("student@demo.local", "Demo@12345")),
    ).rejects.toThrow("REDIRECT:/student");

    const token = harness.jar.get(SESSION_COOKIE);
    expect(token).toBeDefined();
    const payload = verifySessionToken(token!);
    expect(payload?.uid).toBe("usr-stu-031");
    expect(payload?.role).toBe("STUDENT");
    expect(redirectLog.urls).toEqual(["/student"]);
  });

  it("lands the teacher on /teacher and the admin on /admin", async () => {
    await expect(
      loginAction({}, loginFormData("teacher@demo.local", "Demo@12345")),
    ).rejects.toThrow("REDIRECT:/teacher");

    harness.clear();
    await expect(
      loginAction({}, loginFormData("admin@demo.local", "Demo@12345")),
    ).rejects.toThrow("REDIRECT:/admin");
  });

  it("honours ?next= only for safe same-site paths", async () => {
    // Safe absolute path: returned to after sign-in.
    await expect(
      loginAction(
        {},
        loginFormData(
          "student@demo.local",
          "Demo@12345",
          "/student/attendance",
        ),
      ),
    ).rejects.toThrow("REDIRECT:/student/attendance");

    // External URL and protocol-relative "//" are ignored -> role home.
    harness.clear();
    await expect(
      loginAction(
        {},
        loginFormData("student@demo.local", "Demo@12345", "https://evil.example"),
      ),
    ).rejects.toThrow("REDIRECT:/student");

    harness.clear();
    await expect(
      loginAction(
        {},
        loginFormData("student@demo.local", "Demo@12345", "//evil.example"),
      ),
    ).rejects.toThrow("REDIRECT:/student");
  });

  it("replaces any previous cookie value on a new sign-in", async () => {
    // A stale cookie from an earlier session must not survive a new login.
    harness.jar.set(SESSION_COOKIE, "stale-token-from-before");

    await expect(
      loginAction({}, loginFormData("student@demo.local", "Demo@12345")),
    ).rejects.toThrow("REDIRECT:/student");

    const token = harness.jar.get(SESSION_COOKIE);
    expect(token).not.toBe("stale-token-from-before");
    expect(verifySessionToken(token!)?.uid).toBe("usr-stu-031");
  });
});
