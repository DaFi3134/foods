
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("calcForm");
  const result = document.getElementById("calcResult");
  document.getElementById("fillFromProfile").addEventListener("click", () => {
    const p = getProfile().data;
    form.sex.value = p.sex || "male";
    form.age.value = p.age || 25;
    form.weight.value = p.weight || 70;
    form.height.value = p.height || 175;
    form.activity.value = p.activity || "sedentary";
  });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.age = Number(data.age); data.weight = Number(data.weight); data.height = Number(data.height);
    const stats = calcProfileStats(data);
    const deficit = Math.round(stats.tdee * 0.85);
    const surplus = Math.round(stats.tdee * 1.1);
    const marker = Math.max(0, Math.min(100, ((stats.bmi - 15) / 25) * 100));
    result.innerHTML = `
      <div class="row g-3">
        <div class="col-md-4"><div class="kpi-card"><div class="small-muted">BMR</div><h3>${stats.bmr}</h3><div>ккал в покое</div></div></div>
        <div class="col-md-4"><div class="kpi-card"><div class="small-muted">TDEE</div><h3>${stats.tdee}</h3><div>ккал с активностью</div></div></div>
        <div class="col-md-4"><div class="kpi-card"><div class="small-muted">BMI</div><h3>${stats.bmi}</h3><div>${stats.bmi < 18.5 ? "ниже нормы" : stats.bmi < 25 ? "норма" : stats.bmi < 30 ? "избыточный вес" : "ожирение"}</div></div></div>
      </div>
      <div class="card p-4 mt-3">
        <p class="mb-2">Для мягкого снижения веса: примерно <strong>${deficit} ккал/день</strong>. Для набора: примерно <strong>${surplus} ккал/день</strong>.</p>
        <div class="bmi-bar mt-3"><div class="bmi-marker" style="left:${marker}%"></div></div>
      </div>`;
  });
});
