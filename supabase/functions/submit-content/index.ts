type SubmissionRequest = {
  submission?: unknown;
};

type CleanSubmission = {
  type: "product" | "recipe" | "article" | "myth";
  title: string;
  author_name: string | null;
  author_contact: string | null;
  moderator_note: string | null;
  payload: {
    fields: Record<string, string | string[]>;
    source_page: string;
    submitted_at: string;
  };
  status: "pending";
};

type InsertedSubmission = {
  id: string;
  created_at?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SITE_ORIGINS = (Deno.env.get("SITE_ORIGINS") || "https://dafi3134.github.io,http://localhost:8000,http://127.0.0.1:8000")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const SUBMISSION_REQUESTS_PER_HOUR = Math.max(
  1,
  Math.min(Number(Deno.env.get("SUBMISSION_REQUESTS_PER_HOUR") || 6), 50)
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUBMISSION_FROM_EMAIL = Deno.env.get("SUBMISSION_FROM_EMAIL") || "";
const SUBMISSION_SITE_URL = (Deno.env.get("SUBMISSION_SITE_URL") || "https://dafi3134.github.io/foods").replace(/\/$/, "");
const SUBMISSION_NOTIFY_EMAILS = [...new Set([
  Deno.env.get("SUBMISSION_NOTIFY_EMAILS") || "",
  Deno.env.get("SUBMISSION_NOTIFY_EMAIL") || ""
]
  .flatMap(value => value.split(/[;,]/))
  .map(value => value.trim())
  .filter(Boolean))];

function corsHeaders(origin: string) {
  const allowedOrigin = SITE_ORIGINS.includes(origin) ? origin : SITE_ORIGINS[0] || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(body: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin)
    }
  });
}

function originAllowed(origin: string) {
  if (!origin) return true;
  return SITE_ORIGINS.includes(origin);
}

function envKeyMap(name: string): string[] {
  try {
    const raw = Deno.env.get(name);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    return Object.values(parsed).filter((value): value is string => typeof value === "string" && Boolean(value));
  } catch (_) {
    return [];
  }
}

function publishableKeys() {
  return [...new Set([
    ...envKeyMap("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || ""
  ].filter(Boolean))];
}

function secretKey() {
  const mapped = envKeyMap("SUPABASE_SECRET_KEYS");
  return mapped[0]
    || Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
}

function requestApiKey(req: Request) {
  const explicit = req.headers.get("apikey") || "";
  if (explicit) return explicit;
  const authorization = req.headers.get("authorization") || "";
  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function hasValidPublishableKey(req: Request) {
  const provided = requestApiKey(req);
  return Boolean(provided) && publishableKeys().includes(provided);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanMultilineText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function cleanFieldValue(value: unknown): string | string[] | null {
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 10)
      .map(item => cleanMultilineText(item, 2000))
      .filter(Boolean);
    return items.length ? items : null;
  }
  const text = cleanMultilineText(value, 5000);
  return text || null;
}

function cleanFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | string[]> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    const key = cleanText(rawKey, 100);
    const fieldValue = cleanFieldValue(rawValue);
    if (key && fieldValue !== null) result[key] = fieldValue;
  }
  return result;
}

function normalizedFieldKey(value: string) {
  return cleanText(value, 100).toLowerCase().replaceAll("ё", "е");
}

const CONTACT_FIELD_KEYS = new Set(["контакт", "контакт для связи", "email", "e mail", "телефон", "telegram"]);
const MODERATOR_FIELD_KEYS = new Set(["комментарий", "комментарий модератору"]);

function firstPrivateValue(fields: Record<string, string | string[]>, keys: Set<string>, maxLength: number) {
  for (const [key, value] of Object.entries(fields)) {
    if (!keys.has(normalizedFieldKey(key))) continue;
    const text = Array.isArray(value) ? value.join(", ") : value;
    const cleaned = cleanMultilineText(text, maxLength);
    if (cleaned) return cleaned;
  }
  return null;
}

function firstFieldValue(fields: Record<string, string | string[]>, names: string[], maxLength = 5000) {
  const wanted = new Set(names.map(normalizedFieldKey));
  for (const [key, value] of Object.entries(fields)) {
    if (!wanted.has(normalizedFieldKey(key))) continue;
    const text = Array.isArray(value) ? value.join(", ") : value;
    const cleaned = cleanMultilineText(text, maxLength);
    if (cleaned) return cleaned;
  }
  return "";
}

