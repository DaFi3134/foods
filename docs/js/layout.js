document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  let current = window.location.pathname.split("/").pop() || "index.html";

  function profileMenuHtml() {
    if (!localStorage.getItem("cf_profile")) {
      return '<a class="btn btn-outline-primary btn-sm ms-lg-3" href="profile.html">Создать профиль</a>';
    }

    const profile = getProfile();
    const data = profile.data || {};
    const avatarText = data.weight ? escapeHtml(data.weight) : '<i class="bi bi-person-fill"></i>';
    const subtitle = data.weight
      ? `${escapeHtml(data.weight)} кг · ${escapeHtml(data.height || "—")} см`
      : "Персонализация";

    return `
      <a class="d-flex align-items-center text-decoration-none profile-menu-link ms-lg-3" href="profile.html" id="profileLink">
        <div class="avatar-circle me-2">${avatarText}</div>
        <div class="d-none d-md-block text-start">
          <div class="fw-semibold text-dark">Профиль</div>
          <div class="small text-muted">${subtitle}</div>
        </div>
      </a>`;
  }

  function navLink(href, text, icon = "") {
    const active = current === href ? " active" : "";
    const iconHtml = icon ? `<i class="bi ${icon} me-1"></i>` : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${href}">${iconHtml}${text}</a></li>`;
  }

  function renderHeader() {
    if (!header) return;

    const extraPages = ["check_intake.html", "products.html", "myths.html", "guide.html"];
    const extraActive = extraPages.includes(current) ? " active" : "";

    header.innerHTML = `
      <nav class="navbar navbar-expand-xl navbar-light bg-white shadow-sm">
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
            <ul class="navbar-nav ms-auto mb-2 mb-xl-0 align-items-xl-center">
              ${navLink("index.html", "Главная")}
              ${navLink("ai.html", "AI", "bi-stars")}
              ${navLink("library.html", "Библиотека")}
              ${navLink("planner.html", "Планировщик")}
              ${navLink("calc.html", "Калькулятор")}
              <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle${extraActive}" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Ещё</a>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li><a class="dropdown-item${current === "check_intake.html" ? " active" : ""}" href="check_intake.html">Проверка рациона</a></li>
                  <li><a class="dropdown-item${current === "products.html" ? " active" : ""}" href="products.html">Продукты</a></li>
                  <li><a class="dropdown-item${current === "myths.html" ? " active" : ""}" href="myths.html">Мифы и факты</a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item${current === "guide.html" ? " active" : ""}" href="guide.html">Инструкция</a></li>
                </ul>
              </li>
            </ul>
            ${profileMenuHtml()}
          </div>
        </div>
      </nav>`;
  }

  function renderFooter() {
    if (!footer) return;
    footer.innerHTML = `
      <footer class="bg-white border-top py-3 mt-5">
        <div class="container d-flex flex-wrap justify-content-between gap-2 small text-muted">
          <div>© healthy food — Питание для яркой жизни</div>
          <div>
            <a href="ai.html">AI-помощник</a> ·
            <a href="guide.html">Гид</a> ·
            <a href="library.html">Библиотека</a> ·
            <a href="products.html">Продукты</a>
          </div>
        </div>
      </footer>`;
  }

  renderHeader();
  renderFooter();
  window.addEventListener("profile:updated", renderHeader);
});
