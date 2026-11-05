import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, notFound, ok, pgError, queryMeta, timedQuery, toNumber } from "../utils/http.js";

const router = Router();

const mapFood = (row) => ({
  id: Number(row.id),
  name: row.name,
  calories: Number(row.calories_per_100g),
  protein: Number(row.protein_per_100g),
  carbs: Number(row.carbs_per_100g),
  fat: Number(row.fat_per_100g),
  servingUnit: "100g",
  isActive: row.is_active
});

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 50 } = req.query;
    const includeInactive = req.query.includeInactive === "true" && req.user.role === "admin";

    const conditions = [];
    const params = [];
    if (!includeInactive) conditions.push("is_active = TRUE");
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      conditions.push(`LOWER(name) LIKE $${params.length}`);
    }
    const limitValue = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `SELECT id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, is_active
       FROM food_items
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return ok(res, result.rows.map(mapFood), { query: queryMeta(result) });
  })
);

function foodValidators(body, { partial = false } = {}) {
  const macro = (field) => () => {
    if (partial && body[field] === undefined) return null;
    const value = toNumber(body[field]);
    if (value === null) return null;
    if (Number.isNaN(value) || value < 0) return "Nutritional values must be zero or greater.";
    return null;
  };
  return collectFieldErrors({
    name: () => {
      if (partial && body.name === undefined) return null;
      return typeof body.name === "string" && body.name.trim().length >= 2 ? null : "Enter a food name.";
    },
    calories: macro("calories"),
    protein: macro("protein"),
    carbs: macro("carbs"),
    fat: macro("fat")
  });
}

router.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = foodValidators(body);
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);
    try {
      const { rows } = await pool.query(
        `INSERT INTO food_items (name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, is_active`,
        [
          String(body.name).trim(),
          toNumber(body.calories) ?? 0,
          toNumber(body.protein) ?? 0,
          toNumber(body.carbs) ?? 0,
          toNumber(body.fat) ?? 0
        ]
      );
      return res.status(201).json({ data: mapFood(rows[0]), meta: { requestId: res.locals.requestId } });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: { code: "CONFLICT", message: "A food item with that name already exists.", fields: { name: "Name must be unique." } } });
      return pgError(error, next);
    }
  })
);

router.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = foodValidators(body, { partial: true });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const mapping = {
      name: ["name", () => String(body.name).trim()],
      calories: ["calories_per_100g", () => toNumber(body.calories)],
      protein: ["protein_per_100g", () => toNumber(body.protein)],
      carbs: ["carbs_per_100g", () => toNumber(body.carbs)],
      fat: ["fat_per_100g", () => toNumber(body.fat)],
      isActive: ["is_active", () => Boolean(body.isActive)]
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
    const { rows } = await pool.query(
      `UPDATE food_items SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${params.length}
       RETURNING id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, is_active`,
      params
    );
    if (!rows[0]) return next(notFound("Food item not found."));
    return ok(res, mapFood(rows[0]));
  })
);

router.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      "UPDATE food_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!rows[0]) return next(notFound("Food item not found."));
    return ok(res, { id: Number(rows[0].id), isActive: false });
  })
);

export default router;
