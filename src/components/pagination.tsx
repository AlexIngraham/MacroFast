import Link from "next/link";
import type { FoodFilters } from "@/lib/domain";
import { foodFiltersHref } from "@/lib/food-urls";

export function Pagination({ total, filters, pathname }: { total: number; filters: FoodFilters; pathname: string }) {
  const pageCount = Math.ceil(total / filters.limit);
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;
  if (pageCount <= 1) return null;

  const href = (page: number) => foodFiltersHref(pathname, filters, { page });

  return (
    <nav className="pagination" aria-label="Food result pages">
      {currentPage > 1 ? <Link href={href(currentPage - 1)}>← Previous</Link> : <span />}
      <span>Page <strong>{currentPage}</strong> of {pageCount}</span>
      {currentPage < pageCount ? <Link href={href(currentPage + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
