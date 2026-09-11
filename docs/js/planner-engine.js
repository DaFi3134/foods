(function (global) {
  "use strict";

  const WORD_ALIASES = {
    "курица": ["курица", "курин"],
    "курицу": ["курица", "курин"],
    "индейка": ["индейка", "индееч"],
    "говядина": ["говядина", "говяж"],
    "свинина": ["свинина", "свин"],
    "рыба": ["рыба", "рыб", "лосось", "форель", "горбуша", "сельдь", "скумбрия"],
    "молоко": ["молоко", "молоч"],
    "йогурт": ["йогурт"],
    "творог": ["творог", "творож"],
    "сыр": ["сыр", "сырн"],
    "овсянка": ["овсянка", "овсян", "геркулес"],
    "гречка": ["гречка", "греч", "гречнев"],
    "помидор": ["помидор", "томат"],
    "томаты": ["томат", "помидор"],
    "огурец": ["огурец", "огурц"],
    "капуста": ["капуста", "капуст"],
    "орехи": ["орех"],
    "ягоды": ["ягод", "клубник", "черник", "малин", "вишн"],
    "морепродукты": ["морепродукт", "кревет", "миди", "кальмар"]
  };

  const DEFAULT_PORTION_LIMITS = { min: 0.65, max: 1.65 };

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^a-zа-я0-9%]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function listValues(values = []) {
    const source = Array.isArray(values) ? values : [values];
    return source
      .flatMap(value => String(value || "").split(/[;,]/))
      .map(value => value.trim())
      .filter(Boolean);
  }

  function variantsFor(term) {
    const normalized = normalize(term);
    if (!normalized) return [];
    const aliases = WORD_ALIASES[normalized] || [];
    const words = normalized.split(" ").filter(Boolean);
    return [...new Set([normalized, ...aliases, ...words])].filter(item => item.length >= 2);
  }

  function dishSearchText(dish) {
    const ingredients = (dish?.ingredients || []).map(item => item?.product || "").join(" ");
    const tags = (dish?.tags || []).join(" ");
    return normalize(`${dish?.name || ""} ${ingredients} ${tags} ${dish?.author || ""}`);
  }

  function termMatchesDish(term, dish, preparedText) {
    const text = preparedText || dishSearchText(dish);
    const variants = variantsFor(term);
    return variants.some(variant => {
      if (text.includes(variant)) return true;
      const words = variant.split(" ").filter(Boolean);
      return words.length > 1 && words.every(word => text.includes(word));
    });
  }

  function matchedTerms(dish, terms) {
    const text = dishSearchText(dish);
    return listValues(terms).filter(term => termMatchesDish(term, dish, text));
  }

  function preferenceInfo(dish, profile = {}) {
    const allergies = matchedTerms(dish, profile.allergies || []);
    const avoided = matchedTerms(dish, profile.prefs?.disliked || []);
    const liked = matchedTerms(dish, profile.prefs?.liked || []);
    return {
      allergies,
      avoided,
      liked,
      blocked: allergies.length > 0 || avoided.length > 0
    };
  }

  function mealSlots(meals) {
    const count = Number(meals || 4);
    if (count === 3) {
      return [
        { label: "Завтрак", type: "breakfast", ratio: 0.30 },
        { label: "Обед", type: "lunch", ratio: 0.40 },
        { label: "Ужин", type: "dinner", ratio: 0.30 }
      ];
    }
    if (count === 4) {
      return [
        { label: "Завтрак", type: "breakfast", ratio: 0.25 },
        { label: "Перекус", type: "snack", ratio: 0.10 },
        { label: "Обед", type: "lunch", ratio: 0.35 },
        { label: "Ужин", type: "dinner", ratio: 0.30 }
      ];
    }
    if (count === 5) {
      return [
        { label: "Завтрак", type: "breakfast", ratio: 0.25 },
        { label: "Перекус 1", type: "snack", ratio: 0.10 },
        { label: "Обед", type: "lunch", ratio: 0.35 },
        { label: "Перекус 2", type: "snack", ratio: 0.10 },
        { label: "Ужин", type: "dinner", ratio: 0.20 }
      ];
    }
    const safeCount = Math.min(Math.max(Math.round(count), 1), 8);
    return Array.from({ length: safeCount }, (_, index) => ({
      label: `Приём ${index + 1}`,
      type: null,
      ratio: 1 / safeCount
    }));
  }

  function clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
  }

  function dishKey(dish) {
    return String(dish?.id ?? dish?.num_id ?? dish?.name ?? "");
  }

  function finitePositive(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function portionForTarget(dish, targetCalories, limits = DEFAULT_PORTION_LIMITS) {
    const calories = finitePositive(dish?.calories, 0);
    if (!calories) return 1;
    const raw = finitePositive(targetCalories, calories) / calories;
    return Number(clamp(raw, limits.min, limits.max).toFixed(2));
  }

  function scaledNutrition(dish, portionFactor = 1) {
    const factor = finitePositive(portionFactor, 1);
    return {
      calories: Number(dish?.calories || 0) * factor,
      protein: Number(dish?.protein || 0) * factor,
      fat: Number(dish?.fat || 0) * factor,
      carbs: Number(dish?.carbs || 0) * factor
    };
  }

  function ingredientSet(dish) {
    return new Set(
      (dish?.ingredients || [])
        .map(item => normalize(item?.product))
        .filter(Boolean)
    );
  }

  function ingredientOverlap(dish, selectedDishes = []) {
    const current = ingredientSet(dish);
    if (!current.size || !selectedDishes.length) return 0;
    let overlap = 0;
    for (const selected of selectedDishes) {
      const existing = ingredientSet(selected);
      for (const ingredient of current) {
        if (existing.has(ingredient)) overlap += 1;
      }
    }
    return overlap;
  }

  function scoreDish(dish, targetCalories, profile, selectedDishes = [], limits = DEFAULT_PORTION_LIMITS) {
    const info = preferenceInfo(dish, profile);
    if (info.blocked) return Number.POSITIVE_INFINITY;

    const baseCalories = finitePositive(dish?.calories, 0);
    if (!baseCalories) return Number.POSITIVE_INFINITY;

    const portionFactor = portionForTarget(dish, targetCalories, limits);
    const adjustedCalories = baseCalories * portionFactor;
    const target = Math.max(finitePositive(targetCalories, baseCalories), 1);

    const caloriePenalty = Math.abs(adjustedCalories - target) / target * 100;
    const portionPenalty = Math.abs(Math.log(portionFactor)) * 38;
    const diversityPenalty = ingredientOverlap(dish, selectedDishes) * 2.5;
    const favoriteBonus = info.liked.length ? Math.min(18, 7 + info.liked.length * 4) : 0;

    return caloriePenalty + portionPenalty + diversityPenalty - favoriteBonus;
  }

  function allowedDishes(dishes, profile) {
    return (dishes || []).filter(dish => {
      if (!finitePositive(dish?.calories, 0)) return false;
      return !preferenceInfo(dish, profile).blocked;
    });
  }

  function candidatePools(dishes, type, profile, usedKeys) {
    const allowed = allowedDishes(dishes, profile);
    const typed = type
      ? allowed.filter(dish => (dish.meal_types || []).includes(type))
      : allowed.slice();
    const unusedTyped = typed.filter(dish => !usedKeys.has(dishKey(dish)));
    const unusedAny = allowed.filter(dish => !usedKeys.has(dishKey(dish)));
    return [unusedTyped, typed, unusedAny, allowed].filter(pool => pool.length > 0);
  }

  function chooseDish({ dishes, type, targetCalories, profile, usedKeys, selectedDishes, excludeKeys = new Set() }) {
    const pools = candidatePools(dishes, type, profile, usedKeys);
    for (const pool of pools) {
      const filtered = pool.filter(dish => !excludeKeys.has(dishKey(dish)));
      if (!filtered.length) continue;
      return filtered
        .map(dish => ({
          dish,
          score: scoreDish(dish, targetCalories, profile, selectedDishes),
          portionFactor: portionForTarget(dish, targetCalories)
        }))
        .filter(item => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || String(a.dish.name).localeCompare(String(b.dish.name), "ru"))[0] || null;
    }
    return null;
  }

  function totalNutrition(slots) {
    return (slots || []).reduce((total, slot) => {
      if (!slot?.nutrition) return total;
      total.calories += Number(slot.nutrition.calories || 0);
      total.protein += Number(slot.nutrition.protein || 0);
      total.fat += Number(slot.nutrition.fat || 0);
      total.carbs += Number(slot.nutrition.carbs || 0);
      return total;
    }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }

  function buildShoppingList(slots) {
    const map = new Map();
    for (const slot of slots || []) {
      if (!slot?.dish) continue;
      const factor = finitePositive(slot.portionFactor, 1);
      for (const item of slot.dish.ingredients || []) {
        const name = String(item?.product || "").trim();
        if (!name) continue;
        const key = normalize(name);
        const grams = Number(item?.grams || 0) * factor;
        const existing = map.get(key) || { name, grams: 0, occurrences: 0 };
        existing.grams += Number.isFinite(grams) ? grams : 0;
        existing.occurrences += 1;
        map.set(key, existing);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  function finalizePlan(plan) {
    const total = totalNutrition(plan.slots);
    return {
      ...plan,
      total,
      deltaCalories: Math.round(total.calories - plan.targetCalories),
      shoppingList: buildShoppingList(plan.slots),
      likedMatches: plan.slots.reduce((sum, slot) => {
        if (!slot?.dish) return sum;
        return sum + preferenceInfo(slot.dish, plan.profile).liked.length;
      }, 0)
    };
  }

  function generatePlan({ dishes = [], calories = 2000, meals = 4, profile = {} } = {}) {
    const targetCalories = clamp(Number(calories) || 2000, 1200, 6000);
    const slotsConfig = mealSlots(meals);
    const usedKeys = new Set();
    const selectedDishes = [];

    const slots = slotsConfig.map(config => {
      const target = Math.round(targetCalories * config.ratio);
      const choice = chooseDish({
        dishes,
        type: config.type,
        targetCalories: target,
        profile,
        usedKeys,
        selectedDishes
      });

      if (!choice) {
        return { ...config, targetCalories: target, dish: null, portionFactor: 1, nutrition: null };
      }

      const key = dishKey(choice.dish);
      if (key) usedKeys.add(key);
      selectedDishes.push(choice.dish);

      return {
        ...config,
        targetCalories: target,
        dish: choice.dish,
        portionFactor: choice.portionFactor,
        nutrition: scaledNutrition(choice.dish, choice.portionFactor),
        score: choice.score
      };
    });

    return finalizePlan({ targetCalories, meals: Number(meals || 4), profile, slots });
  }

  function replacementCandidates({ plan, slotIndex, dishes = [], limit = 6 }) {
    const slot = plan?.slots?.[slotIndex];
    if (!slot) return [];

    const otherSlots = plan.slots.filter((_, index) => index !== slotIndex);
    const usedKeys = new Set(otherSlots.filter(item => item?.dish).map(item => dishKey(item.dish)));
    const excludeKeys = new Set(slot.dish ? [dishKey(slot.dish)] : []);
    const selectedDishes = otherSlots.filter(item => item?.dish).map(item => item.dish);

    const allowed = allowedDishes(dishes, plan.profile);
    const typed = slot.type ? allowed.filter(dish => (dish.meal_types || []).includes(slot.type)) : allowed;
    const preferredPool = typed.length ? typed : allowed;

    return preferredPool
      .filter(dish => !excludeKeys.has(dishKey(dish)))
      .map(dish => ({
        dish,
        score: scoreDish(dish, slot.targetCalories, plan.profile, selectedDishes),
        portionFactor: portionForTarget(dish, slot.targetCalories),
        isUsedElsewhere: usedKeys.has(dishKey(dish))
      }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => Number(a.isUsedElsewhere) - Number(b.isUsedElsewhere) || a.score - b.score)
      .slice(0, Math.max(1, Number(limit) || 6));
  }

  function replaceSlot(plan, slotIndex, dishes = []) {
    if (!plan?.slots?.[slotIndex]) return plan;
    const candidates = replacementCandidates({ plan, slotIndex, dishes, limit: 1 });
    if (!candidates.length) return plan;

    const next = candidates[0];
    const slots = plan.slots.map((slot, index) => {
      if (index !== slotIndex) return slot;
      return {
        ...slot,
        dish: next.dish,
        portionFactor: next.portionFactor,
        nutrition: scaledNutrition(next.dish, next.portionFactor),
        score: next.score
      };
    });

    return finalizePlan({
      targetCalories: plan.targetCalories,
      meals: plan.meals,
      profile: plan.profile,
      slots
    });
  }

  function compactDishForAi(dish) {
    return {
      id: dishKey(dish),
      name: String(dish?.name || ""),
      meal_types: Array.isArray(dish?.meal_types) ? dish.meal_types.slice(0, 5) : [],
      calories: Number(dish?.calories || 0),
      protein: Number(dish?.protein || 0),
      fat: Number(dish?.fat || 0),
      carbs: Number(dish?.carbs || 0),
      ingredients: (dish?.ingredients || []).slice(0, 20).map(item => ({
        product: String(item?.product || ""),
        grams: Number(item?.grams || 0)
      })),
      tags: (dish?.tags || []).slice(0, 10).map(String)
    };
  }

  global.PlannerEngine = {
    normalize,
    listValues,
    dishKey,
    preferenceInfo,
    mealSlots,
    portionForTarget,
    scaledNutrition,
    allowedDishes,
    scoreDish,
    generatePlan,
    replacementCandidates,
    replaceSlot,
    buildShoppingList,
    compactDishForAi
  };
})(typeof window !== "undefined" ? window : globalThis);
