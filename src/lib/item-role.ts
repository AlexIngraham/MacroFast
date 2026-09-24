export const ITEM_ROLES = [
  "meal",
  "side",
  "build",
  "drink",
  "dessert",
  "sauce",
  "component",
  "other",
] as const;

export type ItemRole = (typeof ITEM_ROLES)[number];

export const FOOD_SCOPES = ["meals", "sides", "builds", "drinks", "all"] as const;
export type FoodScope = (typeof FOOD_SCOPES)[number];

export interface ItemRoleInput {
  itemType: string | null;
  category: string;
  name: string;
  restaurantSlug: string;
}

export interface ItemRoleRule {
  role: ItemRole;
  itemTypes?: readonly string[];
  restaurantSlugs?: readonly string[];
  categoryTerms?: readonly string[];
  nameTerms?: readonly string[];
  names?: readonly string[];
}

/**
 * Ordered product rules. Source fields remain unchanged; these rules only
 * decide whether a source record behaves like an order, side, or component.
 */
export const ITEM_ROLE_RULES: readonly ItemRoleRule[] = [
  { role: "drink", itemTypes: ["drink", "beverage"] },
  { role: "dessert", itemTypes: ["dessert", "treat"] },
  { role: "sauce", itemTypes: ["sauce", "dressing", "condiment"] },
  {
    role: "component",
    restaurantSlugs: ["el-pollo-loco"],
    nameTerms: ["chopped breast side"],
  },
  {
    role: "side",
    restaurantSlugs: ["chick-fil-a"],
    nameTerms: ["fruit cup", "berry parfait"],
  },
  {
    role: "side",
    restaurantSlugs: ["chick-fil-a"],
    names: ["hash browns", "small hash browns", "large hash browns"],
  },
  { role: "component", categoryTerms: ["catering", "kid's menu", "kids menu"] },
  {
    role: "build",
    itemTypes: ["component", "topping", "ingredient"],
    restaurantSlugs: ["chipotle"],
  },
  { role: "build", itemTypes: ["topping", "ingredient"] },
  { role: "component", itemTypes: ["component", "protein", "base"] },
  { role: "side", itemTypes: ["side"] },
  { role: "meal", itemTypes: ["entree", "entrée", "meal"] },
  { role: "drink", categoryTerms: ["drinks", "beverages", "coffee"] },
  { role: "dessert", categoryTerms: ["desserts", "treats", "cookies"] },
  { role: "sauce", categoryTerms: ["sauces", "dressings", "condiments"] },
  { role: "side", categoryTerms: ["sides", "soups"] },
  {
    role: "meal",
    categoryTerms: ["entrées", "entrees", "sandwiches", "salads", "breakfast", "bowls", "wraps", "burritos"],
  },
] as const;

function ruleMatches(rule: ItemRoleRule, food: ItemRoleInput): boolean {
  const itemType = food.itemType?.trim().toLowerCase() ?? "";
  const category = food.category.trim().toLowerCase();
  const name = food.name.trim().toLowerCase();
  const restaurantSlug = food.restaurantSlug.trim().toLowerCase();

  return (
    (!rule.itemTypes || rule.itemTypes.includes(itemType)) &&
    (!rule.restaurantSlugs || rule.restaurantSlugs.includes(restaurantSlug)) &&
    (!rule.categoryTerms || rule.categoryTerms.some((term) => category.includes(term))) &&
    (!rule.nameTerms || rule.nameTerms.some((term) => name.includes(term))) &&
    (!rule.names || rule.names.includes(name))
  );
}

export function deriveItemRole(food: ItemRoleInput): ItemRole {
  return ITEM_ROLE_RULES.find((rule) => ruleMatches(rule, food))?.role ?? "other";
}

export const SCOPE_ROLES: Readonly<Record<FoodScope, readonly ItemRole[]>> = {
  meals: ["meal"],
  sides: ["side", "dessert"],
  builds: ["build", "component", "sauce"],
  drinks: ["drink"],
  all: ITEM_ROLES,
};

export function roleIsInScope(role: ItemRole, scope: FoodScope): boolean {
  return SCOPE_ROLES[scope].includes(role);
}

export function itemRoleLabel(role: ItemRole): string {
  const labels: Record<ItemRole, string> = {
    meal: "Meal",
    side: "Side",
    build: "Build component",
    drink: "Drink",
    dessert: "Dessert",
    sauce: "Sauce",
    component: "Component",
    other: "Other",
  };
  return labels[role];
}

export interface RestaurantScopeCounts {
  meals: number;
  builds: number;
}

export function defaultScopeForRestaurant(counts: RestaurantScopeCounts): FoodScope {
  return counts.meals === 0 && counts.builds > 0 ? "builds" : "meals";
}
