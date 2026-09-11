document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const form = document.getElementById("aiForm");
  const input = document.getElementById("aiMessage");
  const submit = document.getElementById("aiSubmit");
  const result = document.getElementById("aiResult");
  const answer = document.getElementById("aiAnswer");
  const warnings = document.getElementById("aiWarnings");
  const recommendations = document.getElementById("aiRecommendations");
  const profileSummary = document.getElementById("aiProfileSummary");
  const targetBadge = document.getElementById("aiTargetBadge");

  if (!form || !input || !submit || !window.PlannerEngine) return;

  let dishes = [];
  try {
    dishes = window.CFContent
      ? await window.CFContent.loadDishes()
      : await loadJson(DATA_PATHS.dishes);
  } catch (error) {
    showError(error.message || "Не удалось загрузить базу блюд.");
  }

  const profile = getProfile();
  const stats = calcProfileStats(profile.data);
  const targetCalories = Math.max(1200, Number(stats.tdee || 2000));
  targetBadge.textContent = `цель: ~${targetCalories} ккал`;
  renderProfile(profile, targetCalories);

  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      input.focus();
    });
  });

  function listText(values) {
    const list = window.PlannerEngine.listValues(values);
    return list.length ? list.join(", ") : "не указано";
  }

  function renderProfile(currentProfile, calories) {
    profileSummary.innerHTML = `
      <div class="ai-profile-list">
        <div class="ai-profile-item"><strong>Расчётная цель</strong>${fmt(calories, 0)} ккал/день</div>
        <div class="ai-profile-item"><strong>Любимое</strong>${escapeHtml(listText(currentProfile.prefs?.liked))}</div>
        <div class="ai-profile-item"><strong>Избегать</strong>${escapeHtml(listText(currentProfile.prefs?.disliked))}</div>
        <div class="ai-profile-item"><strong>Аллергии</strong>${escapeHtml(listText(currentProfile.allergies))}</div>
      </div>`;
  }

  function setLoading(isLoading) {
    submit.disabled = isLoading;
    input.disabled = isLoading;
    submit.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Думаю...'
      : '<i class="bi bi-stars"></i> Спросить AI';
  }

  function showError(message) {
    result.classList.remove("d-none");
    answer.textContent = message;
    warnings.innerHTML = "";
    recommendations.innerHTML = "";
  }

  function renderWarnings(items) {
    const safeItems = Array.isArray(items) ? items.filter(Boolean).slice(0, 5) : [];
    warnings.innerHTML = safeItems.length
      ? `<ul class="ai-warning-list">${safeItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
  }

  function renderRecommendations(ids) {
    const requestedIds = Array.isArray(ids) ? ids.map(String) : [];
    const found = requestedIds
      .map(id => dishes.find(dish => window.PlannerEngine.dishKey(dish) === id))
      .filter(Boolean)
      .slice(0, 5);

    if (!found.length) {
      recommendations.innerHTML = "";
      return;
    }

    recommendations.innerHTML = `
      <div class="ai-recommendations">
        <h3 class="h5">Подходящие блюда из базы</h3>
        ${found.map(dish => `
          <a class="ai-recommendation-card" href="dish_detail.html?id=${encodeURIComponent(window.PlannerEngine.dishKey(dish))}">
            <img src="${escapeHtml(dish.image || "img/hero.jpg")}" alt="${escapeHtml(dish.name)}" loading="lazy">
            <span>
              <strong>${escapeHtml(dish.name)}</strong>
              <small>${fmt(dish.calories, 0)} ккал · Б ${fmt(dish.protein)} · Ж ${fmt(dish.fat)} · У ${fmt(dish.carbs)}</small>
            </span>
          </a>`).join("")}
      </div>`;
  }

  function buildCandidates() {
    const allowed = window.PlannerEngine.allowedDishes(dishes, profile);
    const favoritesFirst = allowed.slice().sort((a, b) => {
      const aLikes = window.PlannerEngine.preferenceInfo(a, profile).liked.length;
      const bLikes = window.PlannerEngine.preferenceInfo(b, profile).liked.length;
      return bLikes - aLikes || Number(b.protein || 0) - Number(a.protein || 0);
    });
    return favoritesFirst.slice(0, 50).map(window.PlannerEngine.compactDishForAi);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    if (!window.CFContent?.isConfigured()) {
      showError("Supabase не настроен. Проверь docs/js/submission-config.js и инструкцию README_PATCH_RU.md.");
      return;
    }

    const candidates = buildCandidates();
    if (!candidates.length) {
      showError("После ограничений профиля не осталось доступных блюд. Добавь рецепты или проверь профиль.");
      return;
    }

    setLoading(true);
    result.classList.remove("d-none");
    answer.textContent = "Готовлю ответ…";
    warnings.innerHTML = "";
    recommendations.innerHTML = "";

    try {
      const response = await window.CFContent.invokeAi({
        message,
        targetCalories,
        profile: {
          liked: window.PlannerEngine.listValues(profile.prefs?.liked).slice(0, 20),
          disliked: window.PlannerEngine.listValues(profile.prefs?.disliked).slice(0, 20),
          allergies: window.PlannerEngine.listValues(profile.allergies).slice(0, 20)
        },
        candidates
      });

      if (!response || typeof response.answer !== "string") {
        throw new Error("AI вернул ответ в неожиданном формате.");
      }

      answer.textContent = response.answer;
      renderWarnings(response.warnings);
      renderRecommendations(response.recommended_dish_ids);
    } catch (error) {
      showError(error.message || "Не удалось получить ответ от AI.");
    } finally {
      setLoading(false);
    }
  });
});
