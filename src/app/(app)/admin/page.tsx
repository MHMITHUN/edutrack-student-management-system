import type { Metadata } from "next";
import Link from "next/link";
import {
  ScrollText,
  BookOpenCheck,
  CalendarRange,
  ClipboardCheck,
  Download,
  School,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import {
  attendanceByMonth,
  classAverageGpa,
  computeAdminKpis,
  gradeDistribution,
  latestPublishedTerm,
} from "@/lib/analytics/dashboard";
import { GradeDistributionChart } from "@/components/charts/GradeDistributionChart";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ClassGpaChart } from "@/components/charts/ClassGpaChart";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  {
    href: "/admin/marks?status=submitted",
    label: "Review submitted sheets",
    icon: ClipboardCheck,
    description: "Publish or return pending results",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
    description: "Accounts, roles, enable/disable",
  },
  {
    href: "/admin/classes",
    label: "Classes",
    icon: School,
    description: "Rosters and sheet status",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: ScrollText,
    description: "Every mutation, newest first",
  },
  {
    href: "/admin/settings",
    label: "Grading settings",
    icon: Settings,
    description: "Bands, fail rule, threshold",
  },
  {
    href: "/api/export/students",
    label: "Export students (CSV)",
    icon: Download,
    description: "Roll, name, class, guardian",
  },
];

/** Every figure on this page is computed from the store — nothing is mocked. */
export default async function AdminDashboardPage() {
  await requireRole(["ADMIN"], "/admin");
  const store = await getStore();

  const [students, teachers, classes, sheets, records, settings, years, audit] =
    await Promise.all([
      store.listStudents(),
      store.listTeachers(),
      store.listClasses(),
      store.listMarkSheets(),
      store.listAttendanceRecords(),
      store.getSettings(),
      store.listAcademicYears(),
      store.listAuditLogs({ page: 1, pageSize: 8 }),
    ]);

  const kpis = computeAdminKpis({ students, teachers, classes, sheets, attendanceRecords: records });
  const activeYear = years.find((y) => y.active);

  const term = latestPublishedTerm(sheets);
  const termSheets = term
    ? sheets.filter(
        (s) =>
          s.status === "published" && s.exam === term.exam && s.academicYearId === term.academicYearId,
      )
    : [];
  const termLabel = term
    ? `${term.exam} ${years.find((y) => y.id === term.academicYearId)?.label ?? ""}`.trim()
    : "";
  const distribution = gradeDistribution(termSheets, settings.gradeBands);
  const classGpas = term
    ? classAverageGpa({
        sheets,
        exam: term.exam,
        academicYearId: term.academicYearId,
        settings,
        classes,
        students,
      })
    : [];
  const months = attendanceByMonth(records);

  const kpiCards = [
    {
      label: "Students",
      value: String(kpis.totalStudents),
      icon: UsersRound,
      hint: "Active roster",
    },
    {
      label: "Teachers",
      value: String(kpis.totalTeachers),
      icon: Users,
      hint: "Teaching staff",
    },
    { label: "Classes", value: String(kpis.totalClasses), icon: School, hint: "Sections" },
    {
      label: "Published results",
      value: String(kpis.publishedSheets),
      icon: BookOpenCheck,
      hint: "Sheets visible to students",
    },
    {
      label: "Pending review",
      value: String(kpis.pendingSubmittedSheets),
      icon: ClipboardCheck,
      hint: "Submitted, not yet published",
    },
    {
      label: "Avg attendance",
      value: kpis.averageAttendancePercent === null ? "—" : `${kpis.averageAttendancePercent}%`,
      icon: CalendarRange,
      hint: `${records.length} recorded sessions`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin Dashboard"
        description={
          activeYear
            ? `EduTrack Demo School — academic year ${activeYear.label}. Every number below is computed live from the store.`
            : "EduTrack Demo School — every number below is computed live from the store."
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="flex flex-col gap-2 p-4">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-2xl font-semibold tabular-nums text-fg">{kpi.value}</span>
                <span className="text-xs font-medium text-fg">{kpi.label}</span>
                <span className="text-[11px] leading-snug text-muted">{kpi.hint}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Grade distribution</CardTitle>
            {term && <Badge tone="accent">{termLabel}</Badge>}
          </CardHeader>
          <CardContent>
            {term ? (
              <GradeDistributionChart data={distribution} termLabel={termLabel} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                No published exam yet — grades appear here once results are published.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Attendance trend</CardTitle>
            <Badge tone="neutral">warn {settings.attendanceWarnPercent}%</Badge>
          </CardHeader>
          <CardContent>
            {months.length > 0 ? (
              <AttendanceTrendChart data={months} warnPercent={settings.attendanceWarnPercent} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                No attendance recorded yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Average GPA by class</CardTitle>
            {term && <Badge tone="accent">{termLabel}</Badge>}
          </CardHeader>
          <CardContent>
            {term ? (
              <ClassGpaChart
                data={classGpas.map((row) => ({
                  label: row.label,
                  averageGpa: row.averageGpa,
                  studentsWithResults: row.studentsWithResults,
                }))}
                termLabel={termLabel}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                No published exam yet — class averages appear after publishing.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Recent audit activity</CardTitle>
            <Link
              href="/admin/audit"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              View all {audit.total} entries
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH className="w-44">When (UTC)</TH>
                  <TH className="w-40">Actor</TH>
                  <TH className="w-40">Action</TH>
                  <TH>Resource</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDateTime(log.createdAt)}</TD>
                    <TD className="font-medium">{log.actorName}</TD>
                    <TD>
                      <Badge tone="accent">{log.action}</Badge>
                    </TD>
                    <TD className="text-muted">
                      {log.resource} <span className="text-xs">#{log.resourceId}</span>
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-fg">{link.label}</span>
                    <span className="truncate text-xs text-muted">{link.description}</span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
