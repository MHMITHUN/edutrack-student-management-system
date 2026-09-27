import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LabeledInput,
  LabeledSelect,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
  TableEmpty,
} from "@/components/ui";
import { formatDateTime, searchParam } from "@/lib/utils";
import type { Role } from "@/lib/db/types";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

const ACTION_OPTIONS = [
  "marksheet.save",
  "marksheet.submit",
  "marksheet.publish",
  "marksheet.return",
  "attendance.save",
  "notice.create",
  "settings.update",
  "user.create",
  "user.update",
];

const ROLES: Role[] = ["ADMIN", "TEACHER", "STUDENT"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"], "/admin/audit");
  const sp = await searchParams;
  const store = await getStore();

  const action = searchParam(sp, "action") ?? "";
  const role = searchParam(sp, "role") ?? "";
  const dateFrom = searchParam(sp, "from") ?? "";
  const dateTo = searchParam(sp, "to") ?? "";
  const pageRaw = Number(searchParam(sp, "page") ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const fromValid = ISO_DATE.test(dateFrom);
  const toValid = ISO_DATE.test(dateTo);
  const dateInvalid = (dateFrom !== "" && !fromValid) || (dateTo !== "" && !toValid);

  const result = await store.listAuditLogs({
    ...(action !== "" ? { action } : {}),
    ...(ROLES.includes(role as Role) ? { actorRole: role as Role } : {}),
    ...(fromValid ? { dateFrom } : {}),
    ...(toValid ? { dateTo } : {}),
    page,
    pageSize: 20,
  });

  const queryFor = (nextPage: number) => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (role) params.set("role", role);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("page", String(nextPage));
    return `/admin/audit?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit Log"
        description={`Every mutation — ${result.total} entries, newest first, 20 per page. Rows are written by real actions, never fabricated.`}
      />

      <form method="get" action="/admin/audit">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="au-role"
              label="Actor role"
              name="role"
              defaultValue={role}
              className="min-w-40 flex-1"
              options={[
                { value: "", label: "All roles" },
                ...ROLES.map((option) => ({ value: option, label: option })),
              ]}
            />
            <LabeledSelect
              id="au-action"
              label="Action"
              name="action"
              defaultValue={action}
              className="min-w-48 flex-1"
              options={[
                { value: "", label: "All actions" },
                ...ACTION_OPTIONS.map((option) => ({ value: option, label: option })),
              ]}
            />
            <LabeledInput
              id="au-from"
              label="From date"
              name="from"
              type="date"
              defaultValue={dateFrom}
              className="min-w-40 flex-1"
            />
            <LabeledInput
              id="au-to"
              label="To date"
              name="to"
              type="date"
              defaultValue={dateTo}
              className="min-w-40 flex-1"
            />
            <div>
              <Button type="submit" variant="outline">
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {dateInvalid && (
        <p role="alert" className="text-sm text-danger">
          Dates must be yyyy-mm-dd — the date filters were ignored.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Entries {result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1}–
            {Math.min(result.page * result.pageSize, result.total)} of {result.total}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TH className="w-44">When (UTC)</TH>
                <TH className="w-40">Actor</TH>
                <TH className="w-40">Action</TH>
                <TH className="w-36">Resource</TH>
                <TH>Detail</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.logs.length === 0 && (
                <TableEmpty colSpan={5}>No audit entries match these filters.</TableEmpty>
              )}
              {result.logs.map((log) => (
                <TableRow key={log.id}>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDateTime(log.createdAt)}
                  </TD>
                  <TD className="font-medium">{log.actorName}</TD>
                  <TD>
                    <Badge tone="accent">{log.action}</Badge>
                  </TD>
                  <TD className="text-muted">
                    {log.resource}
                    <span className="block text-xs text-muted">{log.resourceId}</span>
                  </TD>
                  <TD>
                    {log.metadata ? (
                      <code
                        className="block max-w-md truncate font-mono text-xs text-muted"
                        title={JSON.stringify(log.metadata)}
                      >
                        {JSON.stringify(log.metadata)}
                      </code>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <nav aria-label="Pagination" className="flex items-center justify-between">
        {result.page > 1 ? (
          <Link
            href={queryFor(result.page - 1)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Previous page
          </Link>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted">
          Page {result.page} of {result.pageCount}
        </span>
        {result.page < result.pageCount ? (
          <Link
            href={queryFor(result.page + 1)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Next page
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
