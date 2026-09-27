"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Grade distribution for one published exam (admin dashboard). Client-side
 * recharts; the same counts always appear in the text summary below the
 * chart, so screen readers and print get the identical numbers.
 */
export function GradeDistributionChart({
  data,
  termLabel,
}: {
  data: Array<{ grade: string; count: number }>;
  termLabel: string;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const summary =
    total === 0
      ? "No entries"
      : `${total} subject entries: ${data.map((d) => `${d.grade} ${d.count}`).join(", ")}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Bar chart of grade distribution for ${termLabel}. ${summary}.`}
        className="h-52 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="grade" tick={{ fontSize: 11, fill: "#5b6b80" }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5b6b80" }} />
            <Tooltip
              formatter={(value) => [value, "Entries"]}
              labelStyle={{ color: "#101826" }}
              contentStyle={{
                border: "1px solid #dbe3ec",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-relaxed text-muted">{summary}</p>
    </div>
  );
}
