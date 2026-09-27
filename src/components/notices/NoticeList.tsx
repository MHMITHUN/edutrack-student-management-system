import { Megaphone } from "lucide-react";
import type { Notice, SchoolClass } from "@/lib/db/types";
import { AUDIENCE_LABELS } from "@/lib/notices/rules";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";

/**
 * Notice feed shared by the admin, teacher and student notice pages. The
 * caller decides which notices reach this component (audience rules in
 * src/lib/notices/rules.ts); rendering is identical for every role.
 */
export function NoticeList({
  notices,
  classes,
  authorNames,
}: {
  notices: Notice[];
  classes: SchoolClass[];
  authorNames: Record<string, string>;
}) {
  if (notices.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No notices"
        description="Notices addressed to you will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {notices.map((notice) => {
        const klass = notice.classId
          ? classes.find((c) => c.id === notice.classId)
          : null;
        return (
          <Card key={notice.id}>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {notice.priority === "important" && (
                  <Badge tone="danger">Important</Badge>
                )}
                <Badge tone={notice.audience === "teachers" ? "accent" : "neutral"}>
                  {notice.audience === "class" && klass
                    ? `${klass.name} (${klass.section})`
                    : AUDIENCE_LABELS[notice.audience]}
                </Badge>
                <span className="text-xs text-muted">
                  {formatDate(notice.publishedAt)} · {authorNames[notice.authorId] ?? "School office"}
                </span>
              </div>
              <h3 className="text-base font-semibold text-fg">{notice.title}</h3>
              <p className="whitespace-pre-line text-sm text-fg">{notice.bodyMd}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
