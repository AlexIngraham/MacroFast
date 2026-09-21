# Source research

Every adapter reads an official first-party U.S. source. Third-party nutrition databases are not used, and a source being technically reachable does not by itself authorize collection: each adapter sends the configurable `INGESTION_USER_AGENT`, makes as few requests as the source allows, respects `Retry-After`, and never retries a 403 in a loop.

## Status

| Restaurant | Official source | Format | Adapter | Status | Items | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Chick-fil-A | [Nutrition & Allergens](https://www.chick-fil-a.com/nutrition-allergens) | HTML | `chickfila` | working | 372 | One server-rendered table; one request. |
| Chipotle | [U.S. Nutrition Facts chart](https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf) | PDF | `chipotle` | working | 123 | Ingredients and drinks, not finished bowls. |
| Jersey Mike's | `https://subs.jerseymikes.com/nutrition/data` behind [Nutrition & Allergens](https://www.jerseymikes.com/menu/nutrition) | JSON | `jerseymikes` | working | 267 | One row per product size. |
| Subway | [U.S. Nutrition Information](https://www.subway.com/en-US/MenuNutrition/Nutrition) | PDF | `subway` | working | 209 | Sandwich, wrap, salad and bowl formats plus ingredients. |
| El Pollo Loco | [Nutrition](https://www.elpolloloco.com/nutrition) | PDF | `elpolloloco` | working | 120 | Single-page guide with allergen columns. |
| CAVA | `cava.com/nutrition` | — | no | blocked | — | Edge protection answers automated requests with HTTP 403. |
| Panda Express | `pandaexpress.com/nutritioninfo` | — | no | blocked | — | HTTP 403 to automated requests. |
| Shake Shack | `shakeshack.com/nutrition` | — | no | blocked | — | HTTP 403 to automated requests. |
| QDOBA | `qdoba.com/nutrition` | — | no | blocked | — | HTTP 403 to automated requests. |
| Raising Cane's | `raisingcanes.com/nutrition` | — | no | blocked | — | HTTP 403 to automated requests. |
| Buffalo Wild Wings | Nutrition guide PDF linked from [Nutrition](https://www.buffalowildwings.com/nutrition) | PDF | no | researched | — | Next target; see the note below. |
| Wendy's | [Nutrition & Allergens](https://www.wendys.com/nutrition-allergens) | — | no | blocked | — | Only a United Kingdom PDF is published there; U.S. values live in the location-aware ordering app. |
| McDonald's | [Nutrition calculator](https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html) | — | no | research | — | Calculator states its data is current as of January 2022; confirm the first-party product requests before building. |
| Taco Bell | `tacobell.com/food/nutrition` | — | no | blocked | — | The documented path now returns HTTP 404 and nutrition is served through the location-aware ordering app. |

`Items` is the count from the most recent live run, and is an expectation rather than a guarantee.

## Chick-fil-A

One HTML request returns every category table. Rows are server-rendered, so no scripts are executed. Grouped rows (different nugget counts) become separate items. The table repeats identical entries under several categories; identical duplicates merge and keep every category tag, and a nutrition disagreement between two copies fails the run.

## Chipotle

Inspected 20 September 2026. Three pages: page one is the printed menu layout and publishes only calorie *ranges* ("BURRITO 740–1210 cal"), so it is skipped rather than reduced to a single invented number. Pages two and three carry the real Nutrition Facts tables.

- The two table pages repeat every food but carry different bottler drink lineups (revisions `OCT-2024-US-CK` and `OCT-2024-US-PPS`). A drink printed on only one page is imported as `regional`.
- Each page holds a main table and a Kid's Menu table. The kid's chart genuinely disagrees with the main chart on some shared rows, so kid's entries are separate items keyed with a `kids-menu` discriminator.
- **These are components, not meals.** Proteins, rice, beans, salsas and toppings are imported with `itemType: "component"`; chips and side portions of guacamole and queso are `side`; the vinaigrette is `sauce`; fountain and bottled drinks are `drink`. Nothing in this chart is a finished burrito or bowl, and the adapter does not assemble one.
- `<1` means an unpublished sub-gram amount and is stored as null.
- The current revision misprints one drink's calories as `10w`. That row is skipped and the correct copy on the other page is used; more than five unreadable rows fails the run.

A nutrition calculator also exists at `chipotle.com/nutrition-calculator`, but it is a single-page app that calls `services.chipotle.com` with an API-management key embedded in its bundle. The published chart is the stable, unambiguous source, so the calculator was not used.

## Jersey Mike's

Inspected 20 September 2026. The nutrition page is a Nuxt app whose server-rendered payload contains only page copy, so the data service it calls was identified from the page's own runtime configuration (`subsURLBase`) and route constants:

- `GET /nutrition/data` returns the category, product and size catalog with official IDs.
- `GET /nutrition/{productId}/{sizeId}` returns that size's ingredient rows.

The official page lists one row per ingredient and totals the rows it has selected, selecting exactly the ingredients whose `inclusion_type` is `D`. The adapter reproduces that: it totals the default ingredients and applies the same calorie rounding the page uses (under five calories prints as zero, otherwise round to the nearest five up to fifty and the nearest ten above it). Every imported item records its default build in `description` so any total can be traced back.

- Product IDs are unique across categories, so `product-{id}-size-{id}` is a stable key that survives renames and reordering.
- Mini, Regular, Giant, Wrap and Bowl are nutritionally distinct and each becomes its own food.
- Requests are made one at a time with 250 ms between them: 1 catalog request plus 268 size lookups.
- Items with add-on or swap options are marked customizable, because the imported values describe the default build.
- Three ingredients (`Teriyaki`, `Sparkling Orange`, `18 inch Hot Sub Wrap`) publish null nutrition, which affects nine product sizes. A total built from an unpublished part is stored as null rather than as zero, so those items import without efficiency rankings instead of with invented numbers.
- `Hot Chopped Pepper Relish (16 oz)` publishes no default ingredients at all and is skipped.
- The catalog includes a `Catering` category that the page's own dropdown hides; it is imported because it comes from the same official service.

## Subway

Inspected 20 September 2026. The nutrition page links a dated U.S. chart asset, so the adapter reads the current link from the page and then downloads it. The allergen and ingredient charts on the same page are ignored.

Sixteen columns follow each item name. Added Sugars and the four percent-Daily-Value columns have no schema field and are dropped rather than misfiled.

The chart nests a protein grouping (Cheesesteaks, Chicken, Italians, Deli Classics, Clubs, Local Favorites, Fresh Fit, Kids' Mini Sub) under each menu format (6" Sandwiches, Wraps, Protein Pockets, Salads, Protein Bowls, breakfast, pizza, Sliders, Breads, and the ingredient tables). Both levels are tracked because the same grouping name and the same item name reappear under several formats with different nutrition: "Steak Philly" exists as a wrap, a salad and a protein bowl.

Two layout details matter:

- Every page repeats the column headings one per line. They are matched and skipped explicitly, because otherwise "Calcium % DV" would be read as a menu section and relabel the rows beneath it.
- Every page ends with a legend block: upper-case labels naming the page's menu groups, explanatory notes, and the publication month. A genuine section heading can also sit after the last row of a page when its rows continue overleaf, which is how "Salads" is printed. The adapter keeps a trailing mixed-case heading and drops the upper-case labels, notes and date. If a legend label ever does reach the section state, the run fails rather than publishing rows under a nonsense category.

`<1` is stored as null. A double asterisk marks limited availability and is imported as `regional`.

## El Pollo Loco

Inspected 20 September 2026. The guide's file name carries its revision (`epl_web_nutrition_guide_mod_4_2026_hr.pdf`, stamped `M4 2026`), so the adapter reads the current link from the nutrition page rather than hard-coding it.

One page, one table. Each row is an item name, a serving size in ounces, eleven nutrition columns, and a trailing `X` per allergen present; the allergen marks are removed before the nutrition columns are read. Sections are the guide's own upper-case banners and become the category.

- A single grilled piece (`FIRE-GRILLED CHICKEN`) is a `component` rather than a plate; combos, bowls, salads and kid's entrées are `entree`.
- Fountain sizes print on their own row, and a long drink name wraps onto that row. "Minute Maid® Aguas Frescas Regular" followed by "Mango Lime Large" is one drink in two sizes, so the adapter rebuilds the full name across the pair instead of importing an item called "Mango Lime Large".
- The guide footnotes limited availability with two or three asterisks ("Texas and Louisiana Locations Only", "Limited Locations"), which becomes `regional`. A single asterisk is only a note about dressing and does not change availability.

## Buffalo Wild Wings — next target

The nutrition page links a quarterly Contentful asset (`BWW_Nutrition_Guide__08-18-2026_-_11-17-2026_.pdf`, 1.4 MB). The URL carries its validity window, so it must be resolved from the page the way Subway and El Pollo Loco are. The guide was downloaded and is readable; its table layout has not been validated yet.

## Blocked chains

CAVA, Panda Express, Shake Shack, QDOBA and Raising Cane's all answer an identified, low-rate, single request with HTTP 403 from edge bot protection. Nothing here is worked around: no proxy rotation, no user-agent spoofing, no CAPTCHA handling, and no retry storm. Each needs either a published document, a first-party endpoint confirmed in a normal browser session, or written permission before an adapter is written.

Wendy's and Taco Bell publish U.S. nutrition only through location-aware ordering apps where values change with customization. An adapter for either should preserve region and customization rather than flatten a configurable item into one row.

## Source onboarding checklist

1. Record the official URL, format, update indicators, robots result, terms constraints, and geographic scope in the table above.
2. Prefer an official structured response or downloadable document over rendered DOM scraping, and confirm any endpoint against the site's own code before building on it.
3. Resolve dated document links from the page that publishes them so a revision does not silently break the adapter.
4. Save only the smallest sanitized fixture needed to test parsing.
5. Define stable source identifiers from official IDs where they exist, and otherwise from name, size and the chart section — never from row order.
6. Set `minimumExpectedItems` from the source, and add parser, classification, stable-ID and malformed-row tests.
7. Run `npm run scrape <key> -- --dry-run` against the live source and inspect the counts before writing to a production database.
