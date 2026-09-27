import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { MarkSheetStatus } from "@/lib/db/types";

/** Consistent status badge for mark sheets across teacher/admin/student views. */
const MAP: Record<MarkSheetStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  submitted: { tone: "warning", label: "Submitted" },
  published: { tone: "success", label: "Published" },
};

export function MarkSheetStatusBadge({ status }: { status: MarkSheetStatus }) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
