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
 * Monthly attendance bar chart (client — recharts renders client-side only).
 * The warning threshold is drawn as a reference line. The same numbers are
 * always available in the table beside the chart, so nothing is locked
 * behind the pixels.
 */
export function MonthlyAttendanceChart({
  data,
  warnPercent,
}: {
  data: Array<{ label: string; percent: number }>;
  warnPercent: number;
}) {
  const summary =
    data.length === 0
      ? "No attendance recorded yet"
      : `Attendance percent per month: ${data
          .map((d) => `${d.label} ${d.percent}%`)
          .join(", ")}`;

  return (
    <div
      role="img"
      aria-label={`Bar chart of monthly attendance. ${summary}. Warning threshold ${warnPercent}%.`}
      className="h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#5b6b80" }}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "#5b6b80" }}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, "Attendance"]}
            labelStyle={{ color: "#101826" }}
            contentStyle={{
              border: "1px solid #dbe3ec",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={warnPercent}
            stroke="#b45309"
            strokeDasharray="4 4"
            label={{
              value: `warn ${warnPercent}%`,
              position: "insideTopRight",
              fontSize: 10,
              fill: "#b45309",
            }}
          />
          <Bar dataKey="percent" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
