import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import type { Role, User } from "@/lib/db/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { UserStatusToggle } from "@/components/users/UserStatusToggle";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LabeledSelect,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui";
import { formatDate, searchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["ADMIN", "TEACHER", "STUDENT"];

const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: "accent",
  TEACHER: "neutral",
  STUDENT: "neutral",
};

/**
 * Account directory (admin). Scope is honest and tight: role filtering,
 * viewing the linked teacher/student record, and enabling/disabling
 * accounts. A disabled account keeps its history but cannot sign in — the
 * session guard rejects it, and the change is audited.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireRole(["ADMIN"], "/admin/users");
  const sp = await searchParams;
  const store = await getStore();

  const roleParam = searchParam(sp, "role") ?? "";
  const role = ROLES.includes(roleParam as Role) ? (roleParam as Role) : undefined;

  const [users, teachers, students, classes] = await Promise.all([
    store.listUsers(role),
    store.listTeachers(),
    store.listStudents(),
    store.listClasses(),
  ]);

  const describeLink = (user: User): string => {
    if (user.role === "TEACHER") {
      const teacher = teachers.find((t) => t.id === user.linkedId);
      return teacher
        ? `${teacher.designation} · ${teacher.classAssignments.length} class assignments`
        : "—";
    }
    if (user.role === "STUDENT") {
      const student = students.find((s) => s.id === user.linkedId);
      if (!student) return "—";
      const klass = classes.find((c) => c.id === student.classId);
      return klass ? `${klass.name} (${klass.section}) · Roll ${student.roll}` : `Roll ${student.roll}`;
    }
    return "Full administrative access";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Administrator, teacher and student accounts. Disabling an account signs it out everywhere — history is kept, login is refused."
      />

      <form method="get" action="/admin/users">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <LabeledSelect
              id="au-role-filter"
              label="Role"
              name="role"
              defaultValue={role ?? ""}
              className="min-w-44 flex-1"
              options={[
                { value: "", label: "All roles" },
                ...ROLES.map((option) => ({ value: option, label: option })),
              ]}
            />
            <div>
              <Button type="submit" variant="outline">
                Apply Filter
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts match"
          description="No users were found for this filter."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {role ? `${role} accounts` : "All accounts"} ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-0">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH className="w-36">Role</TH>
                  <TH className="w-28">Status</TH>
                  <TH className="w-64">Linked record</TH>
                  <TH className="w-32">Created</TH>
                  <TH className="w-28 text-right">Account</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TD>
                      <span className="block font-medium text-fg">
                        {user.name}
                        {user.id === currentUser.id && (
                          <span className="ml-2 text-xs font-normal text-muted">(you)</span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">{user.email}</span>
                    </TD>
                    <TD>
                      <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={user.status === "active" ? "success" : "danger"}>
                        {user.status === "active" ? "Active" : "Disabled"}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{describeLink(user)}</TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatDate(user.createdAt)}
                    </TD>
                    <TD className="text-right">
                      <UserStatusToggle
                        userId={user.id}
                        name={user.name}
                        status={user.status}
                      />
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