function hasRequiredSubmissionFields(type: CleanSubmission["type"], fields: Record<string, string | string[]>) {
  if (type === "product") {
    return firstFieldValue(fields, ["Название продукта", "Название", "name"], 180).length >= 2
      && Boolean(firstFieldValue(fields, ["Ккал на 100 г", "Калорийность", "calories"], 80));
  }
  if (type === "recipe") {
    return firstFieldValue(fields, ["Название рецепта", "Название блюда", "Название", "name"], 180).length >= 2
      && firstFieldValue(fields, ["Ингредиенты", "ingredients"], 5000).length >= 5
      && firstFieldValue(fields, ["Приготовление", "instructions"], 5000).length >= 5;
  }
  return firstFieldValue(fields, ["Заголовок", "Название", "title"], 180).length >= 2
    && firstFieldValue(fields, ["Короткая суть", "summary"], 3000).length >= 5
    && firstFieldValue(fields, ["Полный текст", "content"], 5000).length >= 10;
}

function publicFieldsOnly(fields: Record<string, string | string[]>) {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => {
    const normalized = normalizedFieldKey(key);
    return !CONTACT_FIELD_KEYS.has(normalized) && !MODERATOR_FIELD_KEYS.has(normalized);
  }));
}

function normalizeType(value: unknown): CleanSubmission["type"] | null {
  const type = cleanText(value, 20).toLowerCase();
  if (["product", "recipe", "article", "myth"].includes(type)) {
    return type as CleanSubmission["type"];
  }
  return null;
}

function typeLabel(type: CleanSubmission["type"]) {
  return ({
    product: "продукт",
    recipe: "рецепт",
    article: "статью",
    myth: "миф"
  } as const)[type];
}

function looksLikeEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function fieldValueText(value: string | string[]) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function cleanSourcePage(value: unknown) {
  const page = cleanText(value, 240);
  if (!page) return "";
  if (/^[a-z0-9_./?=&%-]+$/i.test(page) && !page.includes("..")) return page;
  return "";
}

function sanitizeSubmission(raw: unknown): CleanSubmission | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const type = normalizeType(input.type);
  const title = cleanText(input.title, 180);
  if (!type || title.length < 2) return null;

  const rawPayload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown>
    : {};
  const allFields = cleanFields(rawPayload.fields);
  if (!hasRequiredSubmissionFields(type, allFields)) return null;
  const authorContact = firstPrivateValue(allFields, CONTACT_FIELD_KEYS, 180);
  const moderatorNote = firstPrivateValue(allFields, MODERATOR_FIELD_KEYS, 2000);
  const fields = publicFieldsOnly(allFields);
  if (!Object.keys(fields).length) return null;

  const explicitAuthor = cleanText(input.author_name, 120);
  const authorFromFields = typeof fields["Автор"] === "string" ? cleanText(fields["Автор"], 120) : "";

  const submission: CleanSubmission = {
    type,
    title,
    author_name: explicitAuthor || authorFromFields || null,
    author_contact: authorContact,
    moderator_note: moderatorNote,
    payload: {
      fields,
      source_page: cleanSourcePage(rawPayload.source_page || rawPayload.page),
      submitted_at: new Date().toISOString()
    },
    status: "pending"
  };

  if (JSON.stringify(submission).length > 32000) return null;
  return submission;
}

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeQuota(req: Request) {
  const key = secretKey();
  if (!SUPABASE_URL || !key) throw new Error("Server database key is not configured");
  const salt = Deno.env.get("RATE_LIMIT_SALT") || key;
  const keyHash = await sha256(`${salt}:submission:${clientIp(req)}`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key
    },
    body: JSON.stringify({
      p_key_hash: keyHash,
      p_limit: SUBMISSION_REQUESTS_PER_HOUR,
      p_window_seconds: 3600
    })
  });

  if (!response.ok) {
    console.error("Submission rate limit RPC failed:", await response.text());
    throw new Error("Rate limit database check failed");
  }
  return (await response.json()) === true;
}

