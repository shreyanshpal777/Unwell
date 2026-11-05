import { Router } from "express";
import { pool } from "../config/db.js";
import { canAccessUser, requireAuth } from "../middlewares/auth.js";
import {
  asyncHandler,
  badRequest,
  collectFieldErrors,
  formatDate,
  forbidden,
  notFound,
  ok,
  parseDate,
  pgError,
  queryMeta,
  timedQuery,
  toNumber
} from "../utils/http.js";

const router = Router();

router.use(requireAuth);

async function loadSession(sessionId) {
  const { rows } = await pool.query("SELECT id, user_id FROM workout_sessions WHERE id = $1", [sessionId]);
  return rows[0];
}

async function assertAccess(req, targetUserId) {
  if (!(await canAccessUser(req, targetUserId))) throw forbidden("You do not have access to this training record.");
}

async function fetchExercises(sessionIds) {
  if (!sessionIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT session_id, exercise_id, sets, reps, weight_kg, e.name AS exercise_name
     FROM session_exercises se
     INNER JOIN exercises e ON e.id = se.exercise_id
     WHERE se.session_id = ANY($1)
     ORDER BY e.name`,
    [sessionIds]
  );
  const grouped = new Map();
  for (const row of rows) {
    const key = Number(row.session_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      exerciseId: Number(row.exercise_id),
      name: row.exercise_name,
      sets: row.sets,
      reps: row.reps,
      weightKg: row.weight_kg === null ? null : Number(row.weight_kg)
    });
  }
  return grouped;
}

function mapSession(row, exercises) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name ?? undefined,
    date: formatDate(row.session_date),
    title: row.title,
    name: row.title || exercises?.[0]?.name || "Workout session",
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    exercises: exercises ?? [],
    exerciseCount: (exercises ?? []).length,
    createdAt: row.created_at
  };
}

function workoutValidators(body, { partial = false } = {}) {
  const errors = collectFieldErrors({
    date: () => {
      if (partial && body.date === undefined) return null;
      const fieldErrors = {};
      parseDate(body.date, "date", fieldErrors);
      return fieldErrors.date ?? null;
    },
    durationMinutes: () => {
      if (partial && body.durationMinutes === undefined) return null;
      const value = toNumber(body.durationMinutes);
      if (value === null) return null;
      if (Number.isNaN(value) || !Number.isInteger(value) || value < 1 || value > 1440) return "Duration must be between 1 and 1440 minutes.";
      return null;
    },
    exercises: () => {
      if (partial && body.exercises === undefined) return null;
      if (!Array.isArray(body.exercises) || body.exercises.length === 0) return "Add at least one exercise to the session.";
      if (body.exercises.length > 30) return "A session can contain at most 30 exercises.";
      for (const item of body.exercises) {
        if (!item || !Number.isFinite(Number(item.exerciseId))) return "Each row needs a valid exercise.";
        const sets = Number(item.sets);
        const reps = Number(item.reps);
        const weight = item.weightKg === undefined || item.weightKg === null || item.weightKg === "" ? null : Number(item.weightKg);
        if (!Number.isInteger(sets) || sets < 1 || sets > 100) return "Sets must be between 1 and 100.";
        if (!Number.isInteger(reps) || reps < 1 || reps > 10000) return "Reps must be between 1 and 10000.";
        if (weight !== null && (!Number.isFinite(weight) || weight < 0)) return "Weight must be zero or greater.";
      }
      return null;
    }
  });
  return errors;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to, q, page = 1, limit = 20, clientId } = req.query;
    const params = [];
    const conditions = [];

    if (req.user.role === "admin" && clientId) {
      params.push(Number(clientId));
      conditions.push(`ws.user_id = $${params.length}`);
    } else if (req.user.role === "trainer" && clientId) {
      const allowed = await canAccessUser(req, Number(clientId));
      if (!allowed) throw forbidden("This client is not assigned to you.");
      params.push(Number(clientId));
      conditions.push(`ws.user_id = $${params.length}`);
    } else if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`ws.user_id = $${params.length}`);
    }

    if (from) {
      params.push(from);
      conditions.push(`ws.session_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ws.session_date <= $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      conditions.push(`(LOWER(ws.title) LIKE $${params.length} OR LOWER(COALESCE(ws.notes, '')) LIKE $${params.length})`);
    }

    const limitValue = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `SELECT ws.id, ws.user_id, ws.title, ws.session_date, ws.duration_minutes, ws.notes, ws.created_at, u.name AS user_name
       FROM workout_sessions ws
       INNER JOIN users u ON u.id = ws.user_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ws.session_date DESC, ws.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const grouped = await fetchExercises(result.rows.map((row) => row.id));
    return ok(
      res,
      result.rows.map((row) => mapSession(row, grouped.get(Number(row.id)) ?? [])),
      { query: queryMeta(result) }
    );
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const session = await loadSession(req.params.id);
    if (!session) return next(notFound("Workout session not found."));
    await assertAccess(req, session.user_id);

    const { rows } = await pool.query(
      `SELECT id, user_id, title, session_date, duration_minutes, notes, created_at
       FROM workout_sessions WHERE id = $1`,
      [req.params.id]
    );
    const grouped = await fetchExercises([rows[0].id]);
    return ok(res, mapSession(rows[0], grouped.get(Number(rows[0].id)) ?? []));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = workoutValidators(body);
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO workout_sessions (user_id, title, session_date, duration_minutes, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, title, session_date, duration_minutes, notes, created_at`,
        [req.user.id, body.title ? String(body.title).trim() : null, body.date, body.durationMinutes, body.notes ? String(body.notes).trim() : null]
      );
      const session = rows[0];
      for (const item of body.exercises) {
        await client.query(
          "INSERT INTO session_exercises (session_id, exercise_id, sets, reps, weight_kg) VALUES ($1, $2, $3, $4, $5)",
          [session.id, item.exerciseId, item.sets, item.reps, item.weightKg === undefined || item.weightKg === "" ? null : item.weightKg]
        );
      }
      await client.query("COMMIT");
      const grouped = await fetchExercises([session.id]);
      return res.status(201).json({
        data: mapSession(session, grouped.get(Number(session.id)) ?? []),
        meta: { requestId: res.locals.requestId }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return pgError(error, next);
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const existing = await loadSession(req.params.id);
    if (!existing) return next(notFound("Workout session not found."));
    await assertAccess(req, existing.user_id);

    const body = req.body ?? {};
    const errors = workoutValidators(body, { partial: true });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fields = [];
      const params = [];
      const update = {
        date: ["session_date", () => body.date],
        durationMinutes: ["duration_minutes", () => body.durationMinutes],
        title: ["title", () => (body.title ? String(body.title).trim() : null)],
        notes: ["notes", () => (body.notes ? String(body.notes).trim() : null)]
      };
      for (const [key, [column, value]] of Object.entries(update)) {
        if (body[key] !== undefined) {
          params.push(value());
          fields.push(`${column} = $${params.length}`);
        }
      }
      params.push(req.params.id);
      const { rows } = await client.query(
        `UPDATE workout_sessions SET ${fields.length ? `${fields.join(", ")}, ` : ""}updated_at = CURRENT_TIMESTAMP
         WHERE id = $${params.length}
         RETURNING id, user_id, title, session_date, duration_minutes, notes, created_at`,
        params
      );
      if (Array.isArray(body.exercises)) {
        await client.query("DELETE FROM session_exercises WHERE session_id = $1", [req.params.id]);
        for (const item of body.exercises) {
          await client.query(
            "INSERT INTO session_exercises (session_id, exercise_id, sets, reps, weight_kg) VALUES ($1, $2, $3, $4, $5)",
            [req.params.id, item.exerciseId, item.sets, item.reps, item.weightKg === undefined || item.weightKg === "" ? null : item.weightKg]
          );
        }
      }
      await client.query("COMMIT");
      const grouped = await fetchExercises([rows[0].id]);
      return ok(res, mapSession(rows[0], grouped.get(Number(rows[0].id)) ?? []));
    } catch (error) {
      await client.query("ROLLBACK");
      return pgError(error, next);
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res, next) => {
    const session = await loadSession(req.params.id);
    if (!session) return next(notFound("Workout session not found."));
    await assertAccess(req, session.user_id);

    const { rows } = await pool.query("DELETE FROM workout_sessions WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows[0]) return next(notFound("Workout session not found."));
    return ok(res, { id: Number(rows[0].id), deleted: true });
  })
);

export default router;
