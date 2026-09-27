import type { Metadata } from "next";
import { Info } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { GradeBandsEditor } from "@/components/settings/GradeBandsEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Grading rules editor (spec 18.5: "allow the school configuration to change
 * them"). Bands are read live from the settings document and saved through
 * the settings service, which validates and audits every change — grade and
 * GPA computations everywhere pick the new rules up on their next read
 * (nothing caches band tables in modules).
 */
export default async function AdminSettingsPage() {
  await requireRole(["ADMIN"], "/admin/settings");
  const store = await getStore();
  const settings = await store.getSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="School-wide grading rules and thresholds. Changes are audited and apply to every future computation immediately."
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Grade bands, fail rule and attendance threshold</CardTitle>
        </CardHeader>
        <CardContent>
          <GradeBandsEditor
            initialBands={settings.gradeBands}
            failCapsGpa={settings.failCapsGpa}
            attendanceWarnPercent={settings.attendanceWarnPercent}
          />
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-1 text-sm text-muted">
            <p>
              Bands must together cover every mark from 0 to 100 with no gaps or
              overlaps (e.g. 0-32, 33-39, … 80-100). A subject fails when its
              band carries 0.00 points.
            </p>
            <p>
              Stored marks are never rewritten — but grades and GPAs are always
              interpreted live from this table, so changing bands immediately
              changes how existing marks (including already-published ones)
              display everywhere. The audit entry records the previous table in
              the log history.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
