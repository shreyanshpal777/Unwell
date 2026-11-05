import { Router } from "express";
import { pool } from "../config/db.js";
import { canAccessUser, requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, forbidden, notFound, ok, queryMeta, timedQuery, formatDate } from "../utils/http.js";

const router = Router();

router.use(requireAuth);

const LEVEL_LABELS = { sedentary: "Sedentary", light: "Light", moderate: "Moderate", high: "High", very_high: "Very high" };

router.get(
  "/trainers",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const result = await timedQuery(
      `SELECT id, name, email
       FROM users
       WHERE role = 'trainer' AND is_active = TRUE
       ORDER BY name`
    );
    return ok(
      res,
      result.rows.map((row) => ({ id: Number(row.id), name: row.name, email: row.email, role: "trainer" })),
      { query: queryMeta(result) }
    );
  })
);

router.get(
  "/trainer/clients",
  requireRole("trainer"),
  asyncHandler(async (req, res) => {
    const result = await timedQuery(
      `SELECT u.id, u.name, u.email, u.fitness_goal, u.activity_level,
              (SELECT MAX(ws.session_date) FROM workout_sessions ws WHERE ws.user_id = u.id) AS last_workout,
              (SELECT COUNT(*) FROM workout_sessions ws WHERE ws.user_id = u.id AND ws.session_date >= CURRENT_DATE - INTERVAL '6 days') AS workouts_this_week,
              (SELECT ROUND(AVG(LEAST(g.current_value / NULLIF(g.target_value, 0) * 100, 100)))
                 FROM goals g WHERE g.user_id = u.id AND g.status = 'active') AS goal_progress
       FROM users u
       INNER JOIN trainer_clients tc ON tc.client_id = u.id
       WHERE tc.trainer_id = $1 AND u.is_active = TRUE
       ORDER BY u.name`,
      [req.user.id]
    );

    const rows = result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      goal: row.fitness_goal || "General wellness",
      level: LEVEL_LABELS[row.activity_level] ?? "—",
      last: row.last_workout
        ? new Date(row.last_workout).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
        : "No sessions",
      progress: row.goal_progress === null ? "—" : `${row.goal_progress}%`,
      progressValue: row.goal_progress === null ? 0 : Number(row.goal_progress),
      workoutsThisWeek: Number(row.workouts_this_week)
    }));

    return ok(res, rows, { query: queryMeta(result) });
  })
);

router.get(
  "/trainer/clients/:clientId/overview",
  requireRole("trainer"),
  asyncHandler(async (req, res, next) => {
    const clientId = Number(req.params.clientId);
    if (!(await canAccessUser(req, clientId))) throw forbidden("This client is not assigned to you.");

    const profileResult = await timedQuery(
      "SELECT id, name, email, fitness_goal, activity_level FROM users WHERE id = $1 AND is_active = TRUE",
      [clientId]
    );
    if (!profileResult.rows[0]) return next(notFound("Client not found."));

    const workoutResult = await timedQuery(
      `SELECT COUNT(*) AS sessions,
              COALESCE(SUM(duration_minutes), 0) AS minutes,
              MAX(session_date) AS last_workout
       FROM workout_sessions WHERE user_id = $1`,
      [clientId]
    );
    const nutritionResult = await timedQuery(
      `SELECT COALESCE(SUM(ROUND(fi.calories_per_100g * nl.quantity_grams / 100)), 0) AS calories
       FROM nutrition_logs nl
       INNER JOIN food_items fi ON fi.id = nl.food_id
       WHERE nl.user_id = $1 AND nl.consumed_date >= CURRENT_DATE - INTERVAL '6 days'`,
      [clientId]
    );
    const wellnessResult = await timedQuery(
      `SELECT AVG(sleep_hours) AS avg_sleep, AVG(water_liters) AS avg_water
       FROM wellness_logs
       WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '6 days'`,
      [clientId]
    );
    const goalResult = await timedQuery(
      `SELECT COUNT(*) FILTER (WHERE status = 'active') AS active_goals,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed_goals
       FROM goals WHERE user_id = $1`,
      [clientId]
    );

    const profile = profileResult.rows[0];
    return ok(res, {
      client: {
        id: Number(profile.id),
        name: profile.name,
        email: profile.email,
        goal: profile.fitness_goal || "General wellness",
        activityLevel: LEVEL_LABELS[profile.activity_level] ?? "—"
      },
      workouts: {
        sessions: Number(workoutResult.rows[0].sessions),
        minutes: Number(workoutResult.rows[0].minutes),
        lastWorkout: workoutResult.rows[0].last_workout
          ? formatDate(workoutResult.rows[0].last_workout)
          : null
      },
      nutrition: { caloriesLast7Days: Number(nutritionResult.rows[0].calories) },
      wellness: {
        avgSleep: wellnessResult.rows[0].avg_sleep === null ? null : Math.round(Number(wellnessResult.rows[0].avg_sleep) * 10) / 10,
        avgWater: wellnessResult.rows[0].avg_water === null ? null : Math.round(Number(wellnessResult.rows[0].avg_water) * 10) / 10
      },
      goals: {
        active: Number(goalResult.rows[0].active_goals),
        completed: Number(goalResult.rows[0].completed_goals)
      },
      query: queryMeta(profileResult)
    });
  })
);

export default router;
