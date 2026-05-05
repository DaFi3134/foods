
document.addEventListener("DOMContentLoaded", async () => {
  let products = [];
  let dishes = [];

  const q = document.getElementById("searchInput");
  const show = document.getElementById("showSelect");
  const meal = document.getElementById("mealSelect");
  const dishesBox = document.getElementById("dishesList");
  const productsBox = document.getElementById("productsList");

  function productCard(p) {
    return `<div class="col-md-4 col-lg-3"><div class="card p-3 h-100 soft-shadow">
      <div class="fs-2">${p.emoji || productEmoji(p)}</div>
      <h6 class="mt-2 mb-1">${escapeHtml(p.name)}</h6>
      <div class="small-muted">${escapeHtml(p.category || "Разное")}</div>
      <div class="mt-2 small">${fmt(p.calories,0)} ккал · Б ${fmt(p.protein)} · Ж ${fmt(p.fat)} · У ${fmt(p.carbs)}</div>
    </div></div>`;
  }

  function dishCard(d) {
    return `<div class="col-md-6 col-lg-4"><div class="card recipe-card soft-shadow h-100 p-3">
      <img src="${escapeHtml(d.image || "img/hero.jpg")}" alt="${escapeHtml(d.name)}">
      <div class="card-body px-0 pb-0">
        <div class="d-flex justify-content-between gap-2 align-items-start">
          <h5>${escapeHtml(d.name)}</h5>
          <span class="badge bg-success">${fmt(d.calories,0)} ккал</span>
        </div>
        <p class="small-muted mb-2">${mealTypeText(d.meal_types)}</p>
        <p class="small mb-3">Б ${fmt(d.protein)} · Ж ${fmt(d.fat)} · У ${fmt(d.carbs)}</p>
        <div class="mb-3">${(d.tags || []).map(t => `<span class="badge bg-light text-dark border me-1">${escapeHtml(t)}</span>`).join("")}</div>
        <a class="btn btn-outline-primary btn-sm" href="dish_detail.html?id=${encodeURIComponent(d.id)}">Подробнее</a>
      </div>
    </div></div>`;
  }

  function render() {
    const query = q.value.trim().toLowerCase();
    const showVal = show.value;
    const mealVal = meal.value;
    const filteredDishes = dishes.filter(d => {
      const text = [d.name, ...(d.tags || []), mealTypeText(d.meal_types)].join(" ").toLowerCase();
      const mealOk = !mealVal || (d.meal_types || []).includes(mealVal);
      return (!query || text.includes(query)) && mealOk;
    });
    const filteredProducts = products.filter(p => {
      const text = [p.name, p.category].join(" ").toLowerCase();
      return !query || text.includes(query);
    });

    dishesBox.innerHTML = (showVal === "products") ? "" : (filteredDishes.length ? filteredDishes.map(dishCard).join("") : `<div class="empty-state">Блюда не найдены.</div>`);
    productsBox.innerHTML = (showVal === "dishes") ? "" : (filteredProducts.length ? filteredProducts.slice(0, 60).map(productCard).join("") : `<div class="empty-state">Продукты не найдены.</div>`);
    document.getElementById("dishesTitle").style.display = showVal === "products" ? "none" : "block";
    document.getElementById("productsTitle").style.display = showVal === "dishes" ? "none" : "block";
  }

  async function loadLocalFirst() {
    try {
      [products, dishes] = await Promise.all([loadJson(DATA_PATHS.products), loadJson(DATA_PATHS.dishes)]);
      render();
    } catch (error) {
      dishesBox.innerHTML = `<div class="empty-state">Не удалось загрузить локальные рецепты. Проверь файлы data/dishes.json и data/products.json.</div>`;
      productsBox.innerHTML = "";
      console.error(error);
      return;
    }

    if (!window.CFContent || !window.CFContent.isConfigured()) return;

    try {
      const [remoteProducts, remoteDishes] = await Promise.all([window.CFContent.loadProducts(), window.CFContent.loadDishes()]);
      products = remoteProducts;
      dishes = remoteDishes;
      render();
    } catch (error) {
      console.warn("Supabase-материалы не догрузились, показываем локальную библиотеку:", error);
    }
  }

  [q, show, meal].forEach(el => el.addEventListener("input", render));
  render();
  await loadLocalFirst();
});
