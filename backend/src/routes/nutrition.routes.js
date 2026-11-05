import { Router } from "express";
import { pool } from "../config/db.js";
import { canAccessUser, requireAuth } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, forbidden, notFound, ok, parseDate, pgError, queryMeta, timedQuery, toNumber, formatDate } from "../utils/http.js";

const router = Router();

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

router.use(requireAuth);

const selectClause = `SELECT nl.id, nl.user_id, nl.food_id, nl.meal_type, nl.quantity_grams, nl.consumed_date, nl.created_at,
       fi.name AS food_name, fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, u.name AS user_name
       FROM nutrition_logs nl
       INNER JOIN food_items fi ON fi.id = nl.food_id
       INNER JOIN users u ON u.id = nl.user_id`;

const mapLog = (row) => {
  const quantity = Number(row.quantity_grams);
  const factor = quantity / 100;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name ?? undefined,
    foodId: Number(row.food_id),
    food: row.food_name,
    meal: row.meal_type.charAt(0).toUpperCase() + row.meal_type.slice(1),
    mealType: row.meal_type,
    quantity: `${Math.round(quantity)} g`,
    quantityGrams: quantity,
    calories: Math.round(Number(row.calories_per_100g) * factor),
    protein: `${Math.round(Number(row.protein_per_100g) * factor)} g`,
    proteinGrams: Math.round(Number(row.protein_per_100g) * factor * 10) / 10,
    carbs: `${Math.round(Number(row.carbs_per_100g) * factor)} g`,
    carbsGrams: Math.round(Number(row.carbs_per_100g) * factor * 10) / 10,
    fat: `${Math.round(Number(row.fat_per_100g) * factor)} g`,
    fatGrams: Math.round(Number(row.fat_per_100g) * factor * 10) / 10,
    date: formatDate(row.consumed_date)
  };
};

function nutritionValidators(body, { partial = false } = {}) {
  return collectFieldErrors({
    foodId: () => {
      if (partial && body.foodId === undefined) return null;
      return Number.isFinite(Number(body.foodId)) ? null : "Select a food item.";
    },
    mealType: () => {
      if (partial && body.mealType === undefined) return null;
      return MEAL_TYPES.includes(body.mealType) ? null : "Meal must be breakfast, lunch, dinner, or snack.";
    },
    quantityGrams: () => {
      if (partial && body.quantityGrams === undefined) return null;
      const value = toNumber(body.quantityGrams);
      if (value === null) return null;
      if (Number.isNaN(value) || value <= 0 || value > 10000) return "Quantity must be greater than zero and at most 10,000 g.";
      return null;
    },
    date: () => {
      if (partial && body.date === undefined) return null;
      const fieldErrors = {};
      parseDate(body.date, "date", fieldErrors);
      return fieldErrors.date ?? null;
    }
  });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { date, from, to, mealType, page = 1, limit = 50, clientId } = req.query;
    const params = [];
    const conditions = [];

    if (clientId) {
      const allowed = req.user.role === "admin" || (await canAccessUser(req, Number(clientId)));
      if (!allowed) throw forbidden("This client is not assigned to you.");
      params.push(Number(clientId));
      conditions.push(`nl.user_id = $${params.length}`);
    } else if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`nl.user_id = $${params.length}`);
    }

    if (date) {
      params.push(date);
      conditions.push(`nl.consumed_date = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`nl.consumed_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`nl.consumed_date <= $${params.length}`);
    }
    if (mealType) {
      params.push(mealType);
      conditions.push(`nl.meal_type = $${params.length}`);
    }

    const limitValue = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `${selectClause}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY nl.consumed_date DESC, nl.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const rows = result.rows.map(mapLog);
    const totals = rows.reduce(
      (acc, row) => ({
        calories: acc.calories + row.calories,
        protein: Math.round((acc.protein + row.proteinGrams) * 10) / 10,
        carbs: Math.round((acc.carbs + row.carbsGrams) * 10) / 10,
        fat: Math.round((acc.fat + row.fatGrams) * 10) / 10
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return ok(res, { logs: rows, totals }, { query: queryMeta(result) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = nutritionValidators(body);
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    try {
      const { rows } = await pool.query(
        `INSERT INTO nutrition_logs (user_id, food_id, meal_type, quantity_grams, consumed_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [req.user.id, body.foodId, body.mealType, body.quantityGrams, body.date]
      );
      const { rows: detail } = await pool.query(`${selectClause} WHERE nl.id = $1`, [rows[0].id]);
      return res.status(201).json({ data: mapLog(detail[0]), meta: { requestId: res.locals.requestId } });
    } catch (error) {
      return pgError(error, next);
    }
  })
);

async function loadLog(id) {
  const { rows } = await pool.query("SELECT id, user_id FROM nutrition_logs WHERE id = $1", [id]);
  return rows[0];
}

router.patch(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const existing = await loadLog(req.params.id);
    if (!existing) return next(notFound("Nutrition log not found."));
    if (!(await canAccessUser(req, existing.user_id))) throw forbidden("You do not have access to this nutrition record.");

    const body = req.body ?? {};
    const errors = nutritionValidators(body, { partial: true });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const mapping = {
      foodId: ["food_id", () => Number(body.foodId)],
      mealType: ["meal_type", () => body.mealType],
      quantityGrams: ["quantity_grams", () => body.quantityGrams],
      date: ["consumed_date", () => body.date]
    };
    const fields = [];
    const params = [];
    for (const [key, [column, value]] of Object.entries(mapping)) {
      if (body[key] !== undefined) {
        params.push(value());
        fields.push(`${column} = $${params.length}`);
      }
    }
    if (!fields.length) throw badRequest("Provide at least one field to update.");

    params.push(req.params.id);
    try {
      const { rows } = await pool.query(
        `UPDATE nutrition_logs SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING id`,
        params
      );
      if (!rows[0]) return next(notFound("Nutrition log not found."));
      const { rows: detail } = await pool.query(`${selectClause} WHERE nl.id = $1`, [rows[0].id]);
      return ok(res, mapLog(detail[0]));
    } catch (error) {
      return pgError(error, next);
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const existing = await loadLog(req.params.id);
    if (!existing) return next(notFound("Nutrition log not found."));
    if (!(await canAccessUser(req, existing.user_id))) throw forbidden("You do not have access to this nutrition record.");

    const { rows } = await pool.query("DELETE FROM nutrition_logs WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows[0]) return next(notFound("Nutrition log not found."));
    return ok(res, { id: Number(rows[0].id), deleted: true });
  })
);

export default router;
