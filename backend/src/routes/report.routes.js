import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, notFound, ok, queryMeta, timedQuery } from "../utils/http.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

const reports = {
  "weekly-workout-summary": () =>
    timedQuery(
      `SELECT TO_CHAR(DATE_TRUNC('week', ws.session_date), 'YYYY-MM-DD') AS week,
              COUNT(ws.id) AS sessions,
              SUM(ws.duration_minutes) AS total_minutes,
              ROUND(AVG(ws.duration_minutes), 1) AS avg_duration
       FROM workout_sessions ws
       WHERE ws.session_date >= CURRENT_DATE - INTERVAL '11 weeks'
       GROUP BY DATE_TRUNC('week', ws.session_date)
       ORDER BY week DESC`
    ),
  "daily-nutrition-totals": () =>
    timedQuery(
      `SELECT nl.consumed_date AS date,
              COUNT(*) AS entries,
              SUM(ROUND(fi.calories_per_100g * nl.quantity_grams / 100)) AS calories,
              SUM(ROUND(fi.protein_per_100g * nl.quantity_grams / 100)) AS protein,
              SUM(ROUND(fi.carbs_per_100g * nl.quantity_grams / 100)) AS carbs,
              SUM(ROUND(fi.fat_per_100g * nl.quantity_grams / 100)) AS fat
       FROM nutrition_logs nl
       INNER JOIN food_items fi ON fi.id = nl.food_id
       WHERE nl.consumed_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY nl.consumed_date
       ORDER BY nl.consumed_date DESC`
    ),
  "average-sleep-per-user": () =>
    timedQuery(
      `SELECT u.id AS user_id, u.name,
              ROUND(AVG(wl.sleep_hours), 2) AS avg_sleep_hours,
              COUNT(wl.id) AS log_days
       FROM wellness_logs wl
       INNER JOIN users u ON u.id = wl.user_id
       GROUP BY u.id, u.name
       ORDER BY avg_sleep_hours DESC`
    ),
  "active-workout-users": () =>
    timedQuery(
      `SELECT u.id AS user_id, u.name, u.email,
              COUNT(ws.id) AS session_count,
              COALESCE(SUM(ws.duration_minutes), 0) AS total_minutes
       FROM users u
       INNER JOIN workout_sessions ws ON ws.user_id = u.id
       GROUP BY u.id, u.name, u.email
       HAVING COUNT(ws.id) > 3
       ORDER BY session_count DESC, total_minutes DESC`
    ),
  "trainer-client-counts": () =>
    timedQuery(
      `SELECT t.id AS trainer_id, t.name AS trainer_name,
              COUNT(tc.client_id) AS client_count,
              COUNT(tc.client_id) FILTER (WHERE u.is_active) AS active_clients
       FROM users t
       LEFT JOIN trainer_clients tc ON tc.trainer_id = t.id
       LEFT JOIN users u ON u.id = tc.client_id
       WHERE t.role = 'trainer'
       GROUP BY t.id, t.name
       ORDER BY client_count DESC, t.name`
    ),
  "goal-progress": () =>
    timedQuery(
      `SELECT u.name,
              g.goal_type,
              g.target_value,
              g.current_value,
              g.unit,
              g.deadline,
              g.status,
              ROUND(LEAST(g.current_value / NULLIF(g.target_value, 0) * 100, 100), 1) AS progress_percent
       FROM goals g
       INNER JOIN users u ON u.id = g.user_id
       ORDER BY g.status, progress_percent DESC, g.deadline ASC`
    ),
  "frequent-exercises": () =>
    timedQuery(
      `SELECT e.id AS exercise_id, e.name, e.muscle_group,
              COUNT(se.session_id) AS times_performed,
              COALESCE(SUM(se.sets * se.reps), 0) AS total_reps
       FROM exercises e
       INNER JOIN session_exercises se ON se.exercise_id = e.id
       GROUP BY e.id, e.name, e.muscle_group
       ORDER BY times_performed DESC, e.name
       LIMIT 25`
    )
};

const statisticsFor = (key, rows) => {
  const numeric = (column) => rows.reduce((sum, row) => sum + (Number(row[column]) || 0), 0);
  switch (key) {
    case "weekly-workout-summary":
      return { totalSessions: numeric("sessions"), totalMinutes: numeric("total_minutes"), weeksCovered: rows.length };
    case "daily-nutrition-totals":
      return { daysCovered: rows.length, totalCalories: numeric("calories"), avgCaloriesPerDay: rows.length ? Math.round(numeric("calories") / rows.length) : 0 };
    case "average-sleep-per-user":
      return { usersCovered: rows.length, globalAvgSleep: rows.length ? Math.round((rows.reduce((sum, row) => sum + Number(row.avg_sleep_hours) * Number(row.log_days), 0) / rows.reduce((sum, row) => sum + Number(row.log_days), 0)) * 100) / 100 : 0 };
    case "active-workout-users":
      return { qualifyingUsers: rows.length, sessions: numeric("session_count"), minutes: numeric("total_minutes") };
    case "trainer-client-counts":
      return { trainers: rows.length, assignments: numeric("client_count") };
    case "goal-progress":
      return { goals: rows.length, completed: rows.filter((row) => row.status === "completed").length, avgProgress: rows.length ? Math.round((rows.reduce((sum, row) => sum + (Number(row.progress_percent) || 0), 0) / rows.length) * 10) / 10 : 0 };
    case "frequent-exercises":
      return { exercises: rows.length, totalPerformances: numeric("times_performed") };
    default:
      return {};
  }
};

router.get(
  "/reports/:reportKey",
  asyncHandler(async (req, res, next) => {
    const key = req.params.reportKey;
    const factory = reports[key];
    if (!factory) return next(notFound("Unknown report key."));

    const result = await factory();
    return ok(res, result.rows, {
      statistics: statisticsFor(key, result.rows),
      query: queryMeta(result)
    });
  })
);

export default router;
