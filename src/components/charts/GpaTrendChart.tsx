"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The student's GPA across every published exam (student dashboard). Only
 * published terms ever reach this chart, and the values are restated in the
 * text summary below.
 */
export function GpaTrendChart({
  data,
}: {
  data: Array<{ label: string; gpa: number }>;
}) {
  const summary =
    data.length === 0
      ? "No published results yet"
      : `GPA per published exam: ${data.map((d) => `${d.label} ${d.gpa.toFixed(2)}`).join(", ")}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Line chart of your GPA across published exams. ${summary}.`}
        className="h-52 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#5b6b80" }} interval={0} />
            <YAxis
              domain={[0, 5]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: 11, fill: "#5b6b80" }}
            />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(2), "GPA (5.00 scale)"]}
              labelStyle={{ color: "#101826" }}
              contentStyle={{
                border: "1px solid #dbe3ec",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="gpa"
              stroke="#1d4ed8"
              strokeWidth={2}
              dot={{ r: 3, fill: "#1d4ed8" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-relaxed text-muted">{summary}</p>
    </div>
  );
}
