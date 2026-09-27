"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { UserStatus } from "@/lib/db/types";

/**
 * User account actions (admin). Toggling a user's status is the one honest
 * CRUD mutation here: a disabled account keeps all of its history but can no
 * longer sign in (getSessionUser rejects non-active users) and any live
 * session stops working on the next request. The change is audited.
 */

export interface UserStatusFormState {
  error?: string;
  message?: string;
}

export async function setUserStatusAction(
  _prev: UserStatusFormState,
  formData: FormData,
): Promise<UserStatusFormState> {
  const user = await requireRole(["ADMIN"], "/admin/users");
  const store = await getStore();

  const userId = String(formData.get("userId") ?? "");
  const requested = String(formData.get("status") ?? "");
  if (requested !== "active" && requested !== "disabled") {
    return { error: "Unknown account status." };
  }
  const status: UserStatus = requested;
  if (userId === user.id && status === "disabled") {
    return { error: "You cannot disable your own account while signed in." };
  }

  const target = await store.getUserById(userId);
  if (!target) return { error: "That user no longer exists." };
  if (target.status === status) {
    return { message: `No change — ${target.name} is already ${status}.` };
  }

  const updated = await store.setUserStatus(userId, status);
  if (!updated) return { error: "Could not update the account." };

  await logAudit({ id: user.id, name: user.name }, "user.update", "user", userId, {
    status,
    name: updated.name,
    role: updated.role,
  });

  revalidatePath("/admin/users");
  return {
    message:
      status === "disabled"
        ? `${updated.name} is disabled — the account can no longer sign in.`
        : `${updated.name} is re-enabled and can sign in again.`,
  };
}
