
document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("site-header");
  const current = window.location.pathname.split("/").pop() || "index.html";
  if (header) {
    const nav = [
      ["index.html", "Главная"],
      ["library.html", "Библиотека"],
      ["myths.html", "Мифы"],
      ["calc.html", "Калькулятор"],
      ["check_intake.html", "Проверка рациона"],
      ["planner.html", "Планировщик"],
      ["products.html", "Продукты"]
    ];
    header.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
        <div class="container">
          <a class="navbar-brand d-flex align-items-center" href="index.html">
            <div class="logo-circle me-2"><i class="bi bi-person-fill"></i></div>
            <div>
              <div class="fw-bold">healthy food</div>
              <div class="small text-muted">Твой гид к здоровью и энергии</div>
            </div>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav"><span class="navbar-toggler-icon"></span></button>
          <div class="collapse navbar-collapse" id="mainNav">
            <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
              ${nav.map(([href, text]) => `<li class="nav-item"><a class="nav-link ${current === href ? "active" : ""}" href="${href}">${text}</a></li>`).join("")}
            </ul>
            <a class="btn btn-outline-primary btn-sm ms-lg-3" href="profile.html" id="profileBtn">Профиль</a>
          </div>
        </div>
      </nav>`;
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = `
      <footer class="bg-white border-top py-3 mt-5">
        <div class="container d-flex flex-wrap justify-content-between gap-2 small text-muted">
          <div>© healthy food — Питание для яркой жизни</div>
          <div><a href="guide.html">Гид</a> · <a href="submit_recipe.html">Добавить рецепт</a> · <a href="submit_myth.html">Добавить миф</a></div>
        </div>
      </footer>`;
  }

  const profileBtn = document.getElementById("profileBtn");
  function updateProfileButton() {
    if (!profileBtn) return;
    const data = getProfile().data || {};
    profileBtn.textContent = data.weight ? `Профиль · ${data.weight} кг` : "Создать профиль";
  }
  updateProfileButton();
  window.addEventListener("profile:updated", updateProfileButton);
});
