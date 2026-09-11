# Data quality notes

The local data set has been cleaned enough for the planner and recipe library to work consistently:

1. `dishes.json` now contains 30 recipes across breakfast, snack, lunch and dinner.
2. Duplicate product names that caused ambiguous exact matches were removed.
3. Trailing spaces/noisy punctuation in the affected product names were normalized.
4. Missing base ingredients used by the new recipes were added to `products.json`.
5. Every local recipe ingredient now has an exact normalized match in `products.json`.
6. `npm run check:data` currently finishes with 0 warnings and 0 fatal errors.

Nutrition values in a food database are still source-dependent. Before treating the numbers as authoritative nutritional guidance, periodically reconcile `products.json` with the product labels or another source you trust. The planner uses the stored values consistently; it cannot make an inaccurate source magically become accurate, because even software has limits to its miracles.

Use:

```bash
npm run check:data
```