async function insertSubmission(submission: CleanSubmission): Promise<InsertedSubmission> {
  const key = secretKey();
  if (!SUPABASE_URL || !key) throw new Error("Server database key is not configured");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/submissions?select=id,created_at`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(submission)
  });

  if (!response.ok) {
    console.error("Submission insert failed:", await response.text());
    throw new Error("Submission insert failed");
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("Submission insert returned no id");
  return { id: String(row.id), created_at: row.created_at ? String(row.created_at) : undefined };
}

function notificationConfigured() {
  return Boolean(RESEND_API_KEY && SUBMISSION_FROM_EMAIL && SUBMISSION_NOTIFY_EMAILS.length);
}

function buildNotificationText(submission: CleanSubmission, inserted: InsertedSubmission) {
  const lines = [
    `Новая заявка: ${typeLabel(submission.type)}`,
    `ID: ${inserted.id}`,
    `Заголовок: ${submission.title}`,
    `Автор: ${submission.author_name || "не указан"}`,
    `Контакт: ${submission.author_contact || "не указан"}`,
    `Страница: ${submission.payload.source_page || "не указана"}`,
    "",
    "Поля заявки:"
  ];

  for (const [key, value] of Object.entries(submission.payload.fields)) {
    lines.push(`${key}: ${fieldValueText(value)}`);
  }
  if (submission.moderator_note) {
    lines.push("", `Комментарий модератору: ${submission.moderator_note}`);
  }
  lines.push("", `Открыть панель модерации: ${SUBMISSION_SITE_URL}/owner-panel.html`);
  return lines.join("\n");
}

function buildNotificationHtml(submission: CleanSubmission, inserted: InsertedSubmission) {
  const fields = Object.entries(submission.payload.fields)
    .map(([key, value]) => `<tr><td style="padding:6px 10px;border:1px solid #ddd"><strong>${escapeHtml(key)}</strong></td><td style="padding:6px 10px;border:1px solid #ddd;white-space:pre-wrap">${escapeHtml(fieldValueText(value))}</td></tr>`)
    .join("");
  const moderatorNote = submission.moderator_note
    ? `<h3>Комментарий модератору</h3><p style="white-space:pre-wrap">${escapeHtml(submission.moderator_note)}</p>`
    : "";
  const contact = submission.author_contact || "не указан";

  return `<!doctype html>
<html lang="ru"><body style="font-family:Arial,sans-serif;color:#222;line-height:1.45">
  <h2>Новая заявка: ${escapeHtml(typeLabel(submission.type))}</h2>
  <p><strong>ID:</strong> ${escapeHtml(inserted.id)}<br>
     <strong>Заголовок:</strong> ${escapeHtml(submission.title)}<br>
     <strong>Автор:</strong> ${escapeHtml(submission.author_name || "не указан")}<br>
     <strong>Контакт:</strong> ${escapeHtml(contact)}<br>
     <strong>Страница:</strong> ${escapeHtml(submission.payload.source_page || "не указана")}</p>
  <h3>Данные заявки</h3>
  <table style="border-collapse:collapse;width:100%;max-width:900px">${fields}</table>
  ${moderatorNote}
  <p style="margin-top:22px"><a href="${escapeHtml(`${SUBMISSION_SITE_URL}/owner-panel.html`)}">Открыть панель модерации</a></p>
</body></html>`;
}

async function sendSubmissionNotification(submission: CleanSubmission, inserted: InsertedSubmission) {
  if (!notificationConfigured()) {
    console.warn("Submission email notification is not configured. Set RESEND_API_KEY, SUBMISSION_FROM_EMAIL and SUBMISSION_NOTIFY_EMAIL(S).");
    return { configured: false, sent: false };
  }

  const body: Record<string, unknown> = {
    from: SUBMISSION_FROM_EMAIL,
    to: SUBMISSION_NOTIFY_EMAILS,
    subject: `[healthy food] Новая заявка: ${submission.title}`.slice(0, 200),
    text: buildNotificationText(submission, inserted),
    html: buildNotificationHtml(submission, inserted)
  };
  if (looksLikeEmail(submission.author_contact)) body.reply_to = submission.author_contact;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `submission-${inserted.id}`.slice(0, 256)
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error("Submission email failed:", response.status, await response.text());
      return { configured: true, sent: false };
    }
    return { configured: true, sent: true };
  } catch (error) {
    console.error("Submission email request failed:", error);
    return { configured: true, sent: false };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (req.method === "OPTIONS") {
    if (!originAllowed(origin)) return jsonResponse({ error: "Origin is not allowed" }, 403, origin);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);
  if (!originAllowed(origin)) return jsonResponse({ error: "Origin is not allowed" }, 403, origin);
  if (!hasValidPublishableKey(req)) return jsonResponse({ error: "Invalid Supabase publishable key" }, 401, origin);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 48000) return jsonResponse({ error: "Заявка слишком большая." }, 413, origin);

  let body: SubmissionRequest;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Некорректный JSON." }, 400, origin);
  }

  const submission = sanitizeSubmission(body.submission);
  if (!submission) {
    return jsonResponse({ error: "Проверь обязательные поля: заявка содержит некорректные или слишком большие данные." }, 400, origin);
  }

  try {
    const allowed = await consumeQuota(req);
    if (!allowed) {
      return jsonResponse({
        error: `Слишком много заявок. Для защиты от спама разрешено ${SUBMISSION_REQUESTS_PER_HOUR} отправок в час.`
      }, 429, origin);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Серверная защита заявок не настроена. Выполни docs/supabase-schema.sql." }, 503, origin);
  }

  try {
    const inserted = await insertSubmission(submission);
    const notification = await sendSubmissionNotification(submission, inserted);
    return jsonResponse({
      ok: true,
      submission_id: inserted.id,
      notification_sent: notification.sent,
      notification_configured: notification.configured
    }, 201, origin);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Не удалось сохранить заявку. Попробуй позже." }, 500, origin);
  }
});
