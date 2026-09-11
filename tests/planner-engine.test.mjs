import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../docs/js/planner-engine.js", import.meta.url), "utf8");
const context = { console };
context.globalThis = context;
runInNewContext(source, context, { filename: "planner-engine.js" });
const Engine = context.PlannerEngine;

assert.ok(Engine, "PlannerEngine must be exported to globalThis");

const dishes = [
  {
    id: "oatmeal",
    name: "Овсянка с бананом",
    meal_types: ["breakfast", "snack"],
    calories: 360,
    protein: 14,
    fat: 9,
    carbs: 58,
    ingredients: [{ product: "Овсяные хлопья", grams: 70 }, { product: "Банан", grams: 100 }]
  },
  {
    id: "eggs",
    name: "Омлет с овощами",
    meal_types: ["breakfast"],
    calories: 330,
    protein: 24,
    fat: 19,
    carbs: 13,
    ingredients: [{ product: "Яйца", grams: 150 }, { product: "Помидор", grams: 100 }]
  },
  {
    id: "chicken",
    name: "Курица с гречкой",
    meal_types: ["lunch", "dinner"],
    calories: 500,
    protein: 45,
    fat: 12,
    carbs: 52,
    ingredients: [{ product: "Курица", grams: 180 }, { product: "Гречка", grams: 170 }]
  },
  {
    id: "fish",
    name: "Лосось с рисом",
    meal_types: ["lunch", "dinner"],
    calories: 520,
    protein: 36,
    fat: 22,
    carbs: 44,
    ingredients: [{ product: "Лосось", grams: 160 }, { product: "Рис", grams: 160 }]
  },
  {
    id: "cottage",
    name: "Творог с ягодами",
    meal_types: ["snack", "breakfast"],
    calories: 280,
    protein: 28,
    fat: 7,
    carbs: 25,
    ingredients: [{ product: "Творог", grams: 200 }, { product: "Ягоды", grams: 100 }]
  },
  {
    id: "turkey",
    name: "Индейка с картофелем",
    meal_types: ["lunch", "dinner"],
    calories: 470,
    protein: 42,
    fat: 11,
    carbs: 50,
    ingredients: [{ product: "Индейка", grams: 180 }, { product: "Картофель", grams: 220 }]
  }
];

const profile = {
  prefs: { liked: ["творог"], disliked: [] },
  allergies: ["курица"]
};

assert.equal(Engine.preferenceInfo(dishes[2], profile).blocked, true, "Chicken allergy must block chicken dish");
assert.equal(Engine.preferenceInfo(dishes[4], profile).liked.length, 1, "Favorite should be recognized");

const plan = Engine.generatePlan({ dishes, calories: 2000, meals: 4, profile });
assert.equal(plan.slots.length, 4);
assert.ok(plan.slots.filter(slot => slot.dish).length >= 3, "Plan should fill available slots");
assert.ok(plan.slots.every(slot => !slot.dish || slot.dish.id !== "chicken"), "Blocked dish must never enter plan");
assert.ok(plan.total.calories > 1200 && plan.total.calories < 2600, "Plan total should stay in a plausible range");
assert.ok(plan.shoppingList.length > 0, "Shopping list should be generated");

const dinnerIndex = plan.slots.findIndex(slot => slot.type === "dinner" && slot.dish);
if (dinnerIndex >= 0) {
  const oldId = plan.slots[dinnerIndex].dish.id;
  const alternatives = Engine.replacementCandidates({ plan, slotIndex: dinnerIndex, dishes, limit: 3 });
  assert.ok(alternatives.every(item => item.dish.id !== oldId), "Replacement list must exclude current dish");
  assert.ok(alternatives.every(item => item.dish.id !== "chicken"), "Replacement list must keep allergy filter");
  if (alternatives.length) {
    const replaced = Engine.replaceSlot(plan, dinnerIndex, dishes);
    assert.notEqual(replaced.slots[dinnerIndex].dish.id, oldId, "Replacement should change the dish");
  }
}

const portion = Engine.portionForTarget({ calories: 400 }, 600);
assert.equal(portion, 1.5, "Portion scaling should target meal calories within limits");

console.log("PlannerEngine tests passed.");
