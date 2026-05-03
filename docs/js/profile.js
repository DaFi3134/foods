
document.addEventListener("DOMContentLoaded", () => {
  const profile = getProfile();
  const form = document.getElementById("profileForm");
  const likedInput = document.getElementById("likedInput");
  const dislikedInput = document.getElementById("dislikedInput");
  const allergyInput = document.getElementById("allergyInput");
  const likedBox = document.getElementById("likedBox");
  const dislikedBox = document.getElementById("dislikedBox");
  const allergyBox = document.getElementById("allergyBox");
  const statsBox = document.getElementById("profileStats");

  form.sex.value = profile.data.sex || "male";
  form.age.value = profile.data.age || 25;
  form.weight.value = profile.data.weight || 70;
  form.height.value = profile.data.height || 175;
  form.activity.value = profile.data.activity || "sedentary";

  function chip(text, arr, render) {
    return `<span class="chip">${escapeHtml(text)} <button type="button" data-value="${escapeHtml(text)}">×</button></span>`;
  }
  function renderAll() {
    likedBox.innerHTML = (profile.prefs.liked || []).map(x => chip(x)).join("");
    dislikedBox.innerHTML = (profile.prefs.disliked || []).map(x => chip(x)).join("");
    allergyBox.innerHTML = (profile.allergies || []).map(x => chip(x)).join("");
    const stats = calcProfileStats(profile.data);
    statsBox.innerHTML = `<span class="stat-pill">BMR: ${stats.bmr}</span> <span class="stat-pill">TDEE: ${stats.tdee}</span> <span class="stat-pill">BMI: ${stats.bmi}</span>`;
  }
  function addTo(arr, input) {
    const value = input.value.trim().toLowerCase();
    if (value && !arr.includes(value)) arr.push(value);
    input.value = "";
    saveProfile(profile);
    renderAll();
  }
  document.getElementById("addLiked").addEventListener("click", () => addTo(profile.prefs.liked, likedInput));
  document.getElementById("addDisliked").addEventListener("click", () => addTo(profile.prefs.disliked, dislikedInput));
  document.getElementById("addAllergy").addEventListener("click", () => addTo(profile.allergies, allergyInput));
  [likedInput, dislikedInput, allergyInput].forEach((input, idx) => input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); [document.getElementById("addLiked"),document.getElementById("addDisliked"),document.getElementById("addAllergy")][idx].click(); }
  }));
  document.addEventListener("click", e => {
    if (!e.target.matches(".chip button")) return;
    const value = e.target.dataset.value;
    [profile.prefs.liked, profile.prefs.disliked, profile.allergies].forEach(arr => {
      const i = arr.indexOf(value);
      if (i >= 0) arr.splice(i, 1);
    });
    saveProfile(profile); renderAll();
  });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    profile.data = { sex:data.sex, age:Number(data.age), weight:Number(data.weight), height:Number(data.height), activity:data.activity };
    saveProfile(profile); renderAll();
    document.getElementById("saveMsg").innerHTML = `<div class="alert alert-success mt-3">Профиль сохранён в этом браузере.</div>`;
  });
  document.getElementById("clearProfile").addEventListener("click", () => {
    if (confirm("Очистить профиль в этом браузере?")) { clearProfile(); location.reload(); }
  });
  renderAll();
});
