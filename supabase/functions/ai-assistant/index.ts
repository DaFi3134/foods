type CandidateDish = {
  id: string;
  name: string;
  meal_types: string[];
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: Array<{ product: string; grams: number }>;
  tags: string[];
};

type AiRequest = {
  message?: unknown;
  targetCalories?: unknown;
  profile?: {
    liked?: unknown;
    disliked?: unknown;
    allergies?: unknown;
  };
  candidates?: unknown;
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SITE_ORIGINS = (Deno.env.get("SITE_ORIGINS") || "https://dafi3134.github.io,http://localhost:8000,http://127.0.0.1:8000")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const AI_REQUESTS_PER_HOUR = Math.max(1, Math.min(Number(Deno.env.get("AI_REQUESTS_PER_HOUR") || 12), 100));

function jsonResponse(body: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      "Cache-Control": "no-store"
    }
  });
}

function corsHeaders(origin: string) {
  const allowedOrigin = SITE_ORIGINS.includes(origin) ? origin : SITE_ORIGINS[0] || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
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
  const values = [
    ...envKeyMap("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || ""
  ].filter(Boolean);
  return [...new Set(values)];
}

function secretKey() {
  return envKeyMap("SUPABASE_SECRET_KEYS")[0]
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
  if (!provided) return false;
  return publishableKeys().includes(provided);
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeList(value: unknown, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => sanitizeText(item, 80))
    .filter(Boolean)
    .slice(0, limit);
}

function finiteNumber(value: unknown, fallback = 0, min = 0, max = 100000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function sanitizeCandidate(raw: unknown): CandidateDish | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = sanitizeText(item.id, 120);
  const name = sanitizeText(item.name, 160);
  const calories = finiteNumber(item.calories, 0, 0, 5000);
  if (!id || !name || calories <= 0) return null;

  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.slice(0, 20).map(value => {
        const ingredient = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          product: sanitizeText(ingredient.product, 100),
          grams: finiteNumber(ingredient.grams, 0, 0, 5000)
        };
      }).filter(value => value.product)
    : [];

  return {
    id,
    name,
    meal_types: sanitizeList(item.meal_types, 5),
    calories,
    protein: finiteNumber(item.protein, 0, 0, 500),
    fat: finiteNumber(item.fat, 0, 0, 500),
    carbs: finiteNumber(item.carbs, 0, 0, 1000),
    ingredients,
    tags: sanitizeList(item.tags, 10)
  };
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
  if (!SUPABASE_URL || !key) throw new Error("Server rate limit is not configured");

  const salt = Deno.env.get("RATE_LIMIT_SALT") || OPENAI_API_KEY;
  if (!salt) throw new Error("RATE_LIMIT_SALT is not configured");
  const keyHash = await sha256(`${salt}:ai:${clientIp(req)}`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key
    },
    body: JSON.stringify({
      p_key_hash: keyHash,
      p_limit: AI_REQUESTS_PER_HOUR,
      p_window_seconds: 3600
    })
  });

  if (!response.ok) {
    console.error("Rate limit RPC failed:", await response.text());
    throw new Error("Rate limit database check failed");
  }
  return (await response.json()) === true;
}

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const text = (contentItem as Record<string, unknown>).text;
      if (typeof text === "string" && text) return text;
    }
  }
  return "";
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    recommended_dish_ids: {
      type: "array",
      items: { type: "string" },
      maxItems: 5
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      maxItems: 5
    }
  },
  required: ["answer", "recommended_dish_ids", "warnings"]
};

