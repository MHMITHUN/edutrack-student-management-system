import { getStore, type Store } from "@/lib/db";

/**
 * Audit trail helper (spec 18.9). EVERY mutation in the app goes through
 * logAudit — actions call it right after the store write succeeds, so the
 * log is written by actual mutations, never fabricated.
 *
 * Action naming: "<resource>.<verb>" — e.g. "marksheet.submit",
 * "marksheet.publish", "attendance.save", "notice.create", "user.create".
 *
 * Pass an explicit `store` when the caller already holds one (service-layer
 * functions receive their store as a parameter); server actions can omit it
 * and get the process singleton.
 */

export interface AuditActor {
  id: string;
  name: string;
}

export async function logAudit(
  actor: AuditActor,
  action: string,
  resource: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
  store?: Store,
): Promise<void> {
  const target = store ?? (await getStore());
  await target.createAuditLog({
    actorId: actor.id,
    actorName: actor.name,
    action,
    resource,
    resourceId,
    ...(metadata !== undefined ? { metadata } : {}),
  });
}
