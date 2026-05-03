import os
import re
import json
import sqlite3
import math
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, redirect, url_for, session, flash, send_from_directory, jsonify, abort
import pandas as pd

# ---------- CONFIG ----------
APP_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(APP_DIR, "database.db")
DEFAULT_XLSX = os.path.join(APP_DIR, "products.xlsx")  # optional
SECRET_KEY = os.environ.get("MEALSITE_SECRET", "change-me-in-prod")

# pleasant defaults
MEALS_RATIOS = {
    "Завтрак": 0.25,
    "Перекус": 0.10,
    "Обед": 0.35,
    "Ужин": 0.30
}

# ---------- APP ----------
app = Flask(__name__)
app.secret_key = SECRET_KEY
# static file caching disabled in dev
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# ---------- DB helpers ----------
def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db_connect()
    cur = conn.cursor()

    # ===== СТАТЬИ (Мифы и факты) =====
    cur.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_approved INTEGER DEFAULT 0
    )
    """)

    # ===== БЛЮДА / ПРОДУКТЫ =====
    cur.execute("""
    CREATE TABLE IF NOT EXISTS dishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL,
        fat REAL,
        carbs REAL,
        is_healthy INTEGER DEFAULT 1
    )
    """)

    conn.commit()
    conn.close()

def allowed_file(filename):
    """
    Проверяет, можно ли загружать файл по расширению.
    """
    if not filename:
        return False

    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in {"png", "jpg", "jpeg", "webp"}
    )

# ---------- import xlsx/csv ----------
def import_products_from_xlsx(path=DEFAULT_XLSX, replace=True):
    if not os.path.exists(path):
        return 0
    # accept csv or xlsx
    if path.lower().endswith(".csv"):
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path)
    required = {"name","calories","protein","fat","carbs"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"Файл должен содержать колонки: {required}. Найдено: {set(df.columns)}")
    conn = db_connect()
    cur = conn.cursor()
    if replace:
        cur.execute("DELETE FROM products")
    inserted = 0
    for _, r in df.iterrows():
        serving = float(r.get('serving', 100)) if not pd.isna(r.get('serving', None)) else 100
        cur.execute("""
            INSERT INTO products (name, calories, protein, fat, carbs, serving)
            VALUES (?,?,?,?,?,?)
        """, (str(r['name']), float(r['calories']), float(r['protein']),
              float(r['fat']), float(r['carbs']), float(serving)))
        inserted += 1
    conn.commit()
    conn.close()
    return inserted

# ---------- nutrition math ----------
def bmr_mifflin(sex, weight_kg, height_cm, age):
    if sex == 'male':
        return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

def activity_factor(level):
    return {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very": 1.9
    }.get(level, 1.2)

def bmi(weight_kg, height_cm):
    h = height_cm / 100.0
    if h <= 0:
        return None
    return weight_kg / (h * h)

# ---------- products helpers ----------
def get_products():
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def per_g(prod):
    # per 1 gram values (original stored per 100g)
    return {
        "cal": (prod.get("calories") or 0) / 100.0,
        "p": (prod.get("protein") or 0) / 100.0,
        "f": (prod.get("fat") or 0) / 100.0,
        "c": (prod.get("carbs") or 0) / 100.0,
    }

def score_product_for_target(prod, target_macro_pct):
    g = per_g(prod)
    p_cal = g["p"] * 4
    f_cal = g["f"] * 9
    c_cal = g["c"] * 4
    total = p_cal + f_cal + c_cal
    if total <= 0:
        return 1e6
    prod_ratio = (p_cal / total, f_cal / total, c_cal / total)
    t = (target_macro_pct["p"], target_macro_pct["f"], target_macro_pct["c"])
    # euclidean distance
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(prod_ratio, t)))


def compute_dish_macros_from_ingredients(ingredients):
    """
    ingredients: list of {"product": <name>, "grams": <number>}
    Возвращает (totals_dict, missing_list)
    totals_dict = {"cal":..,"p":..,"f":..,"c":..}
    """
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("SELECT name, calories, protein, fat, carbs, serving FROM products")
    rows = cur.fetchall()
    conn.close()

    # build map by normalized name
    prod_map = {r["name"].strip().lower(): r for r in rows}

    tot = {"cal": 0.0, "p": 0.0, "f": 0.0, "c": 0.0}
    missing = []
    for ing in ingredients:
        name = str(ing.get("product","")).strip().lower()
        grams = float(ing.get("grams") or 0)
        if not name or grams <= 0:
            continue
        product = prod_map.get(name)
        # try fuzzy: substring match
        if not product:
            for k,v in prod_map.items():
                if name in k:
                    product = v
                    break
        if not product:
            missing.append(name)
            continue
        # product fields are per 100g
        cal = (product["calories"] or 0) * grams / 100.0
        p = (product["protein"] or 0) * grams / 100.0
        f = (product["fat"] or 0) * grams / 100.0
        c = (product["carbs"] or 0) * grams / 100.0
        tot["cal"] += cal; tot["p"] += p; tot["f"] += f; tot["c"] += c

    # round nicely
    tot = {k: round(v,1) for k,v in tot.items()}
    return tot, missing

def suggest_dishes_for_day(dishes, calories, meals_count=4, macro_pct=None, prefs=None, allergies=None):
    """
    Возвращает словарь plan: {meal_name: {"dish": dish_dict or None, "target_cal": int}}
    Не допускает повтора блюд; учитывает prefs (liked/disliked substrings) и allergies list.
    meal_types в dishes — строка 'breakfast,lunch' и т.п.
    """
    if macro_pct is None:
        macro_pct = {"p":0.2,"f":0.3,"c":0.5}
    prefs = prefs or {"liked":[], "disliked":[]}
    allergies = [a.lower() for a in (allergies or []) if a]

    # filter by allergies (dish name or ingredient names if available in recipe JSON)
    filtered = []
    for d in dishes:
        name = (d.get("name") or "").lower()
        recipe = {}
        try:
            recipe = json.loads(d.get("recipe") or "{}")
        except Exception:
            recipe = {}
        ing_names = [ (ing.get("product") or "").lower() for ing in recipe.get("ingredients", []) ]
        skip = False
        for a in allergies:
            if a in name or any(a in ing for ing in ing_names):
                skip = True; break
        if not skip:
            filtered.append(d)
    if not filtered:
        return {"error": "Нет блюд после фильтрации по аллергии."}

    # build index by type (normalized)
    by_type = {}
    for d in filtered:
        types_raw = d.get("meal_types") or ""
        types = [t.strip().lower() for t in types_raw.split(",") if t.strip()]
        if not types:
            types = ["other"]
        for t in types:
            by_type.setdefault(t, []).append(d)

    # create meal slots
    if meals_count == 4:
        meal_slots = [("Завтрак","breakfast"), ("Перекус","snack"), ("Обед","lunch"), ("Ужин","dinner")]
    else:
        # generic naming
        meal_slots = [(f"Приём {i+1}", None) for i in range(meals_count)]

    # if meals_count !=4 but dish types exist, we attempt to pick by available types order
    plan = {}
    used_ids = set()
    for i,(label, preferred_type) in enumerate(meal_slots):
        # determine target calories
        if meals_count == 4:
            target_cal = round(calories * MEALS_RATIOS.get(label, 1.0 / meals_count))
        else:
            target_cal = round(calories / meals_count)
        # build candidate pool: prefer preferred_type; then generic
        candidates = []
        if preferred_type and preferred_type in by_type:
            candidates.extend(by_type[preferred_type])
        # fallback: include all types
        for tlist in by_type.values():
            for d in tlist:
                if d not in candidates:
                    candidates.append(d)
        # score candidates by macro closeness & prefs
        scored = []
        for d in candidates:
            # skip already used
            if d.get("id") in used_ids:
                continue
            s = score_dish_for_target(d, macro_pct)
            name = (d.get("name") or "").lower()
            for w in prefs.get("liked",[]):
                if w and w.lower() in name: s *= 0.85
            for w in prefs.get("disliked",[]):
                if w and w.lower() in name: s *= 1.25
            scored.append((s,d))
        scored.sort(key=lambda x:x[0])
        sel = scored[0][1] if scored else None
        if sel:
            used_ids.add(sel["id"])
        plan[label] = {"dish": sel, "target_cal": target_cal}
    return {"plan": plan}

def score_dish_for_target(dish, target_macro_pct):
    """
    Чем меньше возвращаемое значение — тем лучше.
    Сравниваем макро-распределение блюда (по калориям: белки*4, жиры*9, углеводы*4)
    с желаемым target_macro_pct (пример: {"p":0.2,"f":0.3,"c":0.5}).
    """
    # извлечь макро на 100г (или 0)
    p = float(dish.get("protein") or 0)
    f = float(dish.get("fat") or 0)
    c = float(dish.get("carbs") or 0)
    p_cal = p * 4
    f_cal = f * 9
    c_cal = c * 4
    total_cal = p_cal + f_cal + c_cal
    if total_cal <= 0:
        return 1e6
    prod_ratio = (p_cal/total_cal, f_cal/total_cal, c_cal/total_cal)
    tgt = (target_macro_pct.get("p",0), target_macro_pct.get("f",0), target_macro_pct.get("c",0))
    # Евклидово расстояние между векторами
    dist = math.sqrt(sum((a-b)**2 for a,b in zip(prod_ratio, tgt)))
    # нормируем в разумный шкалируемый диапазон
    return dist



def parse_ingredients_str(s):
    """
    Пример формата: "овсянка:40; банан:100; творог:150"
    Возвращает list of {"product": name, "grams": num}
    """
    out=[]
    if not s:
        return out
    parts = re.split(r"[;|]+", s)
    for p in parts:
        if not p.strip():
            continue
        if ":" in p:
            name, grams = p.split(":",1)
            try:
                g = float(grams.strip())
            except:
                g = 100.0
            out.append({"product": name.strip(), "grams": g})
        else:
            out.append({"product": p.strip(), "grams": 100})
    return out

def import_dishes_from_xlsx(path):
    """
    Ожидает колонки: name, meal_types, ingredients (product:grams;...), optionally calories/protein/fat/carbs
    Если КБЖУ не заданы, считает из ингредиентов.
    """
    if not os.path.exists(path):
        return 0, ["Файл не найден"]
    try:
        df = pd.read_excel(path)
    except Exception as e:
        return 0, [f"Ошибка чтения: {e}"]
    inserted = 0; msgs = []
    conn = db_connect(); cur = conn.cursor()
    for i,row in df.iterrows():
        try:
            name = str(row.get("name") or row.get("Название") or "").strip()
            meal_types = str(row.get("meal_types") or row.get("types") or "").strip()
            ingredients_str = str(row.get("ingredients") or "")
            ingredients = parse_ingredients_str(ingredients_str)
            # try provided macros
            calories = row.get("calories")
            protein = row.get("protein")
            fat = row.get("fat")
            carbs = row.get("carbs")
            if pd.isna(calories): calories=None
            if not calories:
                totals, missing = compute_dish_macros_from_ingredients(ingredients)
                calories = totals.get("cal",0); protein = totals.get("p",0); fat = totals.get("f",0); carbs = totals.get("c",0)
            cur.execute("INSERT INTO dishes (name, calories, protein, fat, carbs, meal_types, photo, recipe) VALUES (?,?,?,?,?,?,?,?)",
                        (name, float(calories or 0), float(protein or 0), float(fat or 0), float(carbs or 0),
                         meal_types, None, json.dumps({"ingredients": ingredients, "instructions": ""}))
                        )
            inserted += 1
        except Exception as e:
            msgs.append(f"Ошибка строки {i}: {e}")
    conn.commit(); conn.close()
    msgs.insert(0, f"Импорт блюд завершён: {inserted} записей")
    return inserted, msgs


# -------------------------
# 6) explain_biometrics
# -------------------------
def explain_biometrics(bmr, tdee, bmi):
    """
    Возвращает dict с описаниями для вывода пользователю.
    """
    out = {}
    out['bmr_text'] = "BMR — это энергия, которую тело тратит в состоянии покоя: дыхание, работа сердца и базовый метаболизм."
    out['tdee_text'] = "TDEE — примерная суточная потребность с учётом вашей активности. Если есть цель похудеть, создайте дефицит 10–20% от TDEE."
    if bmi is None:
        out['bmi_text'] = "Недостаточно данных для расчёта BMI."
    else:
        if bmi < 18.5:
            out['bmi_text'] = "Ваш BMI ниже нормы. Возможно, стоит увеличить калорийность и проверить здоровье у специалиста."
        elif bmi < 25:
            out['bmi_text'] = "Ваш BMI в пределах нормы — отличный результат."
        elif bmi < 30:
            out['bmi_text'] = "Наблюдается избыточный вес. Небольшая корректировка питания и активности поможет."
        else:
            out['bmi_text'] = "Имеется ожирение — рекомендуется постепенное снижение калорий и, при необходимости, консультация врача."
    return out

def suggest_products_for_meal(products, meal_calories, target_macro_pct, items_per_meal=3, prefs=None, allergies=None):
    # Защита: если нет продуктов
    if not products:
        return [], {"cal":0,"p":0,"f":0,"c":0}

    # Фильтруем по аллергиям (подстрочный поиск)
    if allergies:
        filtered = []
        low_all = [a.lower() for a in allergies if a]
        for p in products:
            name = (p.get("name") or "").lower()
            if any(a in name for a in low_all):
                continue
            filtered.append(p)
        products = filtered

    if not products:
        return [], {"cal":0,"p":0,"f":0,"c":0}

    scored = []
    for p in products:
        try:
            s = score_product_for_target(p, target_macro_pct)
        except Exception:
            s = 1e6
        # prefs должен быть dict {'liked':[], 'disliked':[]}
        if prefs:
            name = (p.get("name") or "").lower()
            for w in prefs.get("liked", []):
                if w and w.lower() in name:
                    s *= 0.8
            for w in prefs.get("disliked", []):
                if w and w.lower() in name:
                    s *= 1.4
        scored.append((s, p))
    scored.sort(key=lambda x: x[0])

    chosen = []
    idx = 0
    while len(chosen) < items_per_meal and idx < len(scored):
        cand = scored[idx][1]
        if cand['name'] not in [c['name'] for c in chosen]:
            chosen.append(cand)
        idx += 1

    if not chosen:
        chosen = [scored[0][1]]

    total_cal = sum(per_g(p)["cal"] * (p.get("serving") or 100) for p in chosen)
    if total_cal <= 0:
        # fallback: 100g first item
        first = chosen[0]
        grams = 100
        pg = per_g(first)
        cal = pg["cal"] * grams
        return ([{
            "name": first["name"], "grams": grams, "cal": int(round(cal)),
            "p": round(pg["p"]*grams,1), "f": round(pg["f"]*grams,1), "c": round(pg["c"]*grams,1)
        }], {"cal": round(cal,1), "p": round(pg["p"]*grams,1), "f": round(pg["f"]*grams,1), "c": round(pg["c"]*grams,1)})

    scale = meal_calories / total_cal if total_cal else 1
    servings = []
    tot = {"cal":0,"p":0,"f":0,"c":0}
    for p in chosen:
        base = p.get("serving") or 100
        grams = max(10, round(base * scale / 5) * 5)
        pg = per_g(p)
        cal = pg["cal"] * grams
        prot = pg["p"] * grams
        fat = pg["f"] * grams
        carb = pg["c"] * grams
        servings.append({
            "name": p["name"],
            "grams": int(grams),
            "cal": int(round(cal)),
            "p": round(prot,1),
            "f": round(fat,1),
            "c": round(carb,1)
        })
        tot["cal"] += cal
        tot["p"] += prot
        tot["f"] += fat
        tot["c"] += carb
    tot = {k: round(v,1) for k,v in tot.items()}
    return servings, tot

def usefulness_emoji(prod):
    cal = prod["calories"]
    sugar_carbs = prod["carbs"]
    fat = prod["fat"]
    protein = prod["protein"]

    if protein >= 15 and fat < 10:
        return "🥦"   # полезно
    if cal < 120:
        return "🍎"   # норм
    if fat > 20:
        return "🍔"   # жирно
    return "⚠️"

# ---------- Routes ----------
@app.route("/check-intake", methods=["GET","POST"])
def check_intake():
    products = get_products()
    dishes = []
    conn = db_connect(); cur = conn.cursor()
    cur.execute("SELECT * FROM dishes ORDER BY name")
    rows = cur.fetchall()
    conn.close()
    dishes = [dict(r) for r in rows]

    result = None; messages = []
    profile = get_profile()
    tdee = None
    if profile.get("data"):
        d = profile["data"]
        b = bmr_mifflin(d.get("sex","male"), float(d.get("weight",70)), float(d.get("height",175)), int(d.get("age",25)))
        tdee = round(b * activity_factor(d.get("activity","sedentary")))

    if request.method == "POST":
        # support JSON (AJAX) or form
        if request.is_json:
            payload = request.get_json()
            items = payload.get("items", [])
            custom_tdee = payload.get("custom_tdee")
        else:
            types = request.form.getlist("item_type[]")
            names = request.form.getlist("item_name[]")
            grams = request.form.getlist("item_grams[]")
            items = []
            for t,n,g in zip(types, names, grams):
                items.append({"type": t, "name": n, "grams": g})
            custom_tdee = request.form.get("custom_tdee")

        # compute totals (reuse existing logic)
        total = {"cal":0.0,"p":0.0,"f":0.0,"c":0.0}
        for it in items:
            t = it.get("type")
            n = it.get("name")
            g = float(it.get("grams") or 0)
            if not n or not g: continue
            if t == "product":
                prod = next((p for p in products if p['name'] == n), None)
                if not prod:
                    messages.append(f"Продукт '{n}' не найден")
                    continue
                pg = per_g(prod)
                total["cal"] += pg["cal"] * g
                total["p"] += pg["p"] * g
                total["f"] += pg["f"] * g
                total["c"] += pg["c"] * g
            else:  # dish
                d_obj = next((x for x in dishes if x['name'] == n), None)
                if not d_obj:
                    messages.append(f"Блюдо '{n}' не найдено")
                    continue
                factor = g / 100.0
                total["cal"] += (d_obj.get("calories") or 0) * factor
                total["p"] += (d_obj.get("protein") or 0) * factor
                total["f"] += (d_obj.get("fat") or 0) * factor
                total["c"] += (d_obj.get("carbs") or 0) * factor

        total = {k: round(v,1) for k,v in total.items()}

        # override tdee if provided
        if custom_tdee:
            try:
                tdee = float(custom_tdee)
            except:
                pass

        result = {"total": total, "messages": messages, "tdee": tdee}

        # If AJAX -> return JSON
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(result)

    # GET or normal POST fallback -> render template (existing behavior)
    return render_template("check_intake.html", products=products, dishes=dishes, result=result, profile=profile)

@app.route("/dish/add", methods=["GET","POST"])
def dish_add():
    """
    Ожидает в POST:
      - name
      - meal_types (comma separated string, напр. "breakfast,lunch")
      - instructions (text)
      - ingredients_raw (JSON string: [{"product":"...", "grams":100}, ...])
      - optional photo file input named 'photo'
    Считает К/Б/Ж/У по ingredients, сохраняет в dishes.
    """
    if request.method == "POST":
        name = request.form.get("name","").strip()
        meal_types = request.form.get("meal_types","").strip()
        instructions = request.form.get("instructions","").strip()
        ingredients_raw = request.form.get("ingredients_raw","")
        try:
            ingredients = json.loads(ingredients_raw) if ingredients_raw else []
        except Exception:
            ingredients = []
        totals, missing = compute_dish_macros_from_ingredients(ingredients)
        # handle photo
        photo_filename = None
        f = request.files.get("photo")
        if f and allowed_file(f.filename):
            fname = secure_filename(f.filename)
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], fname)
            f.save(save_path)
            photo_filename = fname
        conn = db_connect()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dishes (name, calories, protein, fat, carbs, meal_types, photo, recipe) VALUES (?,?,?,?,?,?,?,?)",
            (name, totals.get("cal",0), totals.get("p",0), totals.get("f",0), totals.get("c",0),
             meal_types, photo_filename, json.dumps({"ingredients": ingredients, "instructions": instructions}))
        )
        conn.commit(); conn.close()
        msg = f"Блюдо '{name}' добавлено."
        if missing:
            msg += " Не найдены продукты: " + ", ".join(missing)
        flash(msg, "success")
        return redirect(url_for("library"))
    # GET: render form (template should include JS to build ingredients_json into ingredients_raw)
    # pass example product names for autocompletion
    prods = get_products()
    product_names = [p['name'] for p in prods]
    return render_template("add_dish.html", product_names=product_names)


@app.route("/dish/<int:dish_id>")
def dish_detail(dish_id):
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        flash("Блюдо не найдено", "warning")
        return redirect(url_for("library"))
    dish = dict(row)
    # parse recipe JSON safely
    try:
        dish['recipe'] = json.loads(dish.get("recipe") or "{}")
    except Exception:
        dish['recipe'] = {"ingredients": [], "instructions": ""}
    return render_template("dish_detail.html", dish=dish)

@app.post("/dishes/<int:dish_id>/delete")
def dish_delete(dish_id):
    conn = db_connect()
    cur = conn.cursor()

    cur.execute("DELETE FROM dishes WHERE id = ?", (dish_id,))
    conn.commit()
    conn.close()

    flash("Блюдо удалено", "success")
    return redirect(url_for("library"))

@app.route("/products/add", methods=["POST"])
def product_add():
    name = request.form["name"]
    calories = request.form["calories"]
    protein = request.form["protein"]
    fat = request.form["fat"]
    carbs = request.form["carbs"]
    category = request.form["category"]
    emoji = request.form.get("emoji", "🍽")

    conn = db_connect()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO products (name, calories, protein, fat, carbs, category, emoji)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (name, calories, protein, fat, carbs, category, emoji))

    conn.commit()
    conn.close()

    return redirect(url_for("library"))

@app.post("/products/<int:product_id>/delete")
def product_delete(product_id):
    conn = db_connect()
    cur = conn.cursor()

    cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()

    flash("Продукт удалён", "success")
    return redirect(url_for("library"))

@app.route('/library')
def library():
    conn = db_connect(); cur = conn.cursor()
    cur.execute("SELECT * FROM dishes ORDER BY name")
    dishes = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM products ORDER BY name")
    products = [dict(r) for r in cur.fetchall()]
    conn.close()

    # apply filters
    q = (request.args.get('q') or '').strip().lower()
    show = request.args.get('show','both')
    meal_type = (request.args.get('meal_type') or '').strip().lower()

    if q:
        dishes = [d for d in dishes if q in (d.get('name') or '').lower()]
        products = [p for p in products if q in (p.get('name') or '').lower()]

    if meal_type:
        # keep dishes that either have meal_type in their meal_types OR user overrides (dish_allowed)
        filtered = []
        for d in dishes:
            types = [t.strip().lower() for t in (d.get('meal_types') or '').split(',') if t.strip()]
            if meal_type in types:
                filtered.append(d)
        dishes = filtered

    if show == 'dishes':
        products = []
    elif show == 'products':
        dishes = []

    for p in products:
        p['emoji'] = usefulness_emoji(p)

    return render_template('library.html', dishes=dishes, products=products)

@app.route("/guide")
def guide():
    """
    Показывает стартовую статью (тезисы по похудению).
    Шаблон: templates/guide.html — наполнишь текстом сам: h1 + тезисы + ссылки.
    """
    # можно загрузить текст из БД позже; сейчас просто render шаблона
    return render_template("guide.html")


@app.route("/")
def index():
    # show hero, quick cards
    return render_template("index.html")

@app.route("/admin/import", methods=["GET","POST"])
def admin_import():
    # support upload form (POST) or server-side import (GET)
    if request.method == "POST":
        f = request.files.get("file")
        if not f:
            flash("Файл не прикреплён", "danger")
            return redirect(url_for("admin_import"))
        filename = f.filename
        tmp = os.path.join(APP_DIR, "tmp_upload_" + filename)
        f.save(tmp)
        try:
            n = import_products_from_xlsx(tmp, replace=True)
            flash(f"Импортировано {n} продуктов", "success")
        except Exception as e:
            flash(f"Ошибка импорта: {e}", "danger")
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        return redirect(url_for("index"))
    # GET: server-side import from DEFAULT_XLSX (if exists)
    try:
        n = import_products_from_xlsx()
        if n:
            flash(f"Импортировано {n} продуктов из products.xlsx", "success")
        else:
            flash("products.xlsx не найден - загрузи через форму", "info")
    except Exception as e:
        flash(f"Ошибка импорта: {e}", "danger")
    return redirect(url_for("index"))

@app.route("/calculator", methods=["GET","POST"])
def calculator():
    results = None
    if request.method == "POST":
        mode = request.form.get("mode", "manual")
        if mode == "use_profile" and session.get("profile"):
            prof = session['profile']
            sex = prof.get("sex", "male")
            age = float(prof.get("age", 25))
            weight = float(prof.get("weight", 70))
            height = float(prof.get("height", 175))
            activity = prof.get("activity", "sedentary")
        else:
            sex = request.form.get("sex","male")
            age = float(request.form.get("age",25))
            weight = float(request.form.get("weight",70))
            height = float(request.form.get("height",175))
            activity = request.form.get("activity","sedentary")

        bmr = bmr_mifflin(sex, weight, height, age)
        tdee = bmr * activity_factor(activity)
        bmi_v = bmi(weight, height)
        macro_pct = {"p":0.2,"f":0.3,"c":0.5}
        session['profile'] = session.get('profile', {})
        # optionally update profile data if using mode use_profile (no overwrite)
        results = {"bmr":round(bmr,1),"tdee":round(tdee,1),"bmi":round(bmi_v,1),"macro_pct":macro_pct}
    profile = session.get('profile')
    prods = get_products()  # у вас уже есть эта функция
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM dishes ORDER BY name")
    dishes_rows = cur.fetchall()
    conn.close()
    dishes = [dict(r) for r in dishes_rows]
    return render_template("calc.html", profile=profile, results=results, products=prods, dishes=dishes)

@app.route("/planner", methods=["GET","POST"])
def planner():
    plan = None
    if request.method == "POST":
        try:
            calories = int(request.form.get("calories",2000))
            meals_count = int(request.form.get("meals",4))
        except Exception:
            flash("Неверные данные", "danger")
            return redirect(url_for("planner"))

        macro_pct = {"p":0.2,"f":0.3,"c":0.5}
        profile = get_profile()
        prefs = profile.get("prefs", {"liked": [], "disliked": []})
        allergies = profile.get("allergies", [])

        # Загружаем блюда
        conn = db_connect(); cur = conn.cursor()
        cur.execute("SELECT * FROM dishes ORDER BY name")
        dishes = [dict(r) for r in cur.fetchall()]
        conn.close()

        if dishes:
            out = suggest_dishes_for_day(dishes, calories, meals_count=meals_count, macro_pct=macro_pct, prefs=prefs, allergies=allergies)
            if "error" in out:
                flash(out["error"], "warning")
                plan = None
            else:
                plan = out["plan"]
                # добавим метаданные
                plan_meta = {"requested_calories": calories, "meals_count": meals_count}
                plan = {"plan": plan, "meta": plan_meta}
        else:
            flash("В базе нет блюд — добавьте блюда или импортируйте их из Excel", "warning")
            plan = None

    return render_template("planner.html", plan=plan)


@app.route("/products")
def products_view():
    prods = get_products()
    for p in prods:
        p['emoji'] = usefulness_emoji(p)
    return render_template("products.html", products=prods)

# static hero fallback (optional)
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(os.path.join(APP_DIR, "static"), filename)


@app.route("/profile", methods=["GET", "POST"])
def profile():
    """
    Страница профиля с 3 вкладками:
      - Мои данные (sex, age, weight, height, activity)
      - Мои пожелания по еде (liked, disliked)
      - Мои аллергии/противопоказания (comma-separated)
    Данные сохраняются в session['profile'].
    """
    profile = get_profile()
    conn = db_connect();
    cur = conn.cursor();
    cur.execute("SELECT id, name, calories FROM dishes ORDER BY name");
    all_dishes = [dict(r) for r in cur.fetchall()];
    conn.close()

    if request.method == "POST":
        # различаем по hidden-полю 'tab' из формы, чтобы определить, какую вкладку сохраним
        tab = request.form.get("tab", "data")
        if tab == "data":
            sex = request.form.get("sex", profile['data'].get('sex', 'male'))
            age = int(request.form.get("age", profile['data'].get('age', 25) or 25))
            weight = float(request.form.get("weight", profile['data'].get('weight', 70) or 70))
            height = float(request.form.get("height", profile['data'].get('height', 175) or 175))
            activity = request.form.get("activity", profile['data'].get('activity','sedentary'))
            profile['data'] = {"sex": sex, "age": age, "weight": weight, "height": height, "activity": activity}
            # обновим BMR/TDEE быстро
            bmr = bmr_mifflin(sex, weight, height, age)
            profile['data']['bmr'] = round(bmr,1)
            profile['data']['tdee'] = round(bmr * activity_factor(activity),1)
            save_profile(profile)
            flash("Данные профиля сохранены", "success")
        elif tab == "prefs":
            liked_raw = request.form.get("liked", "")
            disliked_raw = request.form.get("disliked", "")
            profile['prefs']['liked'] = normalize_list_field(liked_raw)
            profile['prefs']['disliked'] = normalize_list_field(disliked_raw)
            save_profile(profile)
            flash("Пожелания сохранены", "success")
        elif tab == "allergies":
            allergies_raw = request.form.get("allergies", "")
            profile['allergies'] = normalize_list_field(allergies_raw)
            save_profile(profile)
            flash("Аллергии/противопоказания сохранены", "success")
        return redirect(url_for("profile"))

    # GET: отобразить форму
    return render_template("profile.html", profile=profile)

@app.route("/myths")
def myths():
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_name TEXT,
        img TEXT,
        is_approved INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()  # обязательно сохранить изменения
    # теперь делаем нормальный SELECT
    cur.execute("SELECT * FROM articles WHERE is_approved=1 ORDER BY created_at DESC")
    articles = [dict(r) for r in cur.fetchall()]
    conn.close()
    return render_template("myths.html", articles=articles)

@app.route("/myths/<int:article_id>")
def myth_detail(article_id):
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM articles WHERE id=?", (article_id,))
    article = cur.fetchone()
    conn.close()
    if not article:
        abort(404)
    return render_template("myth_detail.html", article=dict(article))


@app.route("/myths/add", methods=["GET", "POST"])
def add_myth():
    if request.method == "POST":
        title = request.form.get("title")
        content = request.form.get("content")
        author = request.form.get("author_name")
        img = request.form.get("img")  # можно потом сделать upload
        conn = db_connect()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO articles (title, content, author_name, img) VALUES (?, ?, ?, ?)",
            (title, content, author, img)
        )
        conn.commit()
        conn.close()
        flash("Ваша статья отправлена на модерацию", "success")
        return redirect(url_for("myths"))
    return render_template("add_myth.html")

@app.route("/admin/moderation/<int:article_id>", methods=["POST"])
def moderate_article(article_id):
    action = request.form.get("action")
    conn = db_connect()
    cur = conn.cursor()

    if action == "approve":
        cur.execute("UPDATE articles SET is_approved = 1 WHERE id = ?", (article_id,))
        flash("Статья одобрена", "success")
    elif action == "reject":
        cur.execute("DELETE FROM articles WHERE id = ?", (article_id,))
        flash("Статья отклонена и удалена", "danger")

    conn.commit()
    conn.close()
    return redirect(url_for("admin_moderation"))

@app.route("/admin/articles/<int:article_id>/approve", methods=["POST"])
def approve_article(article_id):
    conn = db_connect()
    cur = conn.cursor()
    cur.execute("UPDATE articles SET is_approved=1 WHERE id=?", (article_id,))
    conn.commit()
    conn.close()
    flash("Статья одобрена", "success")
    return redirect(url_for("admin_moderation"))



@app.route("/admin/moderation")
def admin_moderation():
    if not session.get("is_admin"):
        abort(403)
    conn = db_connect(); cur = conn.cursor()
    cur.execute("SELECT * FROM articles ORDER BY created_at DESC")
    articles = [dict(r) for r in cur.fetchall()]
    conn.close()
    return render_template("admin_moderation.html", articles=articles)

@app.post("/admin/articles/<int:article_id>/approve")
def admin_approve(article_id):
    if not session.get("is_admin"): abort(403)
    conn = db_connect(); cur = conn.cursor()
    cur.execute("UPDATE articles SET is_approved=1 WHERE id=?", (article_id,))
    conn.commit(); conn.close()
    flash("Статья одобрена", "success")
    return redirect(url_for("admin_moderation"))

@app.post("/admin/articles/<int:article_id>/reject")
def admin_reject(article_id):
    if not session.get("is_admin"): abort(403)
    conn = db_connect(); cur = conn.cursor()
    cur.execute("DELETE FROM articles WHERE id=?", (article_id,))
    conn.commit(); conn.close()
    flash("Статья отклонена и удалена", "info")
    return redirect(url_for("admin_moderation"))

# ---------- Admin login simulation ----------
@app.route("/admin/login")
def admin_login():
    session['is_admin']=True
    flash("Вы вошли как админ", "success")
    return redirect(url_for("admin_moderation"))

@app.route("/admin/logout")
def admin_logout():
    session.pop("is_admin", None)
    flash("Вы вышли из режима администратора", "info")
    return redirect(url_for("index"))

@app.route("/profile/clear")
def clear_profile():
    session.pop("profile", None)
    flash("Профиль очищен", "info")
    return redirect(url_for("index"))

# --- helpers for profile + filtering ---
def get_profile():
    """
    Возвращает профиль из сессии в виде словаря с ключами:
    'data' (sex, age, weight, height, activity),
    'prefs' (liked, disliked) - списки строк,
    'allergies' - список строк
    """
    return session.get("profile", {
        "data": {},
        "prefs": {"liked": [], "disliked": []},
        "allergies": []
    })

def save_profile(profile):
    session['profile'] = profile

def normalize_list_field(s):
    """
    Принимает строку, где элементы через запятую и/или точки с запятой,
    возвращает список строчек в нижнем регистре, trimmed, без пустых.
    """
    if not s:
        return []
    # split on comma or semicolon
    parts = [p.strip().lower() for p in re.split(r"[;,]", s) if p.strip()]
    return list(dict.fromkeys(parts))  # remove duplicates preserving order

def filter_products_by_allergies(products, allergies):
    """Исключаем продукты, имя которых содержит любой аллерген (подстрока)."""
    if not allergies:
        return products
    out = []
    for p in products:
        name = (p.get("name") or "").lower()
        skip = False
        for a in allergies:
            if a and a in name:
                skip = True
                break
        if not skip:
            out.append(p)
    return out

def adjust_score_for_prefs(product, score, prefs):
    """
    Уменьшаем score (чем меньше — тем лучше) если продукт нравится,
    увеличиваем если не нравится. prefs: {'liked': [...], 'disliked': [...]}
    """
    name = (product.get("name") or "").lower()
    for w in prefs.get("liked", []):
        if w and w in name:
            return score * 0.8  # чуть более предпочтительный
    for w in prefs.get("disliked", []):
        if w and w in name:
            return score * 1.4  # ухудшаем позицию
    return score


# ---------- Bootstrap: init ----------
if __name__ == "__main__":
    init_db()
    # try import default on start
    try:
        import_products_from_xlsx()
    except Exception as e:
        print("Import warning:", e)
    app.run(debug=True, host="0.0.0.0", port=5000)
