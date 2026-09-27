"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Class-wise average GPA for one published exam (admin dashboard), on the
 * 5.00 scale. Classes with no results yet show as zero and are also listed
 * in the text summary so the gap is visible without the pixels.
 */
export function ClassGpaChart({
  data,
  termLabel,
}: {
  data: Array<{ label: string; averageGpa: number; studentsWithResults: number }>;
  termLabel: string;
}) {
  const summary =
    data.length === 0
      ? "No classes"
      : data
          .map((d) => `${d.label}: ${d.averageGpa.toFixed(2)} (${d.studentsWithResults} students)`)
          .join("; ");

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Bar chart of average GPA per class for ${termLabel}. ${summary}.`}
        className="h-52 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#5b6b80" }}
              interval={0}
              tickFormatter={(value: string) => value.replace("Class ", "").replace(" (", " (")}
            />
            <YAxis
              domain={[0, 5]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: 11, fill: "#5b6b80" }}
            />
            <Tooltip
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(2)} (of ${item.payload?.studentsWithResults ?? 0} students)`,
                "Average GPA",
              ]}
              labelStyle={{ color: "#101826" }}
              contentStyle={{
                border: "1px solid #dbe3ec",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <ReferenceLine y={5} stroke="#dbe3ec" strokeDasharray="3 3" />
            <Bar dataKey="averageGpa" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-relaxed text-muted">{summary}</p>
    </div>
  );
}
