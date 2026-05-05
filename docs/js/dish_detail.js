
document.addEventListener("DOMContentLoaded", async () => {
  const [products, dishes] = window.CFContent
    ? await Promise.all([window.CFContent.loadProducts(), window.CFContent.loadDishes()])
    : await Promise.all([loadJson(DATA_PATHS.products), loadJson(DATA_PATHS.dishes)]);
  const id = getQueryParam("id");
  const dish = findDishById(dishes, id) || dishes[0];
  const box = document.getElementById("dishDetail");
  if (!dish) {
    box.innerHTML = `<div class="empty-state">Блюдо не найдено. <a href="library.html">Вернуться в библиотеку</a></div>`;
    return;
  }
  const totals = calcDishTotals(dish, products);
  box.innerHTML = `
    <div class="row g-4 align-items-start">
      <div class="col-lg-5"><img class="w-100 rounded-4 soft-shadow" style="max-height:420px;object-fit:cover" src="${escapeHtml(dish.image || "img/hero.jpg")}" alt="${escapeHtml(dish.name)}"></div>
      <div class="col-lg-7">
        <a href="library.html" class="small">← Назад в библиотеку</a>
        <h1 class="page-title mt-2">${escapeHtml(dish.name)}</h1>
        <p class="small-muted">${mealTypeText(dish.meal_types)} · автор: ${escapeHtml(dish.author || "—")}</p>
        <div class="d-flex flex-wrap gap-2 mb-4">
          <span class="stat-pill">${fmt(totals.calories,0)} ккал</span>
          <span class="stat-pill">Б ${fmt(totals.protein)} г</span>
          <span class="stat-pill">Ж ${fmt(totals.fat)} г</span>
          <span class="stat-pill">У ${fmt(totals.carbs)} г</span>
        </div>
        <h5>Ингредиенты</h5>
        <ul>${(dish.ingredients || []).map(i => `<li>${escapeHtml(i.product)} — ${fmt(i.grams,0)} г</li>`).join("")}</ul>
        <h5 class="mt-4">Приготовление</h5>
        <ol>${(dish.instructions || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      </div>
    </div>`;
});
