
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [products, dishes, myths] = await Promise.all([
      loadJson(DATA_PATHS.products), loadJson(DATA_PATHS.dishes), loadJson(DATA_PATHS.myths)
    ]);
    document.getElementById("productsCount").textContent = products.length;
    document.getElementById("dishesCount").textContent = dishes.length;
    document.getElementById("mythsCount").textContent = myths.length;

    const latest = document.getElementById("latestRecipes");
    latest.innerHTML = dishes.slice(0, 3).map(d => `
      <div class="col-md-4">
        <div class="card recipe-card soft-shadow h-100 p-3">
          <img src="${escapeHtml(d.image || "img/hero.jpg")}" alt="${escapeHtml(d.name)}">
          <div class="card-body px-0 pb-0">
            <h5>${escapeHtml(d.name)}</h5>
            <p class="small-muted mb-2">${mealTypeText(d.meal_types)} · ${fmt(d.calories, 0)} ккал</p>
            <a href="dish_detail.html?id=${encodeURIComponent(d.id)}" class="btn btn-sm btn-outline-primary">Открыть</a>
          </div>
        </div>
      </div>`).join("");
  } catch (e) {
    console.error(e);
  }
});
