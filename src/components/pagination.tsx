import Link from "next/link";
import type { FoodFilters } from "@/lib/domain";

export function Pagination({ total, filters, pathname }: { total: number; filters: FoodFilters; pathname: string }) {
  const pageCount = Math.ceil(total / filters.limit);
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;
  if (pageCount <= 1) return null;

  const href = (page: number) => {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.restaurant) params.set("restaurant", filters.restaurant);
    if (filters.category) params.set("category", filters.category);
    if (filters.maxCalories !== undefined) params.set("maxCalories", String(filters.maxCalories));
    if (filters.minProtein !== undefined) params.set("minProtein", String(filters.minProtein));
    if (filters.maxFat !== undefined) params.set("maxFat", String(filters.maxFat));
    if (filters.maxCarbs !== undefined) params.set("maxCarbs", String(filters.maxCarbs));
    if (filters.maxSodium !== undefined) params.set("maxSodium", String(filters.maxSodium));
    params.set("sort", filters.sort);
    params.set("page", String(page));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <nav className="pagination" aria-label="Food result pages">
      {currentPage > 1 ? <Link href={href(currentPage - 1)}>← Previous</Link> : <span />}
      <span>Page <strong>{currentPage}</strong> of {pageCount}</span>
      {currentPage < pageCount ? <Link href={href(currentPage + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
