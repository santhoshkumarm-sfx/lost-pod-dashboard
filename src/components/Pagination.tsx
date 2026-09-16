"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between text-sm text-ink-600">
      <div>
        Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
        {total.toLocaleString("en-IN")}
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          Previous
        </button>
        <span className="px-2 py-2">
          Page {page} of {totalPages}
        </span>
        <button className="btn-secondary" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
