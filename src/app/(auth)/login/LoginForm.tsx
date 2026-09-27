"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

const initialState: AuthFormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      <input type="hidden" name="next" value={next ?? ""} />

      <Field label="Email" name="login-email" error={state.fieldErrors?.email}>
        {(aria) => (
          <Input
            id={aria.id}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@demo.local"
            invalid={aria.invalid}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
          />
        )}
      </Field>

      <Field
        label="Password"
        name="login-password"
        error={state.fieldErrors?.password}
      >
        {(aria) => (
          <Input
            id={aria.id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            invalid={aria.invalid}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
          />
        )}
      </Field>

      <Button type="submit" loading={pending} className="mt-2 w-full">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
