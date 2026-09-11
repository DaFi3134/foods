document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const setupNotice = document.getElementById("adminSetupNotice");
  const authBox = document.getElementById("adminAuth");
  const panel = document.getElementById("adminPanel");
  const loginForm = document.getElementById("adminLoginForm");
  const loginStatus = document.getElementById("adminLoginStatus");
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const statusFilter = document.getElementById("adminStatusFilter");
  const list = document.getElementById("adminList");
  const refreshButton = document.getElementById("adminRefresh");
  const signOutButton = document.getElementById("adminSignOut");

  if (!loginForm || !list) return;

  function setLoginStatus(kind, message) {
    loginStatus.className = `submission-status ${kind || ""}`.trim();
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
    if (!entries.length) return '<p class="small-muted mb-0">Поля заявки пустые.</p>';
    return `<div class="admin-fields-table">${entries.map(([key, value]) => `
      <div class="admin-field-row">
        <strong>${escapeHtml(key)}</strong>
        <span>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</span>
      </div>`).join("")}</div>`;
  }

  function renderRows(rows) {
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Заявок с таким статусом пока нет.</div>';
      return;
    }

    list.innerHTML = rows.map(row => {
      const type = window.CFContent.normalizeType(row.type);
      const fields = window.CFContent.fieldsFromPayload(row.payload);
      const created = row.created_at ? new Date(row.created_at).toLocaleString("ru-RU") : "";
      const json = escapeHtml(JSON.stringify(fields, null, 2));
      const author = row.author_name ? `Автор: ${row.author_name}` : "";
      const contact = row.author_contact || row.author_email || "";

      return `
        <article class="admin-submission-card soft-shadow" data-id="${escapeHtml(row.id)}" data-type="${escapeHtml(type)}">
          <div class="admin-submission-top">
            <div>
              <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                <span class="badge text-bg-${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
                <span class="badge bg-light text-dark border">${escapeHtml(typeLabel(type))}</span>
                <span class="small-muted">${escapeHtml(created)}</span>
              </div>
              <h3>${escapeHtml(row.title)}</h3>
              ${author ? `<div class="small text-muted">${escapeHtml(author)}</div>` : ""}
              ${contact ? `<div class="small text-muted">Контакт: ${escapeHtml(contact)}</div>` : ""}
            </div>
            <div class="admin-actions">
              <button class="btn btn-sm btn-success" data-action="approve" ${row.status === "approved" ? "disabled" : ""}><i class="bi bi-check-lg"></i> Одобрить</button>
              <button class="btn btn-sm btn-outline-danger" data-action="reject" ${row.status === "rejected" ? "disabled" : ""}><i class="bi bi-x-lg"></i> Отклонить</button>
              <button class="btn btn-sm btn-outline-secondary" data-action="delete"><i class="bi bi-trash"></i></button>
            </div>
          </div>

          ${fieldsTable(fields)}
          <div class="admin-card-status submission-status mt-2" aria-live="polite"></div>

          <details class="admin-edit-box mt-3">
            <summary>Редактировать данные перед публикацией</summary>
            <textarea class="form-control admin-json-editor mt-3" rows="10" spellcheck="false">${json}</textarea>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <button class="btn btn-sm btn-primary" data-action="save"><i class="bi bi-save"></i> Сохранить правки</button>
              <button class="btn btn-sm btn-outline-secondary" data-action="copy"><i class="bi bi-clipboard"></i> Скопировать JSON</button>
            </div>
          </details>
        </article>`;
    }).join("");
  }

  async function loadRows() {
    list.innerHTML = '<div class="empty-state"><span class="spinner-border spinner-border-sm me-2"></span>Загружаем заявки...</div>';
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
    box.textContent = message || "";
  }

  function setCardButtonsDisabled(card, disabled) {
    card.querySelectorAll("button[data-action]").forEach(button => { button.disabled = disabled; });
  }

  async function updateStatus(card, status) {
    setCardButtonsDisabled(card, true);
    setCardStatus(card, "info", status === "approved" ? "Одобряем..." : "Отклоняем...");
    try {
      await window.CFContent.updateSubmission(card.dataset.id, { status });
      await loadRows();
    } catch (error) {
      setCardStatus(card, "error", error.message || "Не удалось изменить статус.");
      setCardButtonsDisabled(card, false);
    }
  }

  async function saveEdits(card) {
    const textarea = card.querySelector(".admin-json-editor");
    try {
      const fields = JSON.parse(textarea.value);
      if (!fields || Array.isArray(fields) || typeof fields !== "object") throw new Error("JSON должен быть объектом.");
      const type = card.dataset.type || "article";
      const title = window.CFContent.titleFromFields(type, fields);
      await window.CFContent.updateSubmission(card.dataset.id, {
        payload: { fields, edited_at: new Date().toISOString() },
        title
      });
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
    } catch (_) {
      textarea.focus();
      textarea.select();
      setCardStatus(card, "warning", "Автокопирование недоступно — текст выделен.");
    }
  }

  async function deleteRow(card) {
    if (!confirm("Удалить эту заявку без возможности восстановления?")) return;
    setCardButtonsDisabled(card, true);
    try {
      await window.CFContent.deleteSubmission(card.dataset.id);
      await loadRows();
    } catch (error) {
      setCardStatus(card, "error", error.message || "Не удалось удалить заявку.");
      setCardButtonsDisabled(card, false);
    }
  }

  async function updateUiForSession() {
    if (!window.CFContent?.isConfigured()) {
      setupNotice?.classList.remove("d-none");
      authBox?.classList.remove("d-none");
      panel?.classList.add("d-none");
      return;
    }

    setupNotice?.classList.add("d-none");
    const session = await window.CFContent.getSession();
    if (!session) {
      panel?.classList.add("d-none");
      authBox?.classList.remove("d-none");
      return;
    }

    const admin = await window.CFContent.isAdmin();
    if (admin) {
      authBox?.classList.add("d-none");
      panel?.classList.remove("d-none");
      setLoginStatus("", "");
      await loadRows();
      return;
    }

    await window.CFContent.signOut();
    panel?.classList.add("d-none");
    authBox?.classList.remove("d-none");
    setLoginStatus("error", "Аккаунт существует, но у него нет прав владельца сайта.");
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    setLoginStatus("info", "Входим...");
    try {
      await window.CFContent.signIn(emailInput.value.trim(), passwordInput.value);
      passwordInput.value = "";
      await updateUiForSession();
    } catch (error) {
      setLoginStatus("error", error.message || "Не удалось войти.");
    }
  });

  refreshButton?.addEventListener("click", loadRows);
  statusFilter?.addEventListener("change", loadRows);
  signOutButton?.addEventListener("click", async () => {
    await window.CFContent.signOut();
    await updateUiForSession();
  });

  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest(".admin-submission-card");
    if (!button || !card) return;

    const action = button.dataset.action;
    if (action === "approve") await updateStatus(card, "approved");
    if (action === "reject") await updateStatus(card, "rejected");
    if (action === "save") await saveEdits(card);
    if (action === "copy") await copyJson(card);
    if (action === "delete") await deleteRow(card);
  });

  await updateUiForSession();
});
