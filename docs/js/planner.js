document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const form = document.getElementById("plannerForm");
  const output = document.getElementById("planOutput");
  const restrictionsBox = document.getElementById("plannerRestrictions");
  const caloriesInput = document.getElementById("calories");
  const mealsInput = document.getElementById("meals");

  if (!form || !output || !restrictionsBox) return;
  if (!window.PlannerEngine) {
    output.innerHTML = '<div class="alert alert-danger">Не загружен модуль planner-engine.js.</div>';
    return;
  }

  let dishes = [];
  let currentPlan = null;

  try {
    dishes = window.CFContent
      ? await window.CFContent.loadDishes()
      : await loadJson(DATA_PATHS.dishes);
  } catch (error) {
    output.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || "Не удалось загрузить блюда.")}</div>`;
    return;
  }

  const profileStats = calcProfileStats(getProfile().data);
  caloriesInput.value = Math.max(1200, Number(profileStats.tdee || 2000));

  function renderChips(items, type = "neutral") {
    const values = window.PlannerEngine.listValues(items);
    if (!values.length) return '<span class="planner-empty-chip">не указано</span>';
    return values
      .map(item => `<span class="planner-chip planner-chip-${type}">${escapeHtml(item)}</span>`)
      .join(" ");
  }

  function renderRestrictions(profile) {
    const likedCount = window.PlannerEngine.listValues(profile.prefs?.liked).length;
    const avoidedCount = window.PlannerEngine.listValues(profile.prefs?.disliked).length;
    const allergyCount = window.PlannerEngine.listValues(profile.allergies).length;
    const blockedCount = dishes.filter(dish => window.PlannerEngine.preferenceInfo(dish, profile).blocked).length;
    const availableCount = Math.max(dishes.length - blockedCount, 0);

    restrictionsBox.innerHTML = `
      <section class="planner-restrictions soft-shadow mb-4">
        <div class="planner-restrictions-top">
          <div>
            <div class="small-muted mb-1">Учитывается из профиля</div>
            <h2>Ограничения и предпочтения</h2>
            <p>Аллергии и список «избегать» исключают блюда. Любимые продукты получают дополнительный приоритет.</p>
          </div>
          <a class="btn btn-sm btn-outline-primary planner-profile-link" href="profile.html">
            <i class="bi bi-pencil-square"></i> Изменить профиль
          </a>
        </div>
        <div class="planner-restrictions-stats">
          <div><span>${likedCount}</span><small>любимых</small></div>
          <div><span>${avoidedCount}</span><small>исключений</small></div>
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

  function mealIcon(label) {
    const text = window.PlannerEngine.normalize(label);
    if (text.includes("завтрак")) return "☀️";
    if (text.includes("перекус")) return "🍏";
    if (text.includes("обед")) return "🍽️";
    if (text.includes("ужин")) return "🌙";
    return "🥗";
  }

  function renderMacroPills(nutrition) {
    if (!nutrition) return "";
    return `
      <div class="planner-macros">
        <span><strong>${fmt(nutrition.calories, 0)}</strong><small>ккал</small></span>
        <span><strong>${fmt(nutrition.protein)}</strong><small>белки</small></span>
        <span><strong>${fmt(nutrition.fat)}</strong><small>жиры</small></span>
        <span><strong>${fmt(nutrition.carbs)}</strong><small>угл.</small></span>
      </div>`;
  }

  function renderIngredientsPreview(slot) {
    const ingredients = (slot.dish?.ingredients || [])
      .slice(0, 3)
      .map(item => `${escapeHtml(item.product)} ${fmt(Number(item.grams || 0) * slot.portionFactor, 0)} г`);
    if (!ingredients.length) return "";
    const rest = (slot.dish.ingredients || []).length - ingredients.length;
    const more = rest > 0 ? `<span>+ ещё ${rest}</span>` : "";
    return `<div class="planner-ingredients">${ingredients.map(item => `<span>${item}</span>`).join("")}${more}</div>`;
  }

  function renderDishNote(slot, profile) {
    const info = window.PlannerEngine.preferenceInfo(slot.dish, profile);
    if (info.liked.length) {
      return `<div class="planner-match"><i class="bi bi-heart-fill"></i> Совпало с любимым: ${info.liked.map(escapeHtml).join(", ")}</div>`;
    }
    return '<div class="planner-safe"><i class="bi bi-shield-check"></i> Проверено по ограничениям профиля</div>';
  }

  function renderEmptySlot(slot) {
    return `
      <div class="col-md-6 col-xl-3">
        <article class="planner-meal-card planner-empty-card soft-shadow h-100">
          <div class="planner-card-head">
            <span class="planner-meal-icon">${mealIcon(slot.label)}</span>
            <div><strong>${escapeHtml(slot.label)}</strong><small>цель ${slot.targetCalories} ккал</small></div>
          </div>
          <div class="planner-empty-illustration"><i class="bi bi-basket"></i></div>
          <h3>Нет подходящего блюда</h3>
          <p>Расширь базу рецептов или проверь ограничения в профиле.</p>
          <a href="submit_recipe.html" class="btn btn-sm btn-outline-primary mt-auto">Добавить рецепт</a>
        </article>
      </div>`;
  }

  function renderCard(slot, slotIndex, profile) {
    if (!slot.dish) return renderEmptySlot(slot);

    const image = slot.dish.image || "img/hero.jpg";
    const adjustedCalories = Number(slot.nutrition?.calories || 0);
    const delta = Math.round(adjustedCalories - slot.targetCalories);
    const deltaText = Math.abs(delta) <= 5
      ? "почти точно в цель"
      : `${delta > 0 ? "+" : ""}${delta} ккал от цели`;
    const portionPercent = Math.round(slot.portionFactor * 100);

    return `
      <div class="col-md-6 col-xl-3">
        <article class="planner-meal-card soft-shadow h-100">
          <div class="planner-card-image-wrap">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(slot.dish.name)}" class="planner-card-image" loading="lazy">
            <span class="planner-meal-badge">${mealIcon(slot.label)} ${escapeHtml(slot.label)}</span>
            <span class="planner-target-badge">${escapeHtml(deltaText)}</span>
          </div>
          <div class="planner-card-body">
            <div class="planner-card-title-row">
              <h3>${escapeHtml(slot.dish.name)}</h3>
              <span>${slot.targetCalories} ккал</span>
            </div>
            <div class="small text-muted mb-2">Порция: ${portionPercent}% от базового рецепта</div>
            ${renderMacroPills(slot.nutrition)}
            ${renderIngredientsPreview(slot)}
            ${renderDishNote(slot, profile)}
            <div class="d-grid gap-2 mt-auto">
              <a href="dish_detail.html?id=${encodeURIComponent(window.PlannerEngine.dishKey(slot.dish))}" class="btn btn-sm btn-primary planner-recipe-btn">
                Открыть рецепт <i class="bi bi-arrow-right"></i>
              </a>
              <button class="btn btn-sm btn-outline-primary" type="button" data-action="replace" data-slot-index="${slotIndex}">
                <i class="bi bi-arrow-repeat"></i> Заменить блюдо
              </button>
            </div>
          </div>
        </article>
      </div>`;
  }

  function renderShoppingList(plan) {
    if (!plan.shoppingList.length) return "";
    const items = plan.shoppingList.map(item => {
      const amount = item.grams > 0 ? `${fmt(item.grams, 0)} г` : "по рецепту";
      return `<li class="list-group-item d-flex justify-content-between gap-3"><span>${escapeHtml(item.name)}</span><strong>${amount}</strong></li>`;
    }).join("");

    return `
      <section class="soft-shadow bg-white rounded-4 p-4 mt-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <div class="small-muted">Автоматически из выбранных рецептов</div>
            <h2 class="h4 mb-0">Список покупок</h2>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-shopping-list">
            <i class="bi bi-clipboard"></i> Скопировать
          </button>
        </div>
        <ul class="list-group list-group-flush">${items}</ul>
      </section>`;
  }

  function renderPlan(plan) {
    const delta = plan.deltaCalories;
    const deltaLabel = Math.abs(delta) <= 20
      ? "почти точно по цели"
      : `${delta > 0 ? "+" : ""}${delta} ккал относительно цели`;
    const cards = plan.slots.map((slot, index) => renderCard(slot, index, plan.profile)).join("");

    output.innerHTML = `
      <section class="planner-result">
        <div class="planner-summary soft-shadow">
          <div>
            <div class="small-muted mb-1">Итог дня с учётом размеров порций</div>
            <h2>${fmt(plan.total.calories, 0)} ккал</h2>
            <p>${escapeHtml(deltaLabel)} ${fmt(plan.targetCalories, 0)} ккал</p>
          </div>
          <div class="planner-summary-grid">
            <div><strong>${fmt(plan.total.protein)}</strong><small>белки</small></div>
            <div><strong>${fmt(plan.total.fat)}</strong><small>жиры</small></div>
            <div><strong>${fmt(plan.total.carbs)}</strong><small>углеводы</small></div>
            <div><strong>${plan.likedMatches}</strong><small>совпадений</small></div>
          </div>
        </div>
        <div class="row g-4">${cards}</div>
        ${renderShoppingList(plan)}
      </section>`;
  }

  function generate() {
    const requestedCalories = Number(caloriesInput.value || 2000);
    const calories = Math.min(Math.max(requestedCalories, 1200), 6000);
    const meals = Number(mealsInput.value || 4);
    const profile = getProfile();

    if (requestedCalories !== calories) caloriesInput.value = calories;
    renderRestrictions(profile);

    currentPlan = window.PlannerEngine.generatePlan({ dishes, calories, meals, profile });
    renderPlan(currentPlan);
  }

  function copyShoppingList() {
    if (!currentPlan?.shoppingList?.length) return;
    const text = currentPlan.shoppingList
      .map(item => `• ${item.name} — ${item.grams > 0 ? `${Math.round(item.grams)} г` : "по рецепту"}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      const button = output.querySelector('[data-action="copy-shopping-list"]');
      if (!button) return;
      const original = button.innerHTML;
      button.innerHTML = '<i class="bi bi-check-lg"></i> Скопировано';
      setTimeout(() => { button.innerHTML = original; }, 1400);
    }).catch(() => {});
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    generate();
  });

  output.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || !currentPlan) return;

    if (button.dataset.action === "replace") {
      const slotIndex = Number(button.dataset.slotIndex);
      const candidates = window.PlannerEngine.replacementCandidates({
        plan: currentPlan,
        slotIndex,
        dishes,
        limit: 1
      });
      if (!candidates.length) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-slash-circle"></i> Нет альтернатив';
        return;
      }
      currentPlan = window.PlannerEngine.replaceSlot(currentPlan, slotIndex, dishes);
      renderPlan(currentPlan);
    }

    if (button.dataset.action === "copy-shopping-list") copyShoppingList();
  });

  renderRestrictions(getProfile());
});
