import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, ok, queryMeta, timedQuery } from "../utils/http.js";

const router = Router();

router.use(requireAuth, requireRole("user"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const summaryResult = await timedQuery(
      `SELECT
         COUNT(*) FILTER (WHERE ws.session_date >= CURRENT_DATE - INTERVAL '6 days') AS workouts_this_week,
         COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.session_date >= CURRENT_DATE - INTERVAL '6 days'), 0) AS exercise_minutes,
         (SELECT COALESCE(SUM(ROUND(fi.calories_per_100g * nl.quantity_grams / 100)), 0)
            FROM nutrition_logs nl
            INNER JOIN food_items fi ON fi.id = nl.food_id
           WHERE nl.user_id = $1 AND nl.consumed_date = CURRENT_DATE) AS today_calories,
         (SELECT COUNT(*) FROM goals g WHERE g.user_id = $1 AND g.status = 'active') AS active_goals,
         (SELECT COUNT(*) FROM goals g WHERE g.user_id = $1 AND g.status = 'active' AND g.current_value >= g.target_value) AS goals_on_track
       FROM workout_sessions ws
       WHERE ws.user_id = $1`,
      [userId]
    );

    const weeklyResult = await timedQuery(
      `SELECT to_char(d.day, 'Dy') AS day,
              COALESCE(ws.minutes, 0) AS minutes,
              COALESCE(wl.sleep, 0) AS sleep
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN (
         SELECT session_date, SUM(duration_minutes) AS minutes
         FROM workout_sessions
         WHERE user_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY session_date
       ) ws ON ws.session_date = d.day::date
       LEFT JOIN (
         SELECT log_date, AVG(sleep_hours) AS sleep
         FROM wellness_logs
         WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY log_date
       ) wl ON wl.log_date = d.day::date
       ORDER BY d.day`,
      [userId]
    );

    const recentResult = await timedQuery(
      `SELECT ws.id, ws.title, ws.session_date, ws.duration_minutes,
              (SELECT COUNT(*) FROM session_exercises se WHERE se.session_id = ws.id) AS exercise_count,
              (SELECT e.name FROM session_exercises se INNER JOIN exercises e ON e.id = se.exercise_id
                WHERE se.session_id = ws.id ORDER BY e.name LIMIT 1) AS first_exercise
       FROM workout_sessions ws
       WHERE ws.user_id = $1
       ORDER BY ws.session_date DESC, ws.id DESC
       LIMIT 5`,
      [userId]
    );

    const nutritionResult = await timedQuery(
      `SELECT COALESCE(SUM(ROUND(fi.calories_per_100g * nl.quantity_grams / 100)), 0) AS calories,
              COALESCE(SUM(ROUND(fi.protein_per_100g * nl.quantity_grams / 100)), 0) AS protein,
              COALESCE(SUM(ROUND(fi.carbs_per_100g * nl.quantity_grams / 100)), 0) AS carbs,
              COALESCE(SUM(ROUND(fi.fat_per_100g * nl.quantity_grams / 100)), 0) AS fat
       FROM nutrition_logs nl
       INNER JOIN food_items fi ON fi.id = nl.food_id
       WHERE nl.user_id = $1 AND nl.consumed_date = CURRENT_DATE`,
      [userId]
    );

    const wellnessResult = await timedQuery(
      `SELECT sleep_hours, water_liters, mood
       FROM wellness_logs
       WHERE user_id = $1 AND log_date = CURRENT_DATE`,
      [userId]
    );

    const goalsResult = await timedQuery(
      `SELECT id, goal_type, target_value, current_value, unit, deadline, status
       FROM goals
       WHERE user_id = $1 AND status = 'active'
       ORDER BY deadline ASC
       LIMIT 4`,
      [userId]
    );

    const summary = summaryResult.rows[0];
    const wellness = wellnessResult.rows[0];

    return ok(res, {
      summary: {
        workoutsThisWeek: Number(summary.workouts_this_week),
        exerciseMinutes: Number(summary.exercise_minutes),
        todayCalories: Number(summary.today_calories),
        activeGoals: Number(summary.active_goals),
        goalsOnTrack: Number(summary.goals_on_track)
      },
      weeklyActivity: weeklyResult.rows.map((row) => ({
        day: row.day,
        minutes: Number(row.minutes),
        sleep: Math.round(Number(row.sleep) * 10) / 10
      })),
      recentWorkouts: recentResult.rows.map((row) => ({
        id: Number(row.id),
        name: row.title || row.first_exercise || "Workout session",
        date: new Date(row.session_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
        duration: `${row.duration_minutes} min`,
        exercises: Number(row.exercise_count)
      })),
      nutrition: {
        calories: Number(nutritionResult.rows[0].calories),
        protein: Number(nutritionResult.rows[0].protein),
        carbs: Number(nutritionResult.rows[0].carbs),
        fat: Number(nutritionResult.rows[0].fat)
      },
      wellness: wellness
        ? {
            sleepHours: Number(wellness.sleep_hours),
            waterLiters: Number(wellness.water_liters),
            mood: wellness.mood
          }
        : null,
      goals: goalsResult.rows.map((row) => ({
        id: Number(row.id),
        goalType: row.goal_type,
        name: { weekly_workout_minutes: "Weekly workout minutes", daily_water_intake: "Daily water intake", target_body_weight: "Target body weight" }[row.goal_type] ?? row.goal_type,
        current: Number(row.current_value),
        target: Number(row.target_value),
        unit: row.unit === "minutes" ? "min" : row.unit === "liters" ? "L" : row.unit,
        deadline: new Date(row.deadline).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
      })),
      query: queryMeta(summaryResult)
    });
  })
);

export default router;
