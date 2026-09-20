# Initial source research

Research was performed against public official U.S. restaurant sources on September 19, 2026. A source being technically visible does not by itself authorize aggressive collection; every adapter should use a descriptive user agent, a low request rate, current robots rules, and the restaurant's terms.

| Restaurant | Official source | Observed format | Decision |
| --- | --- | --- | --- |
| Chick-fil-A | [Nutrition & Allergens](https://www.chick-fil-a.com/nutrition-allergens) | One server-rendered HTML table with serving size, calories, fat, saturated/trans fat, cholesterol, sodium, carbs, fiber, sugar, and protein. The current robots file does not disallow this path. | Implemented first. One request yields the complete table; the parser currently finds 372 distinct items after merging repeated category listings. |
| Chipotle | [U.S. nutrition PDF](https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf) | Structured three-page official PDF, marked `OCT-2024-US`, with portions and full nutrition columns. Primarily components plus beverages and kids items. | Strong second adapter candidate. Treat components as components; do not misrepresent them as complete bowls. Custom meal totals need a separate composition model. |
| McDonald's | [U.S. nutrition calculator](https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html) and official product pages | Public HTML/product experience. The calculator page currently says its information is correct as of January 2022 unless stated otherwise, while individual menu content changes. | Defer until the current product-data requests and update metadata are verified. Prefer a structured first-party response over crawling many pages. |
| Taco Bell | [Official nutrition FAQ/calculator entry point](https://www.tacobell.com/faqs/nutrition/nutrition-information) | JavaScript/location-sensitive experience; the historical FAQ URL currently redirects in some clients and did not expose a stable table during this audit. | Do not build a brittle rendered-HTML parser. Inspect first-party network calls and terms in a normal browser session before selecting an adapter source. |
| Wendy's | [Nutrition & Allergens](https://www.wendys.com/nutrition-allergens) | Official overview plus a location-aware ordering experience where nutrition can change with customization. No current U.S. national structured download was confirmed in this audit. | Defer until a stable official U.S. menu response is identified. Preserve location/region and customization semantics when implemented. |

## Chick-fil-A parsing notes

- The adapter requests one official page and parses server-rendered rows; it does not execute scripts or bypass controls.
- Grouped rows become separate items (for example, different nugget counts).
- The official table repeats some identical entries in multiple categories. The adapter merges identical `name + serving size` identities and records all category tags.
- The checked-in fixture is a small sanitized representation of the public table shape, not a copied full menu.
- Live-source safety requires at least 100 parsed items. A selector break therefore fails before database mutation.

## Source onboarding checklist

1. Record the official URL, format, update indicators, robots result, terms constraints, and geographic scope.
2. Prefer an official structured response or downloadable document to rendered DOM scraping.
3. Save only the smallest permitted sanitized fixture needed to test parsing.
4. Define stable source identifiers independent of nutrition values.
5. Add parser, validation, idempotency, and major-change tests.
6. Run an initial import into a review environment and inspect warnings before production promotion.
