import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const productsPath = join(root, "docs", "data", "products.json");
const dishesPath = join(root, "docs", "data", "dishes.json");

if (!existsSync(productsPath) || !existsSync(dishesPath)) {
  console.log("SKIP data validation: docs/data is not included in the patch archive. Run this after overlaying the patch onto the repository.");
  process.exit(0);
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`ERROR cannot parse ${path}: ${error.message}`);
    process.exit(1);
  }
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function validateMacros(item, label, warnings) {
  for (const key of ["calories", "protein", "fat", "carbs"]) {
    const value = Number(item[key]);
    if (!Number.isFinite(value) || value < 0) warnings.push(`${label}: invalid ${key}=${JSON.stringify(item[key])}`);
  }
}

const products = load(productsPath);
const dishes = load(dishesPath);
const warnings = [];
const fatal = [];

if (!Array.isArray(products)) fatal.push("products.json must contain an array");
if (!Array.isArray(dishes)) fatal.push("dishes.json must contain an array");

if (!fatal.length) {
  const byProductName = new Map();
  const productNames = new Set();
  const productIds = new Set();

  for (const product of products) {
    const name = String(product.name || "");
    const normalized = normalize(name);
    if (!normalized) fatal.push("Product without a name");
    if (name !== name.trim()) warnings.push(`Product has leading/trailing whitespace: ${JSON.stringify(name)}`);
    if (/!!|\s{2,}/.test(name)) warnings.push(`Product name looks noisy: ${JSON.stringify(name)}`);
    validateMacros(product, `Product ${name || "<unnamed>"}`, warnings);

    if (normalized) {
      const previous = byProductName.get(normalized);
      if (previous) warnings.push(`Duplicate product name: ${JSON.stringify(previous)} / ${JSON.stringify(name)}`);
      else byProductName.set(normalized, name);
      productNames.add(normalized);
    }

    if (product.id !== undefined) {
      const id = String(product.id);
      if (productIds.has(id)) fatal.push(`Duplicate product id: ${id}`);
      productIds.add(id);
    }
  }

  const dishIds = new Set();
  const allowedMealTypes = new Set(["breakfast", "snack", "lunch", "dinner", "other"]);
  for (const dish of dishes) {
    const name = String(dish.name || "<unnamed>");
    const id = String(dish.id ?? dish.num_id ?? "");
    if (!id) fatal.push(`Dish without id: ${name}`);
    if (dishIds.has(id)) fatal.push(`Duplicate dish id: ${id}`);
    dishIds.add(id);
    validateMacros(dish, `Dish ${name}`, warnings);

    for (const mealType of dish.meal_types || []) {
      if (!allowedMealTypes.has(mealType)) warnings.push(`Dish ${name}: unknown meal type ${JSON.stringify(mealType)}`);
    }

    for (const ingredient of dish.ingredients || []) {
      const ingredientName = normalize(ingredient.product);
      if (!ingredientName) {
        warnings.push(`Dish ${name}: empty ingredient name`);
        continue;
      }
      if (!productNames.has(ingredientName)) {
        warnings.push(`Dish ${name}: ingredient is not an exact product match: ${JSON.stringify(ingredient.product)}`);
      }
      const grams = Number(ingredient.grams);
      if (!Number.isFinite(grams) || grams < 0) warnings.push(`Dish ${name}: invalid grams for ${ingredient.product}`);
    }
  }

  if (dishes.length < 12) {
    warnings.push(`Only ${dishes.length} dishes in local data. Planner quality improves strongly after ~12-20 diverse recipes.`);
  }
}

for (const message of warnings) console.warn(`WARN  ${message}`);
for (const message of fatal) console.error(`ERROR ${message}`);
console.log(`\nChecked ${Array.isArray(products) ? products.length : 0} products and ${Array.isArray(dishes) ? dishes.length : 0} dishes.`);
console.log(`${warnings.length} warning(s), ${fatal.length} fatal error(s).`);
if (fatal.length) process.exit(1);
