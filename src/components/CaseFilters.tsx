"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { STATUS_CODES, STATUS_LABELS, AGING_BUCKETS } from "@/lib/types/domain";

export function CaseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="card p-4 flex flex-wrap gap-3 items-end">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", q);
        }}
        className="flex-1 min-w-[240px]"
      >
        <label className="block text-xs font-medium text-ink-600 mb-1">
          Search — AWB, Client, Email subject, Hub, Location, Agent
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          placeholder="Search…"
        />
      </form>

      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">Status</label>
        <select
          className="input"
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">All</option>
          {STATUS_CODES.map((code) => (
            <option key={code} value={code}>
              {STATUS_LABELS[code]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">Source</label>
        <select
          className="input"
          defaultValue={searchParams.get("source") ?? ""}
          onChange={(e) => updateParam("source", e.target.value)}
        >
          <option value="">All</option>
          <option value="google_sheet">Google Sheet</option>
          <option value="email">Email</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">Aging bucket</label>
        <select
          className="input"
          defaultValue={searchParams.get("bucket") ?? ""}
          onChange={(e) => updateParam("bucket", e.target.value)}
        >
          <option value="">All</option>
          {AGING_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b} days
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
