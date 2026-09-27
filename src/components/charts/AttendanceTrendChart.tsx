"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Whole-school attendance percent by month (admin dashboard), with the
 * configured warning threshold drawn as a dashed reference line. The monthly
 * numbers are restated in the text summary beneath the chart.
 */
export function AttendanceTrendChart({
  data,
  warnPercent,
}: {
  data: Array<{ label: string; percent: number }>;
  warnPercent: number;
}) {
  const summary =
    data.length === 0
      ? "No attendance recorded yet"
      : `Attendance percent per month: ${data.map((d) => `${d.label} ${d.percent}%`).join(", ")}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Line chart of monthly attendance. ${summary}. Warning threshold ${warnPercent}%.`}
        className="h-52 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5b6b80" }} interval={0} />
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
            <Line
              type="monotone"
              dataKey="percent"
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
