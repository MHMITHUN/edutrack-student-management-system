"use client";

import { useActionState } from "react";
import { setUserStatusAction, type UserStatusFormState } from "@/app/actions/users";
import { Button } from "@/components/ui/Button";

/**
 * Enable/disable toggle for one user row (admin users page). The action
 * guards again server-side, blocks self-disable, writes the audit row and
 * revalidates the page; this component only submits and surfaces the result.
 */
export function UserStatusToggle({
  userId,
  name,
  status,
}: {
  userId: string;
  name: string;
  status: "active" | "disabled";
}) {
  const [state, formAction, isPending] = useActionState(
    setUserStatusAction,
    {} as UserStatusFormState,
  );
  const nextStatus = status === "active" ? "disabled" : "active";

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={nextStatus} />
        <Button
          type="submit"
          size="sm"
          variant={status === "active" ? "outline" : "secondary"}
          loading={isPending}
          aria-label={`${nextStatus === "disabled" ? "Disable" : "Enable"} account ${name}`}
        >
          {status === "active" ? "Disable" : "Enable"}
        </Button>
      </form>
      {state.error && (
        <span role="alert" className="max-w-44 text-xs leading-snug text-danger">
          {state.error}
        </span>
      )}
      {state.message && (
        <span role="status" className="max-w-44 text-xs leading-snug text-success">
          Done
        </span>
      )}
    </div>
  );
}
