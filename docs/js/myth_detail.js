
document.addEventListener("DOMContentLoaded", async () => {
  const myths = await loadJson(DATA_PATHS.myths);
  const id = getQueryParam("id");
  const article = myths.find(a => String(a.id) === String(id)) || myths[0];
  const box = document.getElementById("mythDetail");
  if (!article) {
    box.innerHTML = `<div class="empty-state">Статья не найдена. <a href="myths.html">Вернуться к мифам</a></div>`;
    return;
  }
  box.innerHTML = `<a href="myths.html" class="small">← Назад к мифам</a>
    <article class="card p-4 soft-shadow mt-2">
      <img class="rounded-4 mb-4" style="max-height:360px;object-fit:cover;width:100%" src="${escapeHtml(article.img || "img/myth1.jpg")}" alt="${escapeHtml(article.title)}">
      <h1 class="page-title">${escapeHtml(article.title)}</h1>
      <p class="small-muted">${escapeHtml(article.author_name || "Автор")} · ${escapeHtml(article.created_at || "")}</p>
      <p class="fs-5" style="white-space:pre-wrap">${escapeHtml(article.content)}</p>
    </article>`;
});
