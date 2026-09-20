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

export function foodSlug(restaurantSlug: string, name: string, servingSize?: string | null): string {
  const size = servingSize && !name.toLowerCase().includes(servingSize.toLowerCase()) ? `-${servingSize}` : "";
  return slugify(`${restaurantSlug}-${name}${size}`);
}