const INSTRUCTIONS = `
Ты AI-помощник сайта healthy food. Отвечай по-русски, понятно и без лишней воды.

Твоя задача — помогать с общими вопросами о рационе и выбирать варианты ТОЛЬКО из переданного массива candidates.

Обязательные правила:
1. Аллергии и disliked — жёсткие ограничения. Никогда не советуй блюдо, которое им противоречит.
2. Если рекомендуешь конкретные блюда, указывай только id, реально присутствующие в candidates.
3. Не придумывай калории, БЖУ, ингредиенты или свойства блюда. Используй только переданные данные.
4. Не ставь диагнозы, не назначай лечение, лекарства или лечебные диеты.
5. Не поощряй экстремальное ограничение еды, голодание или опасное снижение калорийности.
6. Если вопрос требует врача/диетолога или связан с выраженными симптомами, скажи об ограничениях сервиса и предложи обратиться к специалисту.
7. Не проси лишние персональные данные.
8. Если вопрос не относится к питанию, здоровым бытовым привычкам или функциям сайта, вежливо верни разговор к теме сервиса.
9. liked — предпочтение, а не обязательное условие.
10. Ответ должен быть практичным: короткое объяснение, затем конкретные варианты, когда это уместно.
`;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (req.method === "OPTIONS") {
    if (!originAllowed(origin)) return jsonResponse({ error: "Origin is not allowed" }, 403, origin);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);
  if (!originAllowed(origin)) return jsonResponse({ error: "Origin is not allowed" }, 403, origin);
  if (!hasValidPublishableKey(req)) return jsonResponse({ error: "Invalid Supabase publishable key" }, 401, origin);
  if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 503, origin);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 160000) return jsonResponse({ error: "Request is too large" }, 413, origin);

  let body: AiRequest;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const message = sanitizeText(body.message, 2000);
  if (message.length < 3) return jsonResponse({ error: "Напиши вопрос чуть подробнее." }, 400, origin);

  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  const candidates = rawCandidates
    .slice(0, 50)
    .map(sanitizeCandidate)
    .filter((item): item is CandidateDish => Boolean(item));
  if (!candidates.length) return jsonResponse({ error: "Нет доступных блюд для рекомендаций." }, 400, origin);

  try {
    const allowed = await consumeQuota(req);
    if (!allowed) {
      return jsonResponse({
        error: `Лимит AI-запросов исчерпан. Для демо разрешено ${AI_REQUESTS_PER_HOUR} запросов в час с одного подключения.`
      }, 429, origin);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Защита лимита запросов не настроена. Выполни docs/supabase-schema.sql." }, 503, origin);
  }

  const context = {
    user_message: message,
    target_calories_per_day: finiteNumber(body.targetCalories, 2000, 1200, 6000),
    profile: {
      liked: sanitizeList(body.profile?.liked, 20),
      disliked: sanitizeList(body.profile?.disliked, 20),
      allergies: sanitizeList(body.profile?.allergies, 20)
    },
    candidates
  };

  let openAiResponse: Response;
  try {
    openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        instructions: INSTRUCTIONS,
        input: JSON.stringify(context),
        max_output_tokens: 1000,
        text: {
          format: {
            type: "json_schema",
            name: "healthy_food_ai_response",
            strict: true,
            schema: RESPONSE_SCHEMA
          }
        }
      })
    });
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return jsonResponse({ error: "Не удалось связаться с AI-сервисом." }, 502, origin);
  }

  if (!openAiResponse.ok) {
    const details = await openAiResponse.text();
    console.error("OpenAI API error:", openAiResponse.status, details.slice(0, 1200));
    return jsonResponse({ error: "AI-сервис временно вернул ошибку." }, 502, origin);
  }

  const raw = await openAiResponse.json() as Record<string, unknown>;
  const text = outputText(raw);
  if (!text) return jsonResponse({ error: "AI вернул пустой ответ." }, 502, origin);

  let parsed: { answer?: unknown; recommended_dish_ids?: unknown; warnings?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.error("Structured output parse failed:", error, text.slice(0, 800));
    return jsonResponse({ error: "Не удалось разобрать структурированный ответ AI." }, 502, origin);
  }

  const allowedIds = new Set(candidates.map(item => item.id));
  const recommendedIds = Array.isArray(parsed.recommended_dish_ids)
    ? parsed.recommended_dish_ids.map(String).filter(id => allowedIds.has(id)).slice(0, 5)
    : [];

  const result = {
    answer: sanitizeText(parsed.answer, 5000) || "Не удалось сформировать полезный ответ.",
    recommended_dish_ids: recommendedIds,
    warnings: sanitizeList(parsed.warnings, 5),
    model: OPENAI_MODEL
  };

  return jsonResponse(result, 200, origin);
});
