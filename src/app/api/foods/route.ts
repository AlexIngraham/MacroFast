import { NextResponse } from "next/server";
import { listFoods } from "@/db/queries";
import { parseFoodFilters } from "@/lib/filters";
import { proteinPer100Calories } from "@/lib/metrics";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filters = parseFoodFilters(params);
    const result = await listFoods(filters);
    return NextResponse.json({
      ...result,
      items: result.items.map((food) => ({ ...food, proteinPer100Calories: proteinPer100Calories(food) })),
      filters,
    });
  } catch (error) {
    console.error("Food API request failed", error);
    return NextResponse.json({ error: "Nutrition data is temporarily unavailable." }, { status: 503 });
  }
}
