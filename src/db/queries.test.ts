import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { buildFoodCountQuery, buildFoodItemsQuery } from "@/db/queries";
import type { FoodFilters } from "@/lib/domain";

const filters: FoodFilters = {
  scope: "meals",
  sort: "protein_desc",
  limit: 10,
  offset: 20,
};

describe("food query scope", () => {
  it("applies the same role predicate before pagination and counting", () => {
    const db = drizzle.mock({ schema });
    const itemsSql = buildFoodItemsQuery(db, filters).toSQL();
    const countSql = buildFoodCountQuery(db, filters).toSQL();

    expect(itemsSql.sql).toContain("where");
    expect(itemsSql.sql).toContain("case when");
    expect(itemsSql.sql.indexOf("where")).toBeLessThan(itemsSql.sql.indexOf("limit"));
    expect(itemsSql.params).toContain("meal");
    expect(countSql.sql).toContain("case when");
    expect(countSql.params).toContain("meal");
  });
});
