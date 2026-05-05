(function () {
  const PLACEHOLDER_RE = /(YOUR_PROJECT_ID|YOUR_SUPABASE_ANON_KEY|your-email@example\.com)/i;
  let client = null;
  let approvedCache = null;

  function config() {
    return window.SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const cfg = config();
    return Boolean(cfg.url && cfg.anonKey && !PLACEHOLDER_RE.test(`${cfg.url} ${cfg.anonKey}`));
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!window.supabase || !window.supabase.createClient) {
      console.warn("Supabase CDN не загружен. Проверь подключение @supabase/supabase-js на странице.");
      return null;
    }
    if (!client) client = window.supabase.createClient(config().url, config().anonKey);
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
    if (!payload) return {};
    if (payload.fields && typeof payload.fields === "object") return payload.fields;
    return payload;
  }

  function field(fields, names, fallback = "") {
    for (const name of names) {
      const value = fields[name];
      if (Array.isArray(value) && value.length) return value.join(", ");
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return fallback;
  }

  function numberField(fields, names, fallback = 0) {
    const raw = field(fields, names, "");
    if (!raw) return fallback;
    const match = String(raw).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return fallback;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : fallback;
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n|;/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function splitTags(value) {
    const values = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
    return values.map(item => String(item || "").trim()).filter(Boolean);
  }

  function slugify(value) {
    const base = normalize(value)
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return base || `item-${Date.now()}`;
  }

  function categoryEmoji(name, category) {
    const text = normalize(`${name} ${category}`);
    const pairs = [
      ["йогурт", "🥣"], ["кефир", "🥛"], ["молоко", "🥛"], ["творог", "🥣"], ["сыр", "🧀"],
      ["яблок", "🍏"], ["банан", "🍌"], ["апельсин", "🍊"], ["лимон", "🍋"], ["клубник", "🍓"], ["виноград", "🍇"], ["ананас", "🍍"], ["арбуз", "🍉"], ["авокадо", "🥑"],
      ["огур", "🥒"], ["томат", "🍅"], ["помид", "🍅"], ["морков", "🥕"], ["карто", "🥔"], ["лук", "🧅"], ["чеснок", "🧄"], ["брокколи", "🥦"], ["капуст", "🥬"], ["перец", "🫑"], ["фасол", "🫘"], ["гриб", "🍄"],
      ["куриц", "🍗"], ["индей", "🦃"], ["говя", "🥩"], ["свин", "🥩"], ["ветчин", "🥓"], ["колбас", "🌭"], ["сосиск", "🌭"],
      ["рыб", "🐟"], ["лосос", "🐟"], ["форел", "🐟"], ["кревет", "🦐"], ["морепр", "🦐"],
      ["греч", "🌾"], ["овся", "🥣"], ["хлоп", "🥣"], ["макарон", "🍝"], ["хлеб", "🍞"],
      ["чай", "🍵"], ["кофе", "☕"], ["cola", "🥤"], ["кола", "🥤"], ["напит", "🥤"],
      ["яйц", "🥚"], ["печень", "🍪"], ["какао", "🍫"]
    ];
    const found = pairs.find(([needle]) => text.includes(needle));
    if (found) return found[1];
    if (text.includes("молоч")) return "🥛";
    if (text.includes("фрукт") || text.includes("ягод")) return "🍎";
    if (text.includes("овощ")) return "🥬";
    if (text.includes("мяс")) return "🥩";
    if (text.includes("рыб") || text.includes("мор")) return "🐟";
    return "🍽️";
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
    return splitLines(value).map(line => line.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
  }

  function parseMealTypes(value, category) {
    const raw = Array.isArray(value) ? value : splitTags(value || category);
    const result = [];
    raw.forEach(item => {
      const text = normalize(item);
      if (text.includes("завтрак")) result.push("breakfast");
      if (text.includes("обед")) result.push("lunch");
      if (text.includes("ужин")) result.push("dinner");
      if (text.includes("перекус")) result.push("snack");
    });
    return [...new Set(result.length ? result : ["other"])];
  }

  function titleFromFields(type, fields) {
    if (type === "product") return field(fields, ["Название продукта", "Название", "name"], "Новый продукт");
    if (type === "recipe") return field(fields, ["Название рецепта", "Название блюда", "Название", "name"], "Новый рецепт");
    return field(fields, ["Заголовок", "Название", "title"], "Новый материал");
  }

  function productFromSubmission(row) {
    const fields = fieldsFromPayload(row.payload);
    const name = titleFromFields("product", fields);
    const category = field(fields, ["Категория", "category"], "Разное");
    return {
      id: `approved-product-${row.id}`,
      name,
      calories: numberField(fields, ["Ккал на 100 г", "calories"], 0),
      protein: numberField(fields, ["Белки на 100 г", "protein"], 0),
      fat: numberField(fields, ["Жиры на 100 г", "fat"], 0),
      carbs: numberField(fields, ["Углеводы на 100 г", "carbs"], 0),
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
    const mealTypes = parseMealTypes(fields["Подходит для"], category);
    const ingredients = parseIngredients(field(fields, ["Ингредиенты", "ingredients"], ""));
    const instructions = parseInstructions(field(fields, ["Приготовление", "instructions"], ""));
    const mealLabelMap = { breakfast: "Завтрак", snack: "Перекус", lunch: "Обед", dinner: "Ужин", other: "Другое" };
    const tags = [...new Set([category, ...mealTypes.map(type => mealLabelMap[type] || type)].filter(Boolean))];
    return {
      id: `approved-recipe-${row.id}`,
      name,
      meal_types: mealTypes,
      image: field(fields, ["Ссылка на фото", "Ссылка на изображение", "image"], "img/hero.jpg"),
      ingredients,
      instructions,
      author: field(fields, ["Автор", "author"], "Пользователь сайта"),
      tags,
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
    const title = titleFromFields("article", fields);
    const image = field(fields, ["Ссылка на изображение", "Ссылка на фото", "image"], "img/myth1.jpg");
    const sources = splitLines(field(fields, ["Источники", "sources"], ""));
    const content = field(fields, ["Полный текст", "Короткая суть", "content"], "");
    return {
      id: `approved-article-${row.id}`,
      title,
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
      sources,
      proofs: splitTags(fields["Нужно проверить"] || []),
      source: "supabase",
      submission_id: row.id
    };
  }

  function mergeById(localItems, remoteItems) {
    const seen = new Set();
    return [...remoteItems, ...localItems].filter(item => {
      const key = String(item.id ?? item.name ?? item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchApprovedSubmissions(force = false) {
    if (approvedCache && !force) return approvedCache;
    const supabaseClient = getClient();
    if (!supabaseClient) {
      approvedCache = [];
      return approvedCache;
    }

    const { data, error } = await supabaseClient
      .from("submissions")
      .select("id,type,title,payload,status,created_at,updated_at,author_name,author_email")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Не удалось загрузить одобренные материалы из Supabase:", error.message);
      approvedCache = [];
      return approvedCache;
    }

    approvedCache = data || [];
    return approvedCache;
  }

  async function loadProducts() {
    const local = await loadJson(DATA_PATHS.products);
    const approved = await fetchApprovedSubmissions();
    const products = approved.filter(row => normalizeType(row.type) === "product").map(productFromSubmission);
    return mergeById(local, products);
  }

  async function loadDishes() {
    const local = await loadJson(DATA_PATHS.dishes);
    const approved = await fetchApprovedSubmissions();
    const dishes = approved.filter(row => normalizeType(row.type) === "recipe").map(dishFromSubmission);
    return mergeById(local, dishes);
  }

  async function loadMyths() {
    const local = await loadJson(DATA_PATHS.myths);
    const approved = await fetchApprovedSubmissions();
    const articles = approved
      .filter(row => ["article", "myth"].includes(normalizeType(row.type)))
      .map(articleFromSubmission);
    return mergeById(local, articles);
  }

  async function insertSubmission(submission) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase пока не подключён. Заполни docs/js/submission-config.js.");
    const { error } = await supabaseClient
      .from("submissions")
      .insert(submission);
    if (error) throw error;
    return true;
  }

  async function listSubmissions(status = "all") {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase пока не подключён. Заполни docs/js/submission-config.js.");
    let query = supabaseClient
      .from("submissions")
      .select("id,type,title,payload,status,created_at,updated_at,author_name,author_email,moderator_note")
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function updateSubmission(id, changes) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase пока не подключён. Заполни docs/js/submission-config.js.");

    // Не делаем .select().single() после UPDATE: при RLS это может выглядеть как
    // "ничего не происходит", если обновление разрешено, а чтение обновлённой строки
    // ограничено политиками. Для смены статуса достаточно самого UPDATE.
    const { error, count } = await supabaseClient
      .from("submissions")
      .update(changes, { count: "exact" })
      .eq("id", id);

    if (error) throw error;
    if (count === 0) {
      throw new Error("Строка не обновилась. Проверь adminEmail в submission-config.js и email в RLS-политике Supabase.");
    }

    approvedCache = null;
    return true;
  }

  async function signIn(email, password) {
    const supabaseClient = getClient();
    if (!supabaseClient) throw new Error("Supabase пока не подключён. Заполни docs/js/submission-config.js.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const supabaseClient = getClient();
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  }

  async function getSession() {
    const supabaseClient = getClient();
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session || null;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isAdminEmail(email) {
    const adminEmail = normalizeEmail(config().adminEmail);
    return Boolean(adminEmail && adminEmail !== "your-email@example.com" && normalizeEmail(email) === adminEmail);
  }

  async function getCurrentUser() {
    const supabaseClient = getClient();
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) return null;
    return data?.user || null;
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
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    isAdminEmail
  };
})();
