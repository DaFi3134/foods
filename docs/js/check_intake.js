
document.addEventListener("DOMContentLoaded", async () => {
  const [products, dishes] = await Promise.all([loadJson(DATA_PATHS.products), loadJson(DATA_PATHS.dishes)]);
  const list = document.getElementById("itemsList");
  const datalist = document.getElementById("foodOptions");
  datalist.innerHTML = products.map(p => `<option value="продукт: ${escapeHtml(p.name)}"></option>`).join("") + dishes.map(d => `<option value="блюдо: ${escapeHtml(d.name)}"></option>`).join("");

  function addRow() {
    const row = document.createElement("div");
    row.className = "row g-2 mb-2 align-items-center intake-row";
    row.innerHTML = `<div class="col-md-7"><input class="form-control food-name" list="foodOptions" placeholder="Начните писать продукт или блюдо"></div><div class="col-md-3"><input class="form-control grams" type="number" min="1" value="100"></div><div class="col-md-2"><button class="btn btn-outline-danger w-100 remove" type="button">Удалить</button></div>`;
    list.appendChild(row);
  }
  document.getElementById("addRow").addEventListener("click", addRow);
  list.addEventListener("click", e => { if (e.target.classList.contains("remove")) e.target.closest(".intake-row").remove(); });

  document.getElementById("intakeForm").addEventListener("submit", e => {
    e.preventDefault();
    const total = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    const messages = [];
    list.querySelectorAll(".intake-row").forEach(row => {
      let raw = row.querySelector(".food-name").value.trim();
      const grams = Number(row.querySelector(".grams").value || 0);
      let type = raw.startsWith("блюдо:") ? "dish" : "product";
      raw = raw.replace(/^продукт:\s*/i, "").replace(/^блюдо:\s*/i, "").trim();
      if (!raw || grams <= 0) return;
      if (type === "dish") {
        const d = dishes.find(x => x.name === raw);
        if (!d) { messages.push(`Блюдо не найдено: ${raw}`); return; }
        const factor = grams / 100;
        addTotals(total, { calories: d.calories * factor, protein: d.protein * factor, fat: d.fat * factor, carbs: d.carbs * factor });
      } else {
        const p = products.find(x => x.name === raw);
        if (!p) { messages.push(`Продукт не найден: ${raw}`); return; }
        addTotals(total, calcFromProduct(p, grams));
      }
    });
    const tdee = calcProfileStats(getProfile().data).tdee;
    const diff = Math.round(total.calories - tdee);
    document.getElementById("intakeResult").innerHTML = `
      <div class="row g-3">
        <div class="col-md-3"><div class="kpi-card"><div class="small-muted">Калории</div><h3>${fmt(total.calories,0)}</h3></div></div>
        <div class="col-md-3"><div class="kpi-card"><div class="small-muted">Белки</div><h3>${fmt(total.protein)}</h3></div></div>
        <div class="col-md-3"><div class="kpi-card"><div class="small-muted">Жиры</div><h3>${fmt(total.fat)}</h3></div></div>
        <div class="col-md-3"><div class="kpi-card"><div class="small-muted">Углеводы</div><h3>${fmt(total.carbs)}</h3></div></div>
      </div>
      <div class="alert ${diff > 0 ? "alert-warning" : "alert-success"} mt-3">Ваш ориентир TDEE из профиля: ${tdee} ккал. Разница: ${diff > 0 ? "+" : ""}${diff} ккал.</div>
      ${messages.length ? `<div class="alert alert-info">${messages.map(escapeHtml).join("<br>")}</div>` : ""}`;
  });
  addRow();
});
