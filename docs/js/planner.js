document.addEventListener("DOMContentLoaded", async () => {
  const dishes = await loadJson(DATA_PATHS.dishes);
  const form = document.getElementById("plannerForm");
  const output = document.getElementById("planOutput");
  const restrictionsBox = document.getElementById("plannerRestrictions");
  const pStats = calcProfileStats(getProfile().data);
  document.getElementById("calories").value = pStats.tdee || 2000;

  const WORD_ALIASES = {
    "курица": ["курица", "куриное", "куриный", "куриная", "куриной", "курин"],
    "курицу": ["курица", "куриное", "куриный", "куриная", "куриной", "курин"],
    "индейка": ["индейка", "индейки", "индееч"],
    "говядина": ["говядина", "говяж"],
    "свинина": ["свинина", "свин"],
    "рыба": ["рыба", "рыб", "лосось", "форель", "горбуша", "сельдь", "скумбрия"],
    "молоко": ["молоко", "молоч"],
    "йогурт": ["йогурт"],
    "творог": ["творог", "творож"],
    "сыр": ["сыр", "сырник", "сырок"],
    "овсянка": ["овсянка", "овсяные", "геркулес"],
    "гречка": ["гречка", "греча", "гречнев"],
    "помидор": ["помидор", "томат"],
    "томаты": ["томат", "помидор"],
    "огурец": ["огурец", "огурцы", "огурц"],
    "капуста": ["капуста", "капуст"],
    "орехи": ["орех"],
    "ягоды": ["ягоды", "ягод", "клубника", "черника", "малина", "вишня"],
    "морепродукты": ["морепродукты", "морской", "креветка", "креветки", "мидии", "кальмар"]
  };

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^a-zа-я0-9%]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function listValues(values = []) {
    return values
      .flatMap(value => String(value || "").split(/[;,]/))
      .map(value => value.trim())
      .filter(Boolean);
  }

  function variantsFor(term) {
    const norm = normalize(term);
    if (!norm) return [];
    const aliases = WORD_ALIASES[norm] || [];
    const words = norm.split(" ").filter(Boolean);
    return [...new Set([norm, ...aliases, ...words])].filter(v => v.length >= 2);
  }

  function dishSearchText(dish) {
    const ingredients = (dish.ingredients || []).map(item => item.product).join(" ");
    const tags = (dish.tags || []).join(" ");
    return normalize(`${dish.name || ""} ${ingredients} ${tags} ${dish.author || ""}`);
  }

  function termMatchesDish(term, dish, text = dishSearchText(dish)) {
    const variants = variantsFor(term);
    if (!variants.length) return false;

    return variants.some(variant => {
      if (text.includes(variant)) return true;
      const words = variant.split(" ").filter(Boolean);
      return words.length > 1 && words.every(word => text.includes(word));
    });
  }

  function matchedTerms(dish, terms) {
    const text = dishSearchText(dish);
    return listValues(terms).filter(term => termMatchesDish(term, dish, text));
  }

  function preferenceInfo(dish, profile) {
    const allergies = matchedTerms(dish, profile.allergies || []);
    const avoided = matchedTerms(dish, profile.prefs?.disliked || []);
    const liked = matchedTerms(dish, profile.prefs?.liked || []);
    return {
      allergies,
      avoided,
      liked,
      blocked: allergies.length > 0 || avoided.length > 0
    };
  }

  function scoreDish(dish, target, profile) {
    const info = preferenceInfo(dish, profile);
    if (info.blocked) return Number.POSITIVE_INFINITY;

    let score = Math.abs(Number(dish.calories || 0) - target);
    const name = normalize(dish.name || "");

    if (info.liked.length) {
      const exactFavorite = info.liked.some(term => name.includes(normalize(term)));
      score *= exactFavorite ? 0.45 : 0.65;
      score -= info.liked.length * 25;
    }

    return score;
  }

  function mealSlots(meals) {
    if (meals === 3) {
      return [["Завтрак", "breakfast", .30], ["Обед", "lunch", .40], ["Ужин", "dinner", .30]];
    }
    if (meals === 4) {
      return [["Завтрак", "breakfast", .25], ["Перекус", "snack", .10], ["Обед", "lunch", .35], ["Ужин", "dinner", .30]];
    }
    if (meals === 5) {
      return [["Завтрак", "breakfast", .25], ["Перекус 1", "snack", .10], ["Обед", "lunch", .35], ["Перекус 2", "snack", .10], ["Ужин", "dinner", .20]];
    }
    return Array.from({ length: meals }, (_, i) => [`Приём ${i + 1}`, null, 1 / meals]);
  }

  function allowedDishes(pool, profile) {
    return pool.filter(dish => !preferenceInfo(dish, profile).blocked);
  }

  function pickBestDish(type, target, profile, used) {
    const byType = type ? dishes.filter(dish => (dish.meal_types || []).includes(type)) : dishes.slice();
    const allAllowed = allowedDishes(dishes, profile);

    const pools = [
      allowedDishes(byType.filter(dish => !used.has(dish.id)), profile),
      allowedDishes(byType, profile),
      allowedDishes(dishes.filter(dish => !used.has(dish.id)), profile),
      allAllowed
    ].filter(pool => pool.length);

    if (!pools.length) return null;

    return pools[0]
      .slice()
      .sort((a, b) => scoreDish(a, target, profile) - scoreDish(b, target, profile))[0];
  }

  function renderChips(items, type = "neutral") {
    const values = listValues(items);
    if (!values.length) return `<span class="small-muted">не указано</span>`;
    return values.map(item => `<span class="planner-chip planner-chip-${type}">${escapeHtml(item)}</span>`).join(" ");
  }

  function renderRestrictions(profile) {
    const blockedCount = dishes.filter(dish => preferenceInfo(dish, profile).blocked).length;
    restrictionsBox.innerHTML = `
      <div class="planner-restrictions soft-shadow mb-4">
        <div>
          <div class="small-muted mb-1">Учитывается из профиля</div>
          <h5 class="mb-2">Ограничения и предпочтения</h5>
          <p class="mb-0 small-muted">Аллергии и «избегать» строго исключают блюда из плана. Любимые продукты и блюда получают приоритет при выборе.</p>
        </div>
        <div class="planner-restrictions-grid">
          <div><strong>Любимое:</strong><br>${renderChips(profile.prefs?.liked, "liked")}</div>
          <div><strong>Избегать:</strong><br>${renderChips(profile.prefs?.disliked, "avoid")}</div>
          <div><strong>Аллергии:</strong><br>${renderChips(profile.allergies, "allergy")}</div>
        </div>
        <div class="small-muted mt-2">Исключено блюд из базы: ${blockedCount} из ${dishes.length}. <a href="profile.html">Изменить профиль</a></div>
      </div>`;
  }

  function renderDishNote(dish, profile) {
    const info = preferenceInfo(dish, profile);
    if (info.liked.length) {
      return `<div class="planner-match mt-2"><i class="bi bi-heart-fill"></i> Совпало с любимым: ${info.liked.map(escapeHtml).join(", ")}</div>`;
    }
    return `<div class="planner-safe mt-2"><i class="bi bi-shield-check"></i> Без сохранённых аллергенов и продуктов из «избегать»</div>`;
  }

  function renderNoDish(profile) {
    const hasStrictRestrictions = listValues(profile.allergies).length || listValues(profile.prefs?.disliked).length;
    return `<div class="col-md-6 col-lg-3"><div class="card p-3 h-100 soft-shadow">
      <div class="small-muted">Нет подходящего блюда</div>
      <p class="mt-2 mb-0">${hasStrictRestrictions ? "Все блюда для этого приёма попали под аллергию или список «избегать»." : "В базе пока не хватает блюд для этого приёма пищи."}</p>
    </div></div>`;
  }

  function renderCard(label, target, dish, profile) {
    if (!dish) return renderNoDish(profile);
    return `<div class="col-md-6 col-lg-3"><div class="card p-3 h-100 soft-shadow planner-card">
      <div class="small-muted">${label} · цель ${target} ккал</div>
      <h5 class="mt-2">${escapeHtml(dish.name)}</h5>
      <p class="mb-2">${fmt(dish.calories, 0)} ккал · Б ${fmt(dish.protein)} · Ж ${fmt(dish.fat)} · У ${fmt(dish.carbs)}</p>
      ${renderDishNote(dish, profile)}
      <a href="dish_detail.html?id=${encodeURIComponent(dish.id)}" class="btn btn-sm btn-outline-primary mt-3">Рецепт</a>
    </div></div>`;
  }

  renderRestrictions(getProfile());

  form.addEventListener("submit", e => {
    e.preventDefault();
    const calories = Number(document.getElementById("calories").value || 2000);
    const meals = Number(document.getElementById("meals").value || 4);
    const profile = getProfile();
    const slots = mealSlots(meals);
    const used = new Set();

    renderRestrictions(profile);

    const cards = slots.map(([label, type, ratio]) => {
      const target = Math.round(calories * ratio);
      const best = pickBestDish(type, target, profile, used);
      if (best) used.add(best.id);
      return renderCard(label, target, best, profile);
    }).join("");

    output.innerHTML = `<div class="row g-3">${cards}</div>`;
  });
});
