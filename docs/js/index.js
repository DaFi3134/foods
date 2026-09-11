document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const state = { products: [], dishes: [], myths: [] };

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return String(value).split(",").map(item => item.trim()).filter(Boolean);
  }

  function dishTitle(dish) {
    return dish?.name || dish?.title || dish?.recipe_name || "Рецепт без названия";
  }

  function dishImage(dish) {
    return dish?.image || dish?.img || "img/hero.jpg";
  }

  function dishId(dish, index) {
    return dish?.id ?? dish?.num_id ?? index + 1;
  }

  function dishIngredients(dish) {
    const ingredients = dish?.ingredients || [];
    if (!Array.isArray(ingredients)) return String(ingredients).slice(0, 120);
    return ingredients.slice(0, 3).map(item => {
      if (typeof item === "string") return item;
      const product = item?.product || item?.name || "Продукт";
      const grams = item?.grams || item?.amount || "";
      return grams ? `${product} — ${grams} г` : product;
    }).join(", ");
  }

  function mealText(dish) {
    const types = toArray(dish?.meal_types || dish?.mealTypes || dish?.category);
    if (!types.length) return "Любой приём";
    return typeof mealTypeText === "function" ? mealTypeText(types) : types.join(", ");
  }

  function renderRecipes(dishes) {
    const inner = document.getElementById("recipesCarouselInner");
    if (!inner) return;
    if (!dishes.length) {
      inner.innerHTML = '<div class="carousel-item active"><div class="empty-state text-center">Пока нет рецептов.</div></div>';
      return;
    }

    inner.innerHTML = dishes.slice(0, 6).map((dish, index) => {
      const title = dishTitle(dish);
      const ingredients = dishIngredients(dish);
      return `
        <div class="carousel-item ${index === 0 ? "active" : ""}">
          <div class="card home-carousel-card soft-shadow">
            <img src="${escapeHtml(dishImage(dish))}" class="card-img-top" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='img/hero.jpg'">
            <div class="card-body">
              <h5>${escapeHtml(title)}</h5>
              <p class="small-muted mb-2">${escapeHtml(mealText(dish))} · ${fmt(dish?.calories || 0, 0)} ккал</p>
              ${ingredients ? `<p class="small text-muted">${escapeHtml(ingredients)}</p>` : ""}
              <a href="dish_detail.html?id=${encodeURIComponent(dishId(dish, index))}" class="btn btn-outline-primary">Открыть рецепт</a>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  function renderMyths(myths) {
    const inner = document.getElementById("mythsCarouselInner");
    if (!inner) return;
    if (!myths.length) {
      inner.innerHTML = '<div class="carousel-item active"><div class="empty-state text-center">Пока нет мифов и статей.</div></div>';
      return;
    }

    inner.innerHTML = myths.slice(0, 6).map((myth, index) => {
      const title = myth?.title || myth?.name || "Статья без названия";
      const content = String(myth?.content || myth?.description || myth?.text || "");
      const image = myth?.img || myth?.image || "img/myth1.jpg";
      const id = myth?.id ?? index + 1;
      return `
        <div class="carousel-item ${index === 0 ? "active" : ""}">
          <div class="card home-carousel-card soft-shadow">
            <img src="${escapeHtml(image)}" class="card-img-top" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='img/myth1.jpg'">
            <div class="card-body">
              <h5>${escapeHtml(title)}</h5>
              <p class="small text-muted">${escapeHtml(content.slice(0, 160))}${content.length > 160 ? "…" : ""}</p>
              <a href="myth_detail.html?id=${encodeURIComponent(id)}" class="btn btn-outline-primary">Читать</a>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  function render() {
    setText("productsCount", state.products.length);
    setText("dishesCount", state.dishes.length);
    setText("mythsCount", state.myths.length);
    renderRecipes(state.dishes);
    renderMyths(state.myths);
  }

  async function loadLocal() {
    const results = await Promise.allSettled([
      loadJson(DATA_PATHS.products),
      loadJson(DATA_PATHS.dishes),
      loadJson(DATA_PATHS.myths)
    ]);
    state.products = results[0].status === "fulfilled" ? results[0].value : [];
    state.dishes = results[1].status === "fulfilled" ? results[1].value : [];
    state.myths = results[2].status === "fulfilled" ? results[2].value : [];
    results.filter(item => item.status === "rejected").forEach(item => console.error(item.reason));
  }

  await loadLocal();
  render();

  if (!window.CFContent?.isConfigured()) return;
  try {
    const [products, dishes, myths] = await Promise.all([
      window.CFContent.loadProducts(),
      window.CFContent.loadDishes(),
      window.CFContent.loadMyths()
    ]);
    state.products = products;
    state.dishes = dishes;
    state.myths = myths;
    render();
  } catch (error) {
    console.warn("Supabase-материалы не догрузились, главная остаётся на локальных данных:", error);
  }
});
