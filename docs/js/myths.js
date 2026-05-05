
document.addEventListener("DOMContentLoaded", async () => {
  let myths = [];
  const list = document.getElementById("mythsList");

  function render() {
    list.innerHTML = myths.length ? myths.map(a => `<div class="col-md-6"><div class="card article-card soft-shadow h-100 p-3">
      <img src="${escapeHtml(a.img || "img/myth1.jpg")}" alt="${escapeHtml(a.title)}">
      <div class="card-body px-0 pb-0">
        <h5>${escapeHtml(a.title)}</h5>
        <p class="small-muted">${escapeHtml(a.author_name || "Автор")} · ${escapeHtml(a.created_at || "")}</p>
        <p>${escapeHtml(String(a.content || "").slice(0, 160))}${String(a.content || "").length > 160 ? "…" : ""}</p>
        <a href="myth_detail.html?id=${encodeURIComponent(a.id)}" class="btn btn-sm btn-outline-primary">Читать</a>
      </div>
    </div></div>`).join("") : `<div class="empty-state">Пока нет одобренных статей.</div>`;
  }

  try {
    myths = await loadJson(DATA_PATHS.myths);
    render();
  } catch (error) {
    list.innerHTML = `<div class="empty-state">Не удалось загрузить локальные статьи. Проверь файл data/myths.json.</div>`;
    console.error(error);
    return;
  }

  if (!window.CFContent || !window.CFContent.isConfigured()) return;

  try {
    myths = await window.CFContent.loadMyths();
    render();
  } catch (error) {
    console.warn("Supabase-статьи не догрузились, показываем локальные статьи:", error);
  }
});
