"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import type { StatusCode } from "@/lib/types/domain";

const PIE_COLORS = ["#2F6FED", "#2E9E6D", "#D69A1F", "#D9622B", "#C13C3C", "#8DC63F"];

export function DashboardCharts({
  agingCounts,
  statusCounts,
  statusLabels,
  sourceCounts,
  clientCounts,
  isStaff,
}: {
  agingCounts: Record<string, number>;
  statusCounts: Record<StatusCode, number>;
  statusLabels: Record<StatusCode, string>;
  sourceCounts: { google_sheet: number; email: number; manual: number };
  clientCounts: { client: string; count: number }[];
  isStaff: boolean;
}) {
  const agingData = Object.entries(agingCounts).map(([bucket, count]) => ({ bucket, count }));
  const statusData = (Object.keys(statusCounts) as StatusCode[]).map((code) => ({
    status: statusLabels[code],
    count: statusCounts[code],
  }));
  const sourceData = [
    { name: "Google Sheets", value: sourceCounts.google_sheet },
    { name: "Email", value: sourceCounts.email },
    { name: "Manual", value: sourceCounts.manual },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="card p-4">
        <div className="text-sm font-semibold text-ink-800 mb-2">Aging distribution</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={agingData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" fontSize={12} />
            <YAxis fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#2F6FED" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-ink-800 mb-2">Status breakdown</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={statusData} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" fontSize={12} allowDecimals={false} />
            <YAxis type="category" dataKey="status" fontSize={11} width={140} />
            <Tooltip />
            <Bar dataKey="count" fill="#8DC63F" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {isStaff && (
        <>
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink-800 mb-2">Source-wise</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4">
            <div className="text-sm font-semibold text-ink-800 mb-2">Top clients by case count</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clientCounts} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={12} allowDecimals={false} />
                <YAxis type="category" dataKey="client" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#1D6A3C" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
