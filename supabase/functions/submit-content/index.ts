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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SITE_ORIGINS = (Deno.env.get("SITE_ORIGINS") || "https://dafi3134.github.io,http://localhost:8000,http://127.0.0.1:8000")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const SUBMISSION_REQUESTS_PER_HOUR = Math.max(
  1,
  Math.min(Number(Deno.env.get("SUBMISSION_REQUESTS_PER_HOUR") || 6), 50)
);

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

async function insertSubmission(submission: CleanSubmission) {
  const key = secretKey();
  if (!SUPABASE_URL || !key) throw new Error("Server database key is not configured");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(submission)
  });

  if (!response.ok) {
    console.error("Submission insert failed:", await response.text());
    throw new Error("Submission insert failed");
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
    await insertSubmission(submission);
    return jsonResponse({ ok: true }, 201, origin);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Не удалось сохранить заявку. Попробуй позже." }, 500, origin);
  }
});
