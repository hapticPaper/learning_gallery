"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/cn";

export type SimpleLineChartLine = {
  key: string;
  label?: string;
  color?: string;
};

export function SimpleLineChart({
  data,
  xKey,
  lines,
  height = 320,
  className,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  lines: SimpleLineChartLine[];
  height?: number;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "not-prose my-6 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
          className,
        )}
        style={{ height }}
      />
    );
  }

  return (
    <div
      className={cn(
        "not-prose my-6 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.35)" />
          <XAxis dataKey={xKey} tick={{ fill: "rgba(113, 113, 122, 0.9)", fontSize: 12 }} />
          <YAxis tick={{ fill: "rgba(113, 113, 122, 0.9)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(228, 228, 231, 0.8)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
            labelStyle={{ fontSize: 12, color: "rgba(39, 39, 42, 0.9)" }}
            itemStyle={{ fontSize: 12 }}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.label ?? line.key}
              stroke={line.color ?? "#0ea5e9"}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
