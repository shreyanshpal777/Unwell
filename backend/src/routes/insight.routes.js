import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, ok, timedQuery } from "../utils/http.js";

const router = Router();

router.use(requireAuth);

const MINIMUM_WEEKS = 4;

router.post(
  "/insights/wellness",
  requireRole("user"),
  asyncHandler(async (req, res) => {
    const result = await timedQuery(
      `SELECT COUNT(DISTINCT log_date) AS log_days,
              MIN(log_date) AS first_log,
              MAX(log_date) AS last_log
       FROM wellness_logs
       WHERE user_id = $1`,
      [req.user.id]
    );
    const row = result.rows[0];
    const logDays = Number(row.log_days);
    const availableWeeks = logDays === 0 ? 0 : Math.floor((logDays - 1) / 7) + 1;

    if (availableWeeks < MINIMUM_WEEKS) {
      return ok(res, {
        status: "insufficient_data",
        minimumWeeks: MINIMUM_WEEKS,
        availableWeeks,
        logDays,
        message: `Log wellness entries for at least ${MINIMUM_WEEKS} weeks to unlock predictions.`
      });
    }

    const stats = await pool.query(
      `SELECT AVG(sleep_hours) AS avg_sleep,
              AVG(water_liters) AS avg_water,
              AVG(stress_level) AS avg_stress
       FROM wellness_logs
       WHERE user_id = $1`,
      [req.user.id]
    );

    return ok(res, {
      status: "ready",
      minimumWeeks: MINIMUM_WEEKS,
      availableWeeks,
      logDays,
      baseline: {
        avgSleepHours: Math.round(Number(stats.rows[0].avg_sleep) * 10) / 10,
        avgWaterLiters: Math.round(Number(stats.rows[0].avg_water) * 10) / 10,
        avgStressLevel: Math.round(Number(stats.rows[0].avg_stress) * 10) / 10
      },
      query: { sql: result.sql, ms: result.ms, rowCount: result.rowCount }
    });
  })
);

export default router;
