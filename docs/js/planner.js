document.addEventListener("DOMContentLoaded", async () => {
  const dishes = window.CFContent ? await window.CFContent.loadDishes() : await loadJson(DATA_PATHS.dishes);
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
    if (!values.length) return `<span class="planner-empty-chip">не указано</span>`;
    return values.map(item => `<span class="planner-chip planner-chip-${type}">${escapeHtml(item)}</span>`).join(" ");
  }

  function renderRestrictions(profile) {
    const likedCount = listValues(profile.prefs?.liked).length;
    const avoidCount = listValues(profile.prefs?.disliked).length;
    const allergyCount = listValues(profile.allergies).length;
    const blockedCount = dishes.filter(dish => preferenceInfo(dish, profile).blocked).length;
    const availableCount = Math.max(dishes.length - blockedCount, 0);

    restrictionsBox.innerHTML = `
      <section class="planner-restrictions soft-shadow mb-4">
        <div class="planner-restrictions-top">
          <div>
            <div class="small-muted mb-1">Учитывается из профиля</div>
            <h2>Ограничения и предпочтения</h2>
            <p>Аллергии и «избегать» строго исключают блюда из плана. Любимые продукты и блюда получают приоритет при выборе.</p>
          </div>
          <a class="btn btn-sm btn-outline-primary planner-profile-link" href="profile.html"><i class="bi bi-pencil-square"></i> Изменить профиль</a>
        </div>
        <div class="planner-restrictions-stats">
          <div><span>${likedCount}</span><small>любимых</small></div>
          <div><span>${avoidCount}</span><small>исключений</small></div>
          <div><span>${allergyCount}</span><small>аллергий</small></div>
          <div><span>${availableCount}/${dishes.length}</span><small>доступно блюд</small></div>
        </div>
        <div class="planner-restrictions-grid">
          <div><strong><i class="bi bi-heart-fill"></i> Любимое</strong><br>${renderChips(profile.prefs?.liked, "liked")}</div>
          <div><strong><i class="bi bi-dash-circle"></i> Избегать</strong><br>${renderChips(profile.prefs?.disliked, "avoid")}</div>
          <div><strong><i class="bi bi-exclamation-triangle"></i> Аллергии</strong><br>${renderChips(profile.allergies, "allergy")}</div>
        </div>
      </section>`;
  }

  function renderDishNote(dish, profile) {
    const info = preferenceInfo(dish, profile);
    if (info.liked.length) {
      return `<div class="planner-match"><i class="bi bi-heart-fill"></i> Совпало с любимым: ${info.liked.map(escapeHtml).join(", ")}</div>`;
    }
    return `<div class="planner-safe"><i class="bi bi-shield-check"></i> Без сохранённых аллергенов и продуктов из «избегать»</div>`;
  }

  function mealIcon(label) {
    const norm = normalize(label);
    if (norm.includes("завтрак")) return "☀️";
    if (norm.includes("перекус")) return "🍏";
    if (norm.includes("обед")) return "🍽️";
    if (norm.includes("ужин")) return "🌙";
    return "🥗";
  }

  function renderMacroPills(dish) {
    return `
      <div class="planner-macros">
        <span><strong>${fmt(dish.calories, 0)}</strong><small>ккал</small></span>
        <span><strong>${fmt(dish.protein)}</strong><small>белки</small></span>
        <span><strong>${fmt(dish.fat)}</strong><small>жиры</small></span>
        <span><strong>${fmt(dish.carbs)}</strong><small>угл.</small></span>
      </div>`;
  }

  function renderIngredientsPreview(dish) {
    const ingredients = (dish.ingredients || [])
      .slice(0, 3)
      .map(item => `${escapeHtml(item.product)} ${fmt(item.grams, 0)} г`);
    if (!ingredients.length) return "";
    const more = (dish.ingredients || []).length > 3 ? `<span>+ ещё ${(dish.ingredients || []).length - 3}</span>` : "";
    return `<div class="planner-ingredients">${ingredients.map(item => `<span>${item}</span>`).join("")}${more}</div>`;
  }

  function renderNoDish(label, target, profile) {
    const hasStrictRestrictions = listValues(profile.allergies).length || listValues(profile.prefs?.disliked).length;
    return `<div class="col-md-6 col-xl-3">
      <article class="planner-meal-card planner-empty-card soft-shadow h-100">
        <div class="planner-card-head">
          <span class="planner-meal-icon">${mealIcon(label)}</span>
          <div><strong>${escapeHtml(label)}</strong><small>цель ${target} ккал</small></div>
        </div>
        <div class="planner-empty-illustration"><i class="bi bi-basket"></i></div>
        <h3>Нет подходящего блюда</h3>
        <p>${hasStrictRestrictions ? "Все блюда для этого приёма попали под аллергию или список «избегать»." : "В базе пока не хватает блюд для этого приёма пищи."}</p>
        <a href="submit_recipe.html" class="btn btn-sm btn-outline-primary mt-auto">Добавить рецепт</a>
      </article>
    </div>`;
  }

  function renderCard(label, target, dish, profile) {
    if (!dish) return renderNoDish(label, target, profile);
    const image = dish.image || "img/hero.jpg";
    const delta = Math.round(Number(dish.calories || 0) - target);
    const deltaText = delta === 0 ? "точно в цель" : `${delta > 0 ? "+" : ""}${delta} ккал от цели`;

    return `<div class="col-md-6 col-xl-3">
      <article class="planner-meal-card soft-shadow h-100">
        <div class="planner-card-image-wrap">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(dish.name)}" class="planner-card-image">
          <span class="planner-meal-badge">${mealIcon(label)} ${escapeHtml(label)}</span>
          <span class="planner-target-badge">${escapeHtml(deltaText)}</span>
        </div>
        <div class="planner-card-body">
          <div class="planner-card-title-row">
            <h3>${escapeHtml(dish.name)}</h3>
            <span>${target} ккал</span>
          </div>
          ${renderMacroPills(dish)}
          ${renderIngredientsPreview(dish)}
          ${renderDishNote(dish, profile)}
          <a href="dish_detail.html?id=${encodeURIComponent(dish.id)}" class="btn btn-sm btn-primary planner-recipe-btn">Открыть рецепт <i class="bi bi-arrow-right"></i></a>
        </div>
      </article>
    </div>`;
  }

  function renderPlanSummary(cards, calories, usedDishes, profile) {
    const total = usedDishes.reduce((sum, dish) => addTotals(sum, {
      calories: Number(dish.calories || 0),
      protein: Number(dish.protein || 0),
      fat: Number(dish.fat || 0),
      carbs: Number(dish.carbs || 0)
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    const delta = Math.round(total.calories - calories);
    const likedMatches = usedDishes.reduce((count, dish) => count + preferenceInfo(dish, profile).liked.length, 0);
    const deltaLabel = delta === 0 ? "точно по цели" : `${delta > 0 ? "+" : ""}${delta} ккал`;

    return `
      <section class="planner-result">
        <div class="planner-summary soft-shadow">
          <div>
            <div class="small-muted mb-1">Итог дня</div>
            <h2>${fmt(total.calories, 0)} ккал</h2>
            <p>${escapeHtml(deltaLabel)} относительно цели ${fmt(calories, 0)} ккал</p>
          </div>
          <div class="planner-summary-grid">
            <div><strong>${fmt(total.protein)}</strong><small>белки</small></div>
            <div><strong>${fmt(total.fat)}</strong><small>жиры</small></div>
            <div><strong>${fmt(total.carbs)}</strong><small>углеводы</small></div>
            <div><strong>${likedMatches}</strong><small>совпадений</small></div>
          </div>
        </div>
        <div class="row g-4">${cards}</div>
      </section>`;
  }

  renderRestrictions(getProfile());

  form.addEventListener("submit", e => {
    e.preventDefault();
    const calories = Number(document.getElementById("calories").value || 2000);
    const meals = Number(document.getElementById("meals").value || 4);
    const profile = getProfile();
    const slots = mealSlots(meals);
    const used = new Set();
    const picked = [];

    renderRestrictions(profile);

    const cards = slots.map(([label, type, ratio]) => {
      const target = Math.round(calories * ratio);
      const best = pickBestDish(type, target, profile, used);
      if (best) {
        used.add(best.id);
        picked.push(best);
      }
      return renderCard(label, target, best, profile);
    }).join("");

    output.innerHTML = renderPlanSummary(cards, calories, picked, profile);
  });
});
