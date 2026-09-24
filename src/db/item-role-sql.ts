import { sql, type SQL } from "drizzle-orm";
import { foods, restaurants } from "@/db/schema";
import { ITEM_ROLE_RULES, SCOPE_ROLES, type FoodScope, type ItemRole, type ItemRoleRule } from "@/lib/item-role";

function sqlList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function ruleCondition(rule: ItemRoleRule): SQL {
  const conditions: SQL[] = [];
  if (rule.itemTypes) {
    conditions.push(sql`lower(coalesce(${foods.itemType}, '')) in (${sqlList(rule.itemTypes)})`);
  }
  if (rule.restaurantSlugs) {
    conditions.push(sql`lower(${restaurants.slug}) in (${sqlList(rule.restaurantSlugs)})`);
  }
  if (rule.categoryTerms) {
    conditions.push(
      sql`(${sql.join(
        rule.categoryTerms.map((term) => sql`lower(${foods.category}) like ${`%${term}%`}`),
        sql` or `,
      )})`,
    );
  }
  if (rule.nameTerms) {
    conditions.push(
      sql`(${sql.join(
        rule.nameTerms.map((term) => sql`lower(${foods.name}) like ${`%${term}%`}`),
        sql` or `,
      )})`,
    );
  }
  if (rule.names) {
    conditions.push(sql`lower(${foods.name}) in (${sqlList(rule.names)})`);
  }
  return sql`(${sql.join(conditions, sql` and `)})`;
}

/** SQL equivalent of deriveItemRole, generated from the same ordered rules. */
export function itemRoleSql(): SQL<ItemRole> {
  const clauses = ITEM_ROLE_RULES.map((rule) => sql`when ${ruleCondition(rule)} then ${rule.role}`);
  return sql<ItemRole>`case ${sql.join(clauses, sql` `)} else 'other' end`;
}

export function scopeConditionSql(scope: FoodScope): SQL {
  if (scope === "all") return sql`true`;
  return sql`${itemRoleSql()} in (${sqlList(SCOPE_ROLES[scope])})`;
}
