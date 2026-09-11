(function () {
  "use strict";

  const PLACEHOLDER_RE = /(YOUR_SUPABASE_URL|YOUR_PROJECT_ID|YOUR_SUPABASE_PUBLISHABLE_KEY|YOUR_SUPABASE_ANON_KEY)/i;
  const REQUEST_TIMEOUT_MS = 5000;
  let client = null;
  let approvedCache = null;

  function config() {
    return window.SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const cfg = config();
    return Boolean(
      cfg.url &&
      cfg.anonKey &&
      /^https:\/\//i.test(cfg.url) &&
      !PLACEHOLDER_RE.test(`${cfg.url} ${cfg.anonKey}`)
    );
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!window.supabase?.createClient) {
      console.warn("Supabase SDK не загружен.");
      return null;
    }
    if (!client) {
      client = window.supabase.createClient(config().url, config().anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
  }

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^a-zа-я0-9%]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeType(value) {
    const text = normalize(value);
    if (text.includes("продукт") || text === "product") return "product";
    if (text.includes("рецепт") || text === "recipe") return "recipe";
    if (text.includes("миф") || text === "myth") return "myth";
    if (text.includes("стать") || text === "article") return "article";
    return "article";
  }

  function fieldsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    return payload.fields && typeof payload.fields === "object" ? payload.fields : payload;
  }

  function field(fields, names, fallback = "") {
    for (const name of names) {
      const value = fields?.[name];
      if (Array.isArray(value) && value.length) return value.join(", ");
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return fallback;
  }

  function numberField(fields, names, fallback = 0) {
    const raw = field(fields, names, "");
    const match = String(raw).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return fallback;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : fallback;
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n|;/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function splitTags(value) {
    const source = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
    return source.map(item => String(item || "").trim()).filter(Boolean);
  }

  function parseIngredients(value) {
    return splitLines(value).map(line => {
      const match = line.match(/^(.+?)(?:\s*[—-]\s*|,\s*|\s+)(\d+(?:[.,]\d+)?)\s*(?:г|гр|gram|grams)?\b/i);
      if (!match) return { product: line, grams: 0 };
      return {
        product: match[1].trim(),
        grams: Number(String(match[2]).replace(",", ".")) || 0
      };
    });
  }

  function parseInstructions(value) {
    return splitLines(value)
      .map(line => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }

  function parseMealTypes(value, category = "") {
    const source = Array.isArray(value) ? value : splitTags(value || category);
    const result = [];
    for (const item of source) {
      const text = normalize(item);
      if (text.includes("завтрак")) result.push("breakfast");
      if (text.includes("обед")) result.push("lunch");
      if (text.includes("ужин")) result.push("dinner");
      if (text.includes("перекус")) result.push("snack");
    }
    return [...new Set(result.length ? result : ["other"])];
  }

  function titleFromFields(type, fields) {
    if (type === "product") return field(fields, ["Название продукта", "Название", "name"], "Новый продукт");
    if (type === "recipe") return field(fields, ["Название рецепта", "Название блюда", "Название", "name"], "Новый рецепт");
    return field(fields, ["Заголовок", "Название", "title"], "Новый материал");
  }

  function categoryEmoji(name, category) {
    const text = normalize(`${name} ${category}`);
    const rules = [
      ["йогурт", "🥣"], ["молок", "🥛"], ["творог", "🥣"], ["сыр", "🧀"],
      ["яблок", "🍏"], ["банан", "🍌"], ["клубник", "🍓"], ["авокад", "🥑"],
      ["огур", "🥒"], ["томат", "🍅"], ["помид", "🍅"], ["морков", "🥕"],
      ["куриц", "🍗"], ["индей", "🦃"], ["говя", "🥩"], ["рыб", "🐟"],
      ["кревет", "🦐"], ["греч", "🌾"], ["овся", "🥣"], ["макарон", "🍝"],
      ["яйц", "🥚"], ["кофе", "☕"], ["чай", "🍵"]
    ];
    const match = rules.find(([needle]) => text.includes(needle));
    return match?.[1] || "🍽️";
  }

  function productFromSubmission(row) {
    const fields = fieldsFromPayload(row.payload);
    const name = titleFromFields("product", fields);
    const category = field(fields, ["Категория", "category"], "Разное");
    return {
      id: `approved-product-${row.id}`,
      name,
      calories: numberField(fields, ["Ккал на 100 г", "Калорийность", "calories"], 0),
      protein: numberField(fields, ["Белки на 100 г", "Белки", "protein"], 0),
      fat: numberField(fields, ["Жиры на 100 г", "Жиры", "fat"], 0),
      carbs: numberField(fields, ["Углеводы на 100 г", "Углеводы", "carbs"], 0),
      serving: 100,
      glycemic_index: numberField(fields, ["Гликемический индекс", "glycemic_index"], 0),
      emoji: field(fields, ["Эмодзи", "emoji"], categoryEmoji(name, category)),
      category,
      source: "supabase",
      submission_id: row.id
    };
  }

  function dishFromSubmission(row) {
    const fields = fieldsFromPayload(row.payload);
    const name = titleFromFields("recipe", fields);
    const category = field(fields, ["Категория", "category"], "Рецепт");
    const mealTypes = parseMealTypes(fields["Подходит для"] || fields.meal_types, category);
    const labelMap = { breakfast: "Завтрак", snack: "Перекус", lunch: "Обед", dinner: "Ужин", other: "Другое" };
    return {
      id: `approved-recipe-${row.id}`,
      name,
      meal_types: mealTypes,
      image: field(fields, ["Ссылка на фото", "Ссылка на изображение", "image"], "img/hero.jpg"),
      ingredients: parseIngredients(field(fields, ["Ингредиенты", "ingredients"], "")),
      instructions: parseInstructions(field(fields, ["Приготовление", "instructions"], "")),
      author: field(fields, ["Автор", "author"], "Пользователь сайта"),
      tags: [...new Set([category, ...mealTypes.map(type => labelMap[type] || type)].filter(Boolean))],
      calories: numberField(fields, ["Калорийность", "calories"], 0),
      protein: numberField(fields, ["Белки", "protein"], 0),
      fat: numberField(fields, ["Жиры", "fat"], 0),
      carbs: numberField(fields, ["Углеводы", "carbs"], 0),
      source: "supabase",
      submission_id: row.id
    };
  }

  function articleFromSubmission(row) {
    const fields = fieldsFromPayload(row.payload);
    const image = field(fields, ["Ссылка на изображение", "Ссылка на фото", "image"], "img/myth1.jpg");
    const content = field(fields, ["Полный текст", "Короткая суть", "content"], "");
    return {
      id: `approved-article-${row.id}`,
      title: titleFromFields("article", fields),
      content,
      author: field(fields, ["Автор", "author"], "Пользователь сайта"),
      author_name: field(fields, ["Автор", "author"], "Пользователь сайта"),
      date: row.created_at ? new Date(row.created_at).toLocaleDateString("ru-RU") : "",
      created_at: row.created_at ? new Date(row.created_at).toLocaleDateString("ru-RU") : "",
      image,
      img: image,
      short_summary: field(fields, ["Короткая суть", "summary"], ""),
      full_text: content,
      format: field(fields, ["Формат", "format"], normalizeType(row.type) === "myth" ? "Миф" : "Статья"),
      category: field(fields, ["Тема", "Категория", "category"], "Питание"),
      sources: splitLines(field(fields, ["Источники", "sources"], "")),
      proofs: splitTags(fields["Нужно проверить"] || []),
      source: "supabase",
      submission_id: row.id
    };
  }

  function mergeById(localItems, remoteItems) {
    const seen = new Set();
    return [...(remoteItems || []), ...(localItems || [])].filter(item => {
      const key = String(item?.id ?? item?.name ?? item?.title ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function timeout(promise, fallback, ms = REQUEST_TIMEOUT_MS) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
  }

  async function fetchApprovedSubmissions(force = false) {
    if (approvedCache && !force) return approvedCache;
    const supabaseClient = getClient();
    if (!supabaseClient) return [];

    const query = supabaseClient
      .from("approved_submissions")
      .select("id,type,title,payload,status,created_at,updated_at,author_name")
      .order("created_at", { ascending: false });

    const result = await timeout(query, { data: [], error: new Error("Supabase timeout") });
    if (result.error) {
      console.warn("Supabase недоступен, используем локальные данные:", result.error.message);
      approvedCache = [];
      return approvedCache;
    }

    approvedCache = result.data || [];
    return approvedCache;
  }

  async function loadProducts() {
    const local = await loadJson(DATA_PATHS.products);
    const approved = await fetchApprovedSubmissions();
    return mergeById(local, approved.filter(row => normalizeType(row.type) === "product").map(productFromSubmission));
  }

  async function loadDishes() {
    const local = await loadJson(DATA_PATHS.dishes);
    const approved = await fetchApprovedSubmissions();
    return mergeById(local, approved.filter(row => normalizeType(row.type) === "recipe").map(dishFromSubmission));
  }

  async function loadMyths() {
    const local = await loadJson(DATA_PATHS.myths);
    const approved = await fetchApprovedSubmissions();
    return mergeById(
      local,
      approved.filter(row => ["article", "myth"].includes(normalizeType(row.type))).map(articleFromSubmission)
    );
  }

  async function insertSubmission(submission) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");

    const safeSubmission = {
      type: normalizeType(submission?.type),
      title: String(submission?.title || "Без названия").trim().slice(0, 180),
      author_name: String(submission?.author_name || "").trim().slice(0, 120) || null,
      payload: submission?.payload && typeof submission.payload === "object" ? submission.payload : {}
    };

    const functionName = String(config().submissionFunction || "submit-content");
    const { data, error } = await supabaseClient.functions.invoke(functionName, {
      body: { submission: safeSubmission }
    });
    if (error) {
      let message = error.message || "Не удалось отправить заявку.";
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) message = payload.error;
      } catch (_) {}
      throw new Error(message);
    }
    if (!data?.ok) throw new Error(data?.error || "Сервер не подтвердил сохранение заявки.");
    return data;
  }

  async function listSubmissions(status = "all") {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");

    let query = supabaseClient
      .from("submissions")
      .select("id,type,title,payload,status,created_at,updated_at,author_name,author_contact,author_email,moderator_note")
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function updateSubmission(id, changes = {}) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");

    const allowed = {};
    if (["pending", "approved", "rejected"].includes(changes.status)) allowed.status = changes.status;
    if (changes.payload && typeof changes.payload === "object") allowed.payload = changes.payload;
    if (typeof changes.title === "string") allowed.title = changes.title.trim().slice(0, 180);
    if (typeof changes.moderator_note === "string") allowed.moderator_note = changes.moderator_note.slice(0, 2000);
    if (!Object.keys(allowed).length) throw new Error("Нет допустимых изменений.");

    const { data, error } = await supabaseClient
      .from("submissions")
      .update(allowed)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Заявка не обновлена: проверь права администратора и RLS.");
    approvedCache = null;
    return true;
  }

  async function deleteSubmission(id) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");
    const { error, count } = await supabaseClient
      .from("submissions")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) throw error;
    if (count === 0) throw new Error("Заявка не удалена: проверь права администратора.");
    approvedCache = null;
    return true;
  }

  async function signIn(email, password) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const supabaseClient = getClient();
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  }

  async function getSession() {
    const supabaseClient = getClient();
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return null;
    return data?.session || null;
  }

  async function getCurrentUser() {
    const supabaseClient = getClient();
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) return null;
    return data?.user || null;
  }

  async function isAdmin() {
    const supabaseClient = getClient();
    if (!supabaseClient) return false;
    const session = await getSession();
    if (!session) return false;
    const { data, error } = await supabaseClient.rpc("is_site_admin");
    if (error) {
      console.warn("Не удалось проверить права администратора:", error.message);
      return false;
    }
    return data === true;
  }

  async function invokeAi(body) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase не подключён.");
    const functionName = String(config().aiFunction || "ai-assistant");
    const { data, error } = await supabaseClient.functions.invoke(functionName, { body });
    if (error) {
      let message = error.message || "AI-функция вернула ошибку.";
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) message = payload.error;
      } catch (_) {}
      throw new Error(message);
    }
    return data;
  }

  window.CFContent = {
    isConfigured,
    getClient,
    normalizeType,
    fieldsFromPayload,
    titleFromFields,
    fetchApprovedSubmissions,
    loadProducts,
    loadDishes,
    loadMyths,
    insertSubmission,
    listSubmissions,
    updateSubmission,
    deleteSubmission,
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    isAdmin,
    invokeAi
  };
})();
