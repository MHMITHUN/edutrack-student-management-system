import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui";

/**
 * Honest placeholder for sections whose feature pages land in later
 * milestones (spec section 36: never fake functionality) — replaced by the
 * real page content when each area is built.
 */
export function SectionPlaceholder({
  title,
  description,
  icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      className="mt-6"
    />
  );
}
