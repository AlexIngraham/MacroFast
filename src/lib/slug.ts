const APOSTROPHES = /['’]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(NON_ALPHANUMERIC, "-")
    .replace(/^-|-$/g, "");
}

/**
 * `variant` separates items an official chart lists under the same name and
 * serving size in different tables, such as a kid's-portion chart.
 */
export function foodSlug(
  restaurantSlug: string,
  name: string,
  servingSize?: string | null,
  variant?: string | null,
): string {
  const size = servingSize && !name.toLowerCase().includes(servingSize.toLowerCase()) ? `-${servingSize}` : "";
  const suffix = variant ? `-${variant}` : "";
  return slugify(`${restaurantSlug}-${name}${size}${suffix}`);
}
