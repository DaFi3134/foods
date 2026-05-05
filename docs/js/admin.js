document.addEventListener("DOMContentLoaded", async () => {
  const setupNotice = document.getElementById("adminSetupNotice");
  const authBox = document.getElementById("adminAuth");
  const panel = document.getElementById("adminPanel");
  const loginForm = document.getElementById("adminLoginForm");
  const loginStatus = document.getElementById("adminLoginStatus");
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const statusFilter = document.getElementById("adminStatusFilter");
  const list = document.getElementById("adminList");

  if (window.SUPABASE_CONFIG?.adminEmail && !/your-email@example\.com/i.test(window.SUPABASE_CONFIG.adminEmail)) {
    emailInput.value = window.SUPABASE_CONFIG.adminEmail;
  }

  function setLoginStatus(kind, message) {
    loginStatus.className = `submission-status ${kind}`;
    loginStatus.textContent = message || "";
  }

  function typeLabel(type) {
    return ({ product: "Продукт", recipe: "Рецепт", article: "Статья", myth: "Миф" })[type] || type;
  }

  function statusLabel(status) {
    return ({ pending: "Ожидает", approved: "Одобрено", rejected: "Отклонено" })[status] || status;
  }

  function statusClass(status) {
    return ({ pending: "warning", approved: "success", rejected: "danger" })[status] || "secondary";
  }

  function fieldsTable(fields) {
    const entries = Object.entries(fields || {});
    if (!entries.length) return `<p class="small-muted mb-0">Поля заявки пустые.</p>`;
    return `<div class="admin-fields-table">${entries.map(([key, value]) => `
      <div class="admin-field-row">
        <strong>${escapeHtml(key)}</strong>
        <span>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</span>
      </div>`).join("")}</div>`;
  }

  function renderEmpty() {
    list.innerHTML = `<div class="empty-state">Заявок с таким статусом пока нет.</div>`;
  }

  function renderRows(rows) {
    if (!rows.length) {
      renderEmpty();
      return;
    }

    list.innerHTML = rows.map(row => {
      const fields = window.CFContent.fieldsFromPayload(row.payload);
      const created = row.created_at ? new Date(row.created_at).toLocaleString("ru-RU") : "";
      const json = escapeHtml(JSON.stringify(fields, null, 2));
      return `<article class="admin-submission-card soft-shadow" data-id="${escapeHtml(row.id)}">
        <div class="admin-submission-top">
          <div>
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <span class="badge text-bg-${statusClass(row.status)}">${statusLabel(row.status)}</span>
              <span class="badge bg-light text-dark border">${escapeHtml(typeLabel(row.type))}</span>
              <span class="small-muted">${escapeHtml(created)}</span>
            </div>
            <h3>${escapeHtml(row.title)}</h3>
          </div>
          <div class="admin-actions">
            <button class="btn btn-sm btn-success" data-action="approve" ${row.status === "approved" ? "disabled" : ""}><i class="bi bi-check-lg"></i> Одобрить</button>
            <button class="btn btn-sm btn-outline-danger" data-action="reject" ${row.status === "rejected" ? "disabled" : ""}><i class="bi bi-x-lg"></i> Отклонить</button>
          </div>
        </div>

        ${fieldsTable(fields)}

        <details class="admin-edit-box mt-3">
          <summary>Редактировать данные перед публикацией</summary>
          <textarea class="form-control admin-json-editor mt-3" rows="10">${json}</textarea>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button class="btn btn-sm btn-primary" data-action="save"><i class="bi bi-save"></i> Сохранить правки</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="copy"><i class="bi bi-clipboard"></i> Скопировать JSON</button>
          </div>
          <div class="admin-card-status submission-status mt-2"></div>
        </details>
      </article>`;
    }).join("");
  }

  async function loadRows() {
    list.innerHTML = `<div class="empty-state"><span class="spinner-border spinner-border-sm me-2"></span>Загружаем заявки...</div>`;
    try {
      const rows = await window.CFContent.listSubmissions(statusFilter.value);
      renderRows(rows);
    } catch (error) {
      list.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Не удалось загрузить заявки.")}</div>`;
    }
  }

  function setCardStatus(card, kind, message) {
    const box = card.querySelector(".admin-card-status");
    if (!box) return;
    box.className = `admin-card-status submission-status ${kind} mt-2`;
    box.textContent = message;
  }

  async function updateStatus(card, status) {
    const id = card.dataset.id;
    try {
      await window.CFContent.updateSubmission(id, { status });
      await loadRows();
    } catch (error) {
      setCardStatus(card, "error", error.message || "Не удалось изменить статус.");
    }
  }

  async function saveEdits(card) {
    const id = card.dataset.id;
    const textarea = card.querySelector(".admin-json-editor");
    try {
      const fields = JSON.parse(textarea.value);
      const currentType = card.querySelector(".badge.bg-light")?.textContent || "article";
      const type = window.CFContent.normalizeType(currentType);
      const title = window.CFContent.titleFromFields(type, fields);
      await window.CFContent.updateSubmission(id, { payload: { fields, edited_at: new Date().toISOString() }, title });
      setCardStatus(card, "success", "Правки сохранены.");
      await loadRows();
    } catch (error) {
      setCardStatus(card, "error", error.message || "JSON заполнен некорректно.");
    }
  }

  async function copyJson(card) {
    const textarea = card.querySelector(".admin-json-editor");
    try {
      await navigator.clipboard.writeText(textarea.value);
      setCardStatus(card, "success", "JSON скопирован.");
    } catch (error) {
      setCardStatus(card, "warning", "Не удалось скопировать автоматически. Выдели текст вручную.");
    }
  }

  async function updateUiForSession() {
    if (!window.CFContent || !window.CFContent.isConfigured()) {
      setupNotice.classList.remove("d-none");
      authBox.classList.remove("d-none");
      panel.classList.add("d-none");
      return;
    }

    setupNotice.classList.add("d-none");
    const session = await window.CFContent.getSession();
    if (session) {
      authBox.classList.add("d-none");
      panel.classList.remove("d-none");
      await loadRows();
    } else {
      authBox.classList.remove("d-none");
      panel.classList.add("d-none");
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("info", "Входим...");
    try {
      await window.CFContent.signIn(emailInput.value.trim(), passwordInput.value);
      passwordInput.value = "";
      setLoginStatus("success", "Вход выполнен.");
      await updateUiForSession();
    } catch (error) {
      setLoginStatus("error", error.message || "Не удалось войти.");
    }
  });

  document.getElementById("adminRefresh").addEventListener("click", loadRows);
  statusFilter.addEventListener("change", loadRows);
  document.getElementById("adminSignOut").addEventListener("click", async () => {
    await window.CFContent.signOut();
    await updateUiForSession();
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = event.target.closest(".admin-submission-card");
    const action = button.dataset.action;
    if (action === "approve") await updateStatus(card, "approved");
    if (action === "reject") await updateStatus(card, "rejected");
    if (action === "save") await saveEdits(card);
    if (action === "copy") await copyJson(card);
  });

  await updateUiForSession();
});
