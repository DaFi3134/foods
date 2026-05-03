
const DATA_PATHS = {
  products: "data/products.json",
  dishes: "data/dishes.json",
  myths: "data/myths.json"
};

// Замени на ссылку своего репозитория, например: https://github.com/Zver/Correctly-foods
const GITHUB_REPO_URL = "https://github.com/USERNAME/REPOSITORY";

const mealLabels = {
  breakfast: "Завтрак",
  snack: "Перекус",
  lunch: "Обед",
  dinner: "Ужин",
  other: "Другое"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(value, digits = 1) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return await response.json();
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function profileDefault() {
  return {
    data: { sex: "male", age: 25, weight: 70, height: 175, activity: "sedentary" },
    prefs: { liked: [], disliked: [] },
    allergies: []
  };
}

function getProfile() {
  try {
    return { ...profileDefault(), ...(JSON.parse(localStorage.getItem("cf_profile")) || {}) };
  } catch (e) {
    return profileDefault();
  }
}

function saveProfile(profile) {
  localStorage.setItem("cf_profile", JSON.stringify(profile));
  window.dispatchEvent(new Event("profile:updated"));
}

function clearProfile() {
  localStorage.removeItem("cf_profile");
  window.dispatchEvent(new Event("profile:updated"));
}

function activityFactor(level) {
  return ({ sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 })[level] || 1.2;
}

function calcBmr(sex, weight, height, age) {
  return sex === "male"
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
}

function calcBmi(weight, height) {
  const h = height / 100;
  return h > 0 ? weight / (h * h) : 0;
}

function calcProfileStats(data) {
  const bmr = calcBmr(data.sex, Number(data.weight), Number(data.height), Number(data.age));
  const tdee = bmr * activityFactor(data.activity);
  const bmi = calcBmi(Number(data.weight), Number(data.height));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), bmi: Number(bmi.toFixed(1)) };
}

function productEmoji(p) {
  const protein = Number(p.protein || 0);
  const fat = Number(p.fat || 0);
  const calories = Number(p.calories || 0);
  if (protein >= 15 && fat < 10) return "🥦";
  if (calories < 120) return "🍎";
  if (fat > 20) return "🍔";
  return "⚠️";
}

function perGramProduct(p) {
  return {
    calories: Number(p.calories || 0) / 100,
    protein: Number(p.protein || 0) / 100,
    fat: Number(p.fat || 0) / 100,
    carbs: Number(p.carbs || 0) / 100
  };
}

function calcFromProduct(product, grams) {
  const pg = perGramProduct(product);
  return {
    calories: pg.calories * grams,
    protein: pg.protein * grams,
    fat: pg.fat * grams,
    carbs: pg.carbs * grams
  };
}

function calcDishTotals(dish, products = []) {
  if (Number(dish.calories || 0) > 0) {
    return {
      calories: Number(dish.calories || 0),
      protein: Number(dish.protein || 0),
      fat: Number(dish.fat || 0),
      carbs: Number(dish.carbs || 0)
    };
  }
  const byName = new Map(products.map(p => [String(p.name).trim().toLowerCase(), p]));
  const total = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  (dish.ingredients || []).forEach(item => {
    const prod = byName.get(String(item.product).trim().toLowerCase());
    if (!prod) return;
    const grams = Number(item.grams || 0);
    const t = calcFromProduct(prod, grams);
    total.calories += t.calories;
    total.protein += t.protein;
    total.fat += t.fat;
    total.carbs += t.carbs;
  });
  return total;
}

function addTotals(a, b) {
  a.calories += b.calories || 0;
  a.protein += b.protein || 0;
  a.fat += b.fat || 0;
  a.carbs += b.carbs || 0;
  return a;
}

function findDishById(dishes, id) {
  return dishes.find(d => String(d.id) === String(id) || String(d.num_id) === String(id));
}

function mealTypeText(types = []) {
  return types.map(t => mealLabels[t] || t).join(", ") || "Любой приём";
}

function createIssueUrl(kind, fields) {
  const base = GITHUB_REPO_URL.replace(/\/$/, "") + "/issues/new";
  const title = kind === "dish" ? `[Рецепт]: ${fields.title || ""}` : `[Миф/статья]: ${fields.title || ""}`;
  const bodyLines = [];
  Object.entries(fields).forEach(([key, value]) => {
    bodyLines.push(`### ${key}`);
    bodyLines.push(String(value || "—"));
    bodyLines.push("");
  });
  const params = new URLSearchParams({ title, body: bodyLines.join("\n"), labels: kind === "dish" ? "recipe-submission,needs-moderation" : "myth-submission,needs-moderation" });
  return `${base}?${params.toString()}`;
}
