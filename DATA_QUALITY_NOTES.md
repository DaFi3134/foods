# Data quality notes

The current repository snapshot has data issues that should be reviewed manually rather than "fixed" automatically:

1. Local `dishes.json` contains only a few recipes, so the planner has little diversity.
2. `products.json` contains normalized-name duplicates (for example repeated berry names) with potentially different nutrition values. A script cannot safely decide which value is authoritative.
3. Some product names contain trailing spaces or noisy punctuation/capitalization.
4. At least one product category appears semantically inconsistent (for example corn placed under a meat category in the current snapshot).
5. Recipe ingredient names do not always exactly match product names, so nutrition derived by exact name lookup can silently miss an ingredient.

Use:

```bash
npm run check:data
```

Recommended cleanup rule: choose one canonical product row manually, keep nutrition values from a source you trust, then update recipe ingredient names to match the canonical product name exactly.
