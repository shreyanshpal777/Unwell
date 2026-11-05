import { Router } from "express";
import { pool } from "../config/db.js";
import { canAccessUser, requireAuth } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, forbidden, notFound, ok, parseDate, pgError, queryMeta, timedQuery, toNumber, formatDate } from "../utils/http.js";

const router = Router();

const GOAL_UNITS = {
  weekly_workout_minutes: "minutes",
  daily_water_intake: "liters",
  target_body_weight: "kg"
};

const GOAL_LABELS = {
  weekly_workout_minutes: "Weekly workout minutes",
  daily_water_intake: "Daily water intake",
  target_body_weight: "Target body weight"
};

const UNIT_LABELS = { minutes: "min", liters: "L", kg: "kg" };

router.use(requireAuth);

const selectClause = `SELECT g.id, g.user_id, g.goal_type, g.target_value, g.current_value, g.unit, g.deadline, g.status, g.created_at, u.name AS user_name
       FROM goals g
       INNER JOIN users u ON u.id = g.user_id`;

const mapGoal = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  userName: row.user_name ?? undefined,
  name: GOAL_LABELS[row.goal_type] ?? row.goal_type,
  goalType: row.goal_type,
  target: Number(row.target_value),
  current: Number(row.current_value),
  unit: UNIT_LABELS[row.unit] ?? row.unit,
  deadline: formatDate(row.deadline),
  deadlineLabel: new Date(row.deadline).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
  status: row.status
});

function goalValidators(body, { partial = false } = {}) {
  return collectFieldErrors({
    goalType: () => {
      if (partial && body.goalType === undefined) return null;
      return Object.keys(GOAL_UNITS).includes(body.goalType) ? null : "Choose one of the supported goal types.";
    },
    targetValue: () => {
      if (partial && body.targetValue === undefined) return null;
      const value = toNumber(body.targetValue);
      if (value === null) return null;
      if (Number.isNaN(value) || value <= 0) return "Target must be greater than zero.";
      return null;
    },
    currentValue: () => {
      if (partial && body.currentValue === undefined) return null;
      const value = toNumber(body.currentValue);
      if (value === null) return null;
      if (Number.isNaN(value) || value < 0) return "Current value cannot be negative.";
      return null;
    },
    deadline: () => {
      if (partial && body.deadline === undefined) return null;
      const fieldErrors = {};
      parseDate(body.deadline, "deadline", fieldErrors);
      return fieldErrors.deadline ?? null;
    },
    status: () => {
      if (partial && body.status === undefined) return null;
      return ["active", "completed", "cancelled"].includes(body.status) ? null : "Status must be active, completed, or cancelled.";
    }
  });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, clientId } = req.query;
    const params = [];
    const conditions = [];

    if (clientId) {
      const allowed = req.user.role === "admin" || (await canAccessUser(req, Number(clientId)));
      if (!allowed) throw forbidden("This client is not assigned to you.");
      params.push(Number(clientId));
      conditions.push(`g.user_id = $${params.length}`);
    } else if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`g.user_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`g.status = $${params.length}`);
    }

    const result = await timedQuery(
      `${selectClause}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY g.deadline ASC, g.id ASC`,
      params
    );
    return ok(res, result.rows.map(mapGoal), { query: queryMeta(result) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = goalValidators(body);
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    try {
      const { rows } = await pool.query(
        `INSERT INTO goals (user_id, goal_type, target_value, current_value, unit, deadline)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, goal_type, target_value, current_value, unit, deadline, status, created_at`,
        [req.user.id, body.goalType, body.targetValue, body.currentValue ?? 0, GOAL_UNITS[body.goalType], body.deadline]
      );
      return res.status(201).json({ data: mapGoal(rows[0]), meta: { requestId: res.locals.requestId } });
    } catch (error) {
      return pgError(error, next);
    }
  })
);

async function loadGoal(id) {
  const { rows } = await pool.query("SELECT id, user_id FROM goals WHERE id = $1", [id]);
  return rows[0];
}

router.patch(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const existing = await loadGoal(req.params.id);
    if (!existing) return next(notFound("Goal not found."));
    if (Number(existing.user_id) !== req.user.id && req.user.role !== "admin") throw forbidden("You do not have access to this goal.");

    const body = req.body ?? {};
    const errors = goalValidators(body, { partial: true });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const mapping = {
      targetValue: ["target_value", () => body.targetValue],
      currentValue: ["current_value", () => body.currentValue],
      deadline: ["deadline", () => body.deadline],
      status: ["status", () => body.status]
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
        `UPDATE goals SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}
         RETURNING id, user_id, goal_type, target_value, current_value, unit, deadline, status, created_at`,
        params
      );
      if (!rows[0]) return next(notFound("Goal not found."));
      return ok(res, mapGoal(rows[0]));
    } catch (error) {
      return pgError(error, next);
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const existing = await loadGoal(req.params.id);
    if (!existing) return next(notFound("Goal not found."));
    if (Number(existing.user_id) !== req.user.id && req.user.role !== "admin") throw forbidden("You do not have access to this goal.");

    const { rows } = await pool.query("DELETE FROM goals WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows[0]) return next(notFound("Goal not found."));
    return ok(res, { id: Number(rows[0].id), deleted: true });
  })
);

export default router;
