document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("site-header");
  let current = window.location.pathname.split("/").pop();
  if (current === "") current = "index.html";

  function hasSavedProfile() {
    return Boolean(localStorage.getItem("cf_profile"));
  }

  function profileMenuHtml() {
    if (!hasSavedProfile()) {
      return `<a class="btn btn-outline-primary btn-sm ms-lg-3" href="profile.html" id="profileCreateBtn">Создать профиль</a>`;
    }

    const profile = getProfile();
    const data = profile.data || {};
    const avatarText = data.weight ? `${escapeHtml(data.weight)}` : `<i class="bi bi-person-fill"></i>`;
    const subtitle = data.weight ? `${escapeHtml(data.weight)} кг · ${escapeHtml(data.height || "—")} см` : "Персонализация";

    return `
      <div class="dropdown ms-lg-3 profile-dropdown">
        <a class="d-flex align-items-center text-decoration-none profile-menu-link"
         href="profile.html"   <!-- вместо href="#" -->
         id="profileMenu">
        <div class="avatar-circle me-2">${avatarText}</div>
        <div class="d-none d-md-block text-start">
          <div class="fw-semibold text-dark">Профиль</div>
          <div class="small text-muted">${subtitle}</div>
        </div>
      </a>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm" aria-labelledby="profileMenu">
          <li><a class="dropdown-item" href="profile.html#data">Мои данные</a></li>
          <li><button class="dropdown-item text-danger" type="button" id="clearProfileFromMenu">Очистить профиль</button></li>
        </ul>
      </div>`;
  }

  function renderHeader() {
    if (!header) return;
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
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Открыть меню">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="mainNav">
            <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
              ${nav.map(([href, text]) => `<li class="nav-item"><a class="nav-link ${current === href ? "active" : ""}" href="${href}">${text}</a></li>`).join("")}
            </ul>
            ${profileMenuHtml()}
          </div>
        </div>
      </nav>`;

    const clearBtn = document.getElementById("clearProfileFromMenu");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (confirm("Очистить сохранённый профиль?")) {
          clearProfile();
          renderHeader();
        }
      });
    }
  }

  renderHeader();

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = `
      <footer class="bg-white border-top py-3 mt-5">
        <div class="container d-flex flex-wrap justify-content-between gap-2 small text-muted">
          <div>© healthy food — Питание для яркой жизни</div>
          <div><a href="guide.html">Гид</a> · <a href="submit_recipe.html">Добавить рецепт</a> · <a href="submit_product.html">Добавить продукт</a> · <a href="submit_myth.html">Добавить миф/статью</a></div>
        </div>
      </footer>`;
  }

  window.addEventListener("profile:updated", renderHeader);
});
