document.addEventListener("DOMContentLoaded", async () => {
  let products = [];
  let dishes = [];
  let myths = [];

  try {
    products = await loadJson(DATA_PATHS.products);
  } catch (error) {
    console.error("Не удалось загрузить продукты:", error);
  }

  try {
    dishes = await loadJson(DATA_PATHS.dishes);
  } catch (error) {
    console.error("Не удалось загрузить рецепты:", error);
  }

  try {
    myths = await loadJson(DATA_PATHS.myths);
  } catch (error) {
    console.error("Не удалось загрузить мифы:", error);
  }

  setText("productsCount", products.length);
  setText("dishesCount", dishes.length);
  setText("mythsCount", myths.length);

  renderRecipesCarousel(dishes.slice(0, 6));
  renderMythsCarousel(myths.slice(0, 6));

  initCarousel("recipesCarousel");
  initCarousel("mythsCarousel");
});

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function getDishTitle(dish) {
  return dish.name || dish.title || dish.recipe_name || "Рецепт без названия";
}

function getDishImage(dish) {
  return dish.image || dish.img || "img/hero.jpg";
}

function getDishCalories(dish) {
  return dish.calories || dish.kcal || dish.energy || 0;
}

function getDishId(dish, index) {
  return dish.id || dish.num_id || index + 1;
}

function getDishIngredients(dish) {
  const ingredients = dish.ingredients || [];

  if (!Array.isArray(ingredients)) {
    return String(ingredients).slice(0, 120);
  }

  return ingredients
    .slice(0, 3)
    .map(item => {
      if (typeof item === "string") return item;

      const product = item.product || item.name || "Продукт";
      const grams = item.grams || item.amount || "";

      return grams ? `${product} — ${grams} г` : product;
    })
    .join(", ");
}

function getMealText(dish) {
  const types = toArray(dish.meal_types || dish.mealTypes || dish.category);

  if (!types.length) return "Любой приём";

  if (typeof mealTypeText === "function") {
    return mealTypeText(types);
  }

  return types.join(", ");
}

function renderRecipesCarousel(dishes) {
  const inner = document.getElementById("recipesCarouselInner");
  if (!inner) return;

  if (!dishes.length) {
    inner.innerHTML = `
      <div class="carousel-item active">
        <div class="empty-state text-center">
          Пока нет рецептов.
        </div>
      </div>
    `;
    return;
  }

  inner.innerHTML = dishes.map((dish, index) => {
    const title = getDishTitle(dish);
    const image = getDishImage(dish);
    const calories = getDishCalories(dish);
    const ingredients = getDishIngredients(dish);
    const mealText = getMealText(dish);
    const id = getDishId(dish, index);

    return `
      <div class="carousel-item ${index === 0 ? "active" : ""}">
        <div class="card home-carousel-card soft-shadow">
          <img 
            src="${escapeHtml(image)}" 
            class="card-img-top" 
            alt="${escapeHtml(title)}"
            onerror="this.src='img/hero.jpg'"
          >

          <div class="card-body">
            <h5>${escapeHtml(title)}</h5>

            <p class="small-muted mb-2">
              ${escapeHtml(mealText)} · ${escapeHtml(calories)} ккал
            </p>

            ${
              ingredients
                ? `<p class="small text-muted">${escapeHtml(ingredients)}</p>`
                : ""
            }

            <a href="dish_detail.html?id=${encodeURIComponent(id)}" class="btn btn-outline-primary">
              Открыть рецепт
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMythsCarousel(myths) {
  const inner = document.getElementById("mythsCarouselInner");
  if (!inner) return;

  if (!myths.length) {
    inner.innerHTML = `
      <div class="carousel-item active">
        <div class="empty-state text-center">
          Пока нет мифов и статей.
        </div>
      </div>
    `;
    return;
  }

  inner.innerHTML = myths.map((myth, index) => {
    const title = myth.title || myth.name || "Статья без названия";
    const content = myth.content || myth.description || myth.text || "";
    const image = myth.img || myth.image || "img/myth1.jpg";
    const id = myth.id || index + 1;

    return `
      <div class="carousel-item ${index === 0 ? "active" : ""}">
        <div class="card home-carousel-card soft-shadow">
          <img 
            src="${escapeHtml(image)}" 
            class="card-img-top" 
            alt="${escapeHtml(title)}"
            onerror="this.src='img/myth1.jpg'"
          >

          <div class="card-body">
            <h5>${escapeHtml(title)}</h5>

            <p class="small text-muted">
              ${escapeHtml(content.slice(0, 160))}
              ${content.length > 160 ? "..." : ""}
            </p>

            <a href="myth_detail.html?id=${encodeURIComponent(id)}" class="btn btn-outline-primary">
              Читать
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function initCarousel(id) {
  const element = document.getElementById(id);

  if (element && window.bootstrap) {
    new bootstrap.Carousel(element, {
      interval: false,
      touch: true,
      ride: false
    });
  }
}
