import { Router } from "express";
import { pool } from "../config/db.js";
import { canAccessUser, requireAuth } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, forbidden, notFound, ok, parseDate, pgError, queryMeta, timedQuery, toNumber, formatDate } from "../utils/http.js";

const router = Router();

const MOODS = ["very_low", "low", "neutral", "good", "excellent"];

router.use(requireAuth);

const MOOD_LABELS = {
  very_low: "Very low",
  low: "Low",
  neutral: "Neutral",
  good: "Good",
  excellent: "Excellent"
};

const selectClause = `SELECT wl.id, wl.user_id, wl.log_date, wl.sleep_hours, wl.water_liters, wl.stress_level, wl.mood, wl.created_at, u.name AS user_name
       FROM wellness_logs wl
       INNER JOIN users u ON u.id = wl.user_id`;

const mapLog = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  userName: row.user_name ?? undefined,
  date: formatDate(row.log_date),
  sleep: `${Number(row.sleep_hours)} hrs`,
  sleepHours: Number(row.sleep_hours),
  water: `${Number(row.water_liters)} L`,
  waterLiters: Number(row.water_liters),
  stress: `${row.stress_level} / 5`,
  stressLevel: row.stress_level,
  mood: MOOD_LABELS[row.mood] ?? row.mood,
  moodValue: row.mood
});

function wellnessValidators(body) {
  return collectFieldErrors({
    sleepHours: () => {
      const value = toNumber(body.sleepHours);
      if (value === null) return "Enter the hours slept.";
      if (Number.isNaN(value) || value < 0 || value > 24) return "Sleep must be between 0 and 24 hours.";
      return null;
    },
    waterLiters: () => {
      const value = toNumber(body.waterLiters);
      if (value === null) return "Enter water intake in liters.";
      if (Number.isNaN(value) || value < 0 || value > 20) return "Water must be between 0 and 20 liters.";
      return null;
    },
    stressLevel: () => {
      const value = Number(body.stressLevel);
      return Number.isInteger(value) && value >= 1 && value <= 5 ? null : "Stress level must be between 1 and 5.";
    },
    mood: () => (MOODS.includes(body.mood) ? null : "Choose one of the supported moods.")
  });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to, clientId, page = 1, limit = 60 } = req.query;
    const params = [];
    const conditions = [];

    if (clientId) {
      const allowed = req.user.role === "admin" || (await canAccessUser(req, Number(clientId)));
      if (!allowed) throw forbidden("This client is not assigned to you.");
      params.push(Number(clientId));
      conditions.push(`wl.user_id = $${params.length}`);
    } else if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`wl.user_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`wl.log_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`wl.log_date <= $${params.length}`);
    }

    const limitValue = Math.min(Math.max(Number(limit) || 60, 1), 365);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `${selectClause}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY wl.log_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return ok(res, result.rows.map(mapLog), { query: queryMeta(result) });
  })
);

router.put(
  "/:date",
  asyncHandler(async (req, res, next) => {
    const fieldErrors = {};
    parseDate(req.params.date, "date", fieldErrors);
    const errors = wellnessValidators(req.body ?? {});
    const merged = { ...fieldErrors, ...(errors ?? {}) };
    if (Object.keys(merged).length) throw badRequest("Please correct the highlighted fields.", merged);

    const body = req.body;
    const { rows } = await pool.query(
      `INSERT INTO wellness_logs (user_id, log_date, sleep_hours, water_liters, stress_level, mood)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET sleep_hours = EXCLUDED.sleep_hours,
                     water_liters = EXCLUDED.water_liters,
                     stress_level = EXCLUDED.stress_level,
                     mood = EXCLUDED.mood,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, log_date, sleep_hours, water_liters, stress_level, mood, created_at`,
      [req.user.id, req.params.date, body.sleepHours, body.waterLiters, body.stressLevel, body.mood]
    );
    return ok(res, mapLog(rows[0]));
  })
);

router.delete(
  "/:date",
  asyncHandler(async (req, res, next) => {
    const fieldErrors = {};
    parseDate(req.params.date, "date", fieldErrors);
    if (Object.keys(fieldErrors).length) throw badRequest("Please correct the highlighted fields.", fieldErrors);

    const { rows } = await pool.query(
      "DELETE FROM wellness_logs WHERE user_id = $1 AND log_date = $2 RETURNING id",
      [req.user.id, req.params.date]
    );
    if (!rows[0]) return next(notFound("No wellness entry exists for that date."));
    return ok(res, { id: Number(rows[0].id), deleted: true });
  })
);

export default router;
