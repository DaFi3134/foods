
document.addEventListener("DOMContentLoaded", async () => {
  const products = window.CFContent ? await window.CFContent.loadProducts() : await loadJson(DATA_PATHS.products);
  const q = document.getElementById("productSearch");
  const cat = document.getElementById("categorySelect");
  const body = document.querySelector("#productsTable tbody");
  const cats = [...new Set(products.map(p => p.category || "Разное"))].sort();
  cat.innerHTML = `<option value="">Все категории</option>` + cats.map(c => `<option>${escapeHtml(c)}</option>`).join("");

  function render() {
    const query = q.value.trim().toLowerCase();
    const category = cat.value;
    const filtered = products.filter(p => {
      const text = [p.name, p.category].join(" ").toLowerCase();
      return (!query || text.includes(query)) && (!category || p.category === category);
    });
    body.innerHTML = filtered.map(p => `<tr data-product='${escapeHtml(JSON.stringify(p))}'>
      <td>${p.emoji || productEmoji(p)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category || "Разное")}</td>
      <td>${fmt(p.calories,0)}</td><td>${fmt(p.protein)}</td><td>${fmt(p.fat)}</td><td>${fmt(p.carbs)}</td>
    </tr>`).join("");
    document.getElementById("productsCount").textContent = filtered.length;
  }
  [q, cat].forEach(el => el.addEventListener("input", render));
  render();
});
