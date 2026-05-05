(function () {
  function getConfig() {
    return window.SUBMISSION_CONFIG || {};
  }

  function getSubmissionType(form) {
    return form.dataset.submissionType || form.querySelector('[name="Тип заявки"]')?.value || "Заявка";
  }

  function collectFields(form) {
    const data = new FormData(form);
    const fields = {};

    for (const [name, value] of data.entries()) {
      if (!name || name === "_gotcha" || name === "_subject") continue;
      const cleanValue = String(value || "").trim();
      if (!cleanValue) continue;

      if (fields[name]) {
        if (!Array.isArray(fields[name])) fields[name] = [fields[name]];
        fields[name].push(cleanValue);
      } else {
        fields[name] = cleanValue;
      }
    }

    return fields;
  }

  function formatFields(fields) {
    return Object.entries(fields)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\n");
  }

  function getStatusBox(form) {
    let box = form.querySelector(".submission-status");
    if (!box) {
      box = document.createElement("div");
      box.className = "submission-status";
      box.setAttribute("role", "status");
      const bottom = form.querySelector(".submit-bottom");
      form.insertBefore(box, bottom || null);
    }
    return box;
  }

  function setStatus(form, kind, message) {
    const box = getStatusBox(form);
    box.className = `submission-status ${kind}`;
    box.textContent = message;
  }

  function toggleSubmitting(form, isSubmitting) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = isSubmitting;
    button.innerHTML = isSubmitting
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Отправляем...'
      : button.dataset.originalHtml;
  }

  async function copyText(text) {
    if (!navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      return false;
    }
  }

  function showSetupNotice(form) {
    if ((window.CFContent && window.CFContent.isConfigured()) || form.querySelector(".submission-setup-notice")) return;

    const notice = document.createElement("div");
    notice.className = "submission-setup-notice";
    notice.innerHTML = `
      <div class="submission-setup-icon"><i class="bi bi-database-gear"></i></div>
      <div>
        <h5>Supabase нужно подключить один раз</h5>
        <p>
          Сейчас в <code>docs/js/submission-config.js</code> стоят тестовые значения.
          Вставь <code>Project URL</code> и <code>anon key</code> из Supabase, чтобы заявки сохранялись в базу.
        </p>
      </div>`;

    form.prepend(notice);
  }

  function buildSubmission(form) {
    const typeLabel = getSubmissionType(form);
    const type = window.CFContent ? window.CFContent.normalizeType(typeLabel) : "article";
    const fields = collectFields(form);
    const title = window.CFContent
      ? window.CFContent.titleFromFields(type, fields)
      : fields["Название продукта"] || fields["Название рецепта"] || fields["Заголовок"] || "Новая заявка";
    const submittedAt = new Date().toISOString();

    return {
      type,
      title,
      author_name: fields["Автор"] || fields["Контакт"] || null,
      author_email: null,
      status: "pending",
      payload: {
        fields,
        page: window.location.href,
        submitted_at: submittedAt,
        user_agent: navigator.userAgent
      }
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (form.querySelector('[name="_gotcha"]')?.value) return;

    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      form.reportValidity();
      return;
    }

    const submission = buildSubmission(form);
    const textSummary = [
      `Тип заявки: ${getSubmissionType(form)}`,
      `Заголовок: ${submission.title}`,
      `Страница: ${window.location.href}`,
      "",
      formatFields(submission.payload.fields)
    ].join("\n");

    if (!window.CFContent || !window.CFContent.isConfigured()) {
      const copied = await copyText(textSummary);
      setStatus(
        form,
        "warning",
        copied
          ? "Supabase пока не подключён. Текст заявки скопирован в буфер обмена."
          : "Supabase пока не подключён. Заполни docs/js/submission-config.js."
      );
      return;
    }

    toggleSubmitting(form, true);
    setStatus(form, "info", "Сохраняем заявку в базу на модерацию...");

    try {
      await window.CFContent.insertSubmission(submission);
      form.reset();
      const successUrl = `${getConfig().successPage || "thank_you.html"}?type=${encodeURIComponent(getSubmissionType(form))}`;
      window.location.href = successUrl;
    } catch (error) {
      setStatus(form, "error", error.message || "Не удалось отправить заявку. Попробуй позже.");
    } finally {
      toggleSubmitting(form, false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form.pretty-submit-form").forEach(form => {
      form.setAttribute("action", "#");
      form.addEventListener("submit", handleSubmit);
    });
  });
})();
