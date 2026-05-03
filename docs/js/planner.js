
document.addEventListener("DOMContentLoaded", async () => {
  const dishes = await loadJson(DATA_PATHS.dishes);
  const form = document.getElementById("plannerForm");
  const output = document.getElementById("planOutput");
  const pStats = calcProfileStats(getProfile().data);
  document.getElementById("calories").value = pStats.tdee || 2000;

  function scoreDish(d, target, profile) {
    let score = Math.abs(Number(d.calories || 0) - target);
    const name = String(d.name || "").toLowerCase();
    for (const w of profile.prefs.liked || []) if (name.includes(w)) score *= 0.8;
    for (const w of profile.prefs.disliked || []) if (name.includes(w)) score *= 1.35;
    for (const a of profile.allergies || []) {
      const ing = (d.ingredients || []).map(i => String(i.product).toLowerCase()).join(" ");
      if (name.includes(a) || ing.includes(a)) score += 999999;
    }
    return score;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const calories = Number(document.getElementById("calories").value || 2000);
    const meals = Number(document.getElementById("meals").value || 4);
    const profile = getProfile();
    const slots = meals === 4
      ? [["Завтрак","breakfast",.25],["Перекус","snack",.10],["Обед","lunch",.35],["Ужин","dinner",.30]]
      : Array.from({length: meals}, (_, i) => [`Приём ${i+1}`, null, 1/meals]);
    const used = new Set();
    const cards = slots.map(([label, type, ratio]) => {
      const target = Math.round(calories * ratio);
      let candidates = dishes.filter(d => !used.has(d.id) && (!type || (d.meal_types || []).includes(type)));
      if (!candidates.length) candidates = dishes.filter(d => !used.has(d.id));
      const best = candidates.sort((a,b) => scoreDish(a,target,profile) - scoreDish(b,target,profile))[0];
      if (best) used.add(best.id);
      return `<div class="col-md-6 col-lg-3"><div class="card p-3 h-100 soft-shadow">
        <div class="small-muted">${label} · цель ${target} ккал</div>
        ${best ? `<h5 class="mt-2">${escapeHtml(best.name)}</h5><p>${fmt(best.calories,0)} ккал · Б ${fmt(best.protein)} · Ж ${fmt(best.fat)} · У ${fmt(best.carbs)}</p><a href="dish_detail.html?id=${encodeURIComponent(best.id)}" class="btn btn-sm btn-outline-primary">Рецепт</a>` : `<p class="mt-2">Нет подходящих блюд.</p>`}
      </div></div>`;
    }).join("");
    output.innerHTML = `<div class="row g-3">${cards}</div>`;
  });
});
