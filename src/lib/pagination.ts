"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

export const PAGE_SIZE = 15;

type PageShape<T> = { page: T[]; isDone: boolean; continueCursor: string };

/**
 * Windowed (Prev/Next) pagination backed by a real Convex cursor-paginated
 * query — i.e. a `query` whose args include `paginationOpts: paginationOptsValidator`
 * and whose handler returns `.paginate(args.paginationOpts)`. Only the current
 * page's rows are ever fetched (O(pageSize) documents read per navigation),
 * which is the efficient shape for tables backed by data that grows without
 * bound (sales, ledgers, audit logs, ...).
 *
 * Unlike `usePaginatedQuery` (which accumulates every page you've scrolled
 * through), this keeps exactly one page in memory and lets you page backward
 * too, by remembering the cursor that led to each page index.
 *
 * Pass `"skip"` for `args` to skip the query entirely (mirrors `useQuery`).
 * Any change to `args` (compared by JSON value) resets back to page 0.
 */
export function usePagedQuery<T>(
  query: FunctionReference<"query">,
  args: Record<string, unknown> | "skip",
  pageSize: number = PAGE_SIZE
) {
  const filterKey = args === "skip" ? "skip" : JSON.stringify(args);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const lastKey = useRef(filterKey);

  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      setCursors([null]);
      setPageIndex(0);
    }
  }, [filterKey]);

  const cursor = cursors[pageIndex] ?? null;
  const queryArgs =
    args === "skip"
      ? ("skip" as const)
      : { ...args, paginationOpts: { numItems: pageSize, cursor } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useQuery(query as any, queryArgs as any) as
    | PageShape<T>
    | undefined;

  useEffect(() => {
    if (result && !result.isDone && cursors[pageIndex + 1] === undefined) {
      setCursors((prev) => {
        const next = [...prev];
        next[pageIndex + 1] = result.continueCursor;
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, pageIndex]);

  return {
    rows: result?.page ?? [],
    isLoading: args !== "skip" && result === undefined,
    pageIndex,
    pageSize,
    hasPrev: pageIndex > 0,
    hasNext: !!result && !result.isDone,
    goPrev: () => setPageIndex((p) => Math.max(0, p - 1)),
    goNext: () => setPageIndex((p) => p + 1),
  };
}

/**
 * In-memory windowing for tables whose full list is already fetched cheaply
 * and bounded by nature (small reference/config tables — categories, sizes,
 * colors, suppliers, users, branches — or an already date/range-bounded
 * result). Never fetches more from Convex; just slices what's in hand.
 */
export function useClientPage<T>(rows: T[], pageSize: number = PAGE_SIZE) {
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    if (pageIndex > pageCount - 1) setPageIndex(pageCount - 1);
  }, [pageIndex, pageCount]);

  const page = rows.slice(clamped * pageSize, clamped * pageSize + pageSize);

  return {
    rows: page,
    pageIndex: clamped,
    pageSize,
    hasPrev: clamped > 0,
    hasNext: clamped < pageCount - 1,
    goPrev: () => setPageIndex((p) => Math.max(0, p - 1)),
    goNext: () => setPageIndex((p) => Math.min(pageCount - 1, p + 1)),
  };
}
