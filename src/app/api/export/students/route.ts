import type { NextRequest } from "next/server";
import { apiGuard } from "@/lib/auth/guards";
import { getStore } from "@/lib/db";
import { csvResponse, csvTimestamp, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Admin CSV export of the student directory (roll, name, class, guardian,
 * phone). Every row comes straight from the store — this handler only
 * serializes. GET so the dashboard link can simply point at it.
 */
export async function GET(_req: NextRequest) {
  const guard = await apiGuard(_req, ["ADMIN"]);
  if ("response" in guard) return guard.response;

  const store = await getStore();
  const [students, classes] = await Promise.all([
    store.listStudents(),
    store.listClasses(),
  ]);
  const classLabel = (classId: string) => {
    const klass = classes.find((c) => c.id === classId);
    return klass ? `${klass.name} (${klass.section})` : classId;
  };

  const csv = toCsv(
    ["Roll", "Name", "Class", "Guardian", "Guardian Phone"],
    students.map((s) => [s.roll, s.name, classLabel(s.classId), s.guardianName, s.guardianPhone]),
  );
  return csvResponse(`edutrack-students-${csvTimestamp()}.csv`, csv);
}
