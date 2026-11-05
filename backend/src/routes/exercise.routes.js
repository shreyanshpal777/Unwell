import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, notFound, ok, pgError, queryMeta, timedQuery, toNumber } from "../utils/http.js";

const router = Router();

const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

const mapExercise = (row) => ({
  id: Number(row.id),
  name: row.name,
  muscleGroup: row.muscle_group,
  difficulty: row.difficulty,
  caloriesPerMinute: Number(row.calories_per_minute),
  isActive: row.is_active
});

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, muscleGroup, difficulty, page = 1, limit = 50 } = req.query;
    const includeInactive = req.query.includeInactive === "true" && req.user.role === "admin";

    const conditions = [];
    const params = [];
    if (!includeInactive) conditions.push("is_active = TRUE");
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      conditions.push(`LOWER(name) LIKE $${params.length}`);
    }
    if (muscleGroup) {
      params.push(muscleGroup);
      conditions.push(`muscle_group = $${params.length}`);
    }
    if (difficulty) {
      params.push(difficulty);
      conditions.push(`difficulty = $${params.length}`);
    }

    const limitValue = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `SELECT id, name, muscle_group, difficulty, calories_per_minute, is_active
       FROM exercises
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return ok(res, result.rows.map(mapExercise), { query: queryMeta(result) });
  })
);

function exerciseValidators(body, { partial = false } = {}) {
  return collectFieldErrors({
    name: () => {
      if (partial && body.name === undefined) return null;
      return typeof body.name === "string" && body.name.trim().length >= 2 ? null : "Enter an exercise name.";
    },
    muscleGroup: () => {
      if (partial && body.muscleGroup === undefined) return null;
      return typeof body.muscleGroup === "string" && body.muscleGroup.trim() ? null : "Enter a muscle group.";
    },
    difficulty: () => {
      if (partial && body.difficulty === undefined) return null;
      return DIFFICULTIES.includes(body.difficulty) ? null : "Difficulty must be beginner, intermediate, or advanced.";
    },
    caloriesPerMinute: () => {
      if (partial && body.caloriesPerMinute === undefined) return null;
      const value = toNumber(body.caloriesPerMinute);
      if (value === null) return null;
      if (Number.isNaN(value) || value < 0) return "Calories per minute must be zero or greater.";
      return null;
    }
  });
}

router.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = exerciseValidators(body);
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);
    try {
      const { rows } = await pool.query(
        `INSERT INTO exercises (name, muscle_group, difficulty, calories_per_minute)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, muscle_group, difficulty, calories_per_minute, is_active`,
        [String(body.name).trim(), String(body.muscleGroup).trim(), body.difficulty, toNumber(body.caloriesPerMinute) ?? 0]
      );
      return res.status(201).json({ data: mapExercise(rows[0]), meta: { requestId: res.locals.requestId } });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: { code: "CONFLICT", message: "An exercise with that name already exists.", fields: { name: "Name must be unique." } } });
      return pgError(error, next);
    }
  })
);

router.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = exerciseValidators(body, { partial: true });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const fields = [];
    const params = [];
    const assignments = {
      name: () => String(body.name).trim(),
      muscleGroup: () => String(body.muscleGroup).trim(),
      difficulty: () => body.difficulty,
      caloriesPerMinute: () => toNumber(body.caloriesPerMinute),
      isActive: () => Boolean(body.isActive)
    };
    for (const key of Object.keys(assignments)) {
      if (body[key] !== undefined) {
        params.push(assignments[key]());
        fields.push(`${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)} = $${params.length}`);
      }
    }
    if (!fields.length) throw badRequest("Provide at least one field to update.");

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE exercises SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${params.length}
       RETURNING id, name, muscle_group, difficulty, calories_per_minute, is_active`,
      params
    );
    if (!rows[0]) return next(notFound("Exercise not found."));
    return ok(res, mapExercise(rows[0]));
  })
);

router.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      "UPDATE exercises SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!rows[0]) return next(notFound("Exercise not found."));
    return ok(res, { id: Number(rows[0].id), isActive: false });
  })
);

export default router;
