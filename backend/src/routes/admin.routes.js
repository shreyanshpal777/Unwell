import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, badRequest, collectFieldErrors, conflict, notFound, ok, pgError, queryMeta, timedQuery, toNumber } from "../utils/http.js";

const router = Router();

const ROLES = ["user", "trainer", "admin"];
const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "high", "very_high"];

router.use(requireAuth, requireRole("admin"));

const mapUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.email,
  role: row.role,
  goal: row.fitness_goal || "—",
  activityLevel: row.activity_level,
  isActive: row.is_active,
  joined: new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
  createdAt: row.created_at
});

router.get(
  "/admin/stats",
  asyncHandler(async (_req, res) => {
    const result = await timedQuery(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM users WHERE role = 'user' AND is_active) AS active_users,
         (SELECT COUNT(*) FROM users WHERE role = 'trainer' AND is_active) AS active_trainers,
         (SELECT COUNT(*) FROM workout_sessions) AS total_workouts,
         (SELECT COUNT(*) FROM exercises WHERE is_active) AS active_exercises,
         (SELECT COUNT(*) FROM food_items WHERE is_active) AS active_foods,
         (SELECT COUNT(*) FROM trainer_clients) AS assignments`
    );
    const row = result.rows[0];
    return ok(
      res,
      {
        totalUsers: Number(row.total_users),
        activeUsers: Number(row.active_users),
        activeTrainers: Number(row.active_trainers),
        totalWorkouts: Number(row.total_workouts),
        activeExercises: Number(row.active_exercises),
        activeFoods: Number(row.active_foods),
        assignments: Number(row.assignments)
      },
      { query: queryMeta(result) }
    );
  })
);

router.get(
  "/admin/users",
  asyncHandler(async (req, res) => {
    const { q, role, page = 1, limit = 50 } = req.query;
    const params = [];
    const conditions = [];

    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      conditions.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
    }
    if (role && ROLES.includes(role)) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }

    const limitValue = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limitValue;
    params.push(limitValue, offset);

    const result = await timedQuery(
      `SELECT u.id, u.name, u.email, u.role, u.fitness_goal, u.activity_level, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM trainer_clients tc WHERE tc.client_id = u.id) AS trainer_count
       FROM users u
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM users u ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
      params.slice(0, -2)
    );
    return ok(
      res,
      result.rows.map((row) => ({ ...mapUser(row), trainerAssignments: Number(row.trainer_count) })),
      { query: queryMeta(result), total: Number(totalResult.rows[0].count) }
    );
  })
);

router.post(
  "/admin/users",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = collectFieldErrors({
      name: () => (typeof body.name === "string" && body.name.trim().length >= 2 ? null : "Enter a full name."),
      email: () =>
        typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())
          ? null
          : "Enter a valid email address.",
      password: () => (typeof body.password === "string" && body.password.length >= 8 ? null : "Password must be at least 8 characters."),
      role: () => (ROLES.includes(body.role) ? null : "Role must be user, trainer, or admin."),
      activityLevel: () => {
        if (body.activityLevel === undefined || body.activityLevel === null || body.activityLevel === "") return null;
        return ACTIVITY_LEVELS.includes(body.activityLevel) ? null : "Unsupported activity level.";
      }
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    try {
      const hash = await bcrypt.hash(String(body.password), 10);
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, activity_level, fitness_goal)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, role, fitness_goal, activity_level, is_active, created_at`,
        [
          String(body.name).trim(),
          String(body.email).trim().toLowerCase(),
          hash,
          body.role,
          body.activityLevel || null,
          body.fitnessGoal ? String(body.fitnessGoal).trim() : null
        ]
      );
      return res.status(201).json({ data: mapUser(rows[0]), meta: { requestId: res.locals.requestId } });
    } catch (error) {
      if (error.code === "23505") throw conflict("An account with that email already exists.", { email: "This email is already registered." });
      return pgError(error, next);
    }
  })
);

router.patch(
  "/admin/users/:id",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = collectFieldErrors({
      role: () => {
        if (body.role === undefined) return null;
        return ROLES.includes(body.role) ? null : "Role must be user, trainer, or admin.";
      },
      name: () => {
        if (body.name === undefined) return null;
        return String(body.name).trim().length >= 2 ? null : "Enter a valid name.";
      },
      email: () => {
        if (body.email === undefined) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim()) ? null : "Enter a valid email address.";
      },
      activityLevel: () => {
        if (body.activityLevel === undefined || body.activityLevel === null || body.activityLevel === "") return null;
        return ACTIVITY_LEVELS.includes(body.activityLevel) ? null : "Unsupported activity level.";
      },
      fitnessGoal: () => {
        if (body.fitnessGoal === undefined) return null;
        return String(body.fitnessGoal).length <= 160 ? null : "Fitness goal is too long.";
      },
      heightCm: () => {
        if (body.heightCm === undefined || body.heightCm === null || body.heightCm === "") return null;
        const value = toNumber(body.heightCm);
        return !Number.isNaN(value) && value >= 50 && value <= 300 ? null : "Height must be between 50 and 300 cm.";
      },
      weightKg: () => {
        if (body.weightKg === undefined || body.weightKg === null || body.weightKg === "") return null;
        const value = toNumber(body.weightKg);
        return !Number.isNaN(value) && value >= 20 && value <= 500 ? null : "Weight must be between 20 and 500 kg.";
      }
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const mapping = {
      name: ["name", () => String(body.name).trim()],
      email: ["email", () => String(body.email).trim().toLowerCase()],
      role: ["role", () => body.role],
      activityLevel: ["activity_level", () => body.activityLevel],
      fitnessGoal: ["fitness_goal", () => (body.fitnessGoal ? String(body.fitnessGoal).trim() : null)],
      heightCm: ["height_cm", () => toNumber(body.heightCm)],
      weightKg: ["weight_kg", () => toNumber(body.weightKg)],
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
    try {
      const { rows } = await pool.query(
        `UPDATE users SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}
         RETURNING id, name, email, role, fitness_goal, activity_level, is_active, created_at`,
        params
      );
      if (!rows[0]) return next(notFound("User not found."));
      return ok(res, mapUser(rows[0]));
    } catch (error) {
      if (error.code === "23505") throw conflict("That email is already in use.", { email: "This email is already registered." });
      return pgError(error, next);
    }
  })
);

router.delete(
  "/admin/users/:id",
  asyncHandler(async (req, res, next) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest("You cannot delete your own account.");

    const { rows } = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
    if (!rows[0]) return next(notFound("User not found."));

    const dependencyResult = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM workout_sessions WHERE user_id = $1) AS workouts,
         (SELECT COUNT(*) FROM nutrition_logs WHERE user_id = $1) AS nutrition,
         (SELECT COUNT(*) FROM wellness_logs WHERE user_id = $1) AS wellness,
         (SELECT COUNT(*) FROM goals WHERE user_id = $1) AS goals`,
      [id]
    );
    const deps = dependencyResult.rows[0];
    const total = Number(deps.workouts) + Number(deps.nutrition) + Number(deps.wellness) + Number(deps.goals);
    if (total > 0) {
      throw conflict(
        `This account owns ${total} health record${total === 1 ? "" : "s"} and cannot be deleted. Deactivate the account instead.`,
        { dependencies: "Deactivate this account instead of deleting it." }
      );
    }

    try {
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return ok(res, { id, deleted: true });
    } catch (error) {
      return pgError(error, next);
    }
  })
);

router.get(
  "/admin/trainer-assignments",
  asyncHandler(async (_req, res) => {
    const result = await timedQuery(
      `SELECT tc.trainer_id, tc.client_id, tc.assigned_at,
              t.name AS trainer_name, c.name AS client_name, c.email AS client_email, c.fitness_goal,
              (SELECT MAX(ws.session_date) FROM workout_sessions ws WHERE ws.user_id = c.id) AS last_workout
       FROM trainer_clients tc
       INNER JOIN users t ON t.id = tc.trainer_id
       INNER JOIN users c ON c.id = tc.client_id
       ORDER BY t.name, c.name`
    );
    return ok(
      res,
      result.rows.map((row) => ({
        trainerId: Number(row.trainer_id),
        clientId: Number(row.client_id),
        trainerName: row.trainer_name,
        clientName: row.client_name,
        clientEmail: row.client_email,
        goal: row.fitness_goal || "—",
        name: row.client_name,
        last: row.last_workout
          ? new Date(row.last_workout).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
          : "No sessions",
        assignedAt: row.assigned_at
      })),
      { query: queryMeta(result) }
    );
  })
);

router.post(
  "/admin/trainer-assignments",
  asyncHandler(async (req, res, next) => {
    const trainerId = Number(req.body?.trainerId);
    const clientId = Number(req.body?.clientId);
    const errors = collectFieldErrors({
      trainerId: () => (Number.isFinite(trainerId) && trainerId > 0 ? null : "Select a trainer."),
      clientId: () => (Number.isFinite(clientId) && clientId > 0 ? null : "Select a client.")
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT id, role FROM users WHERE id IN ($1, $2) FOR UPDATE",
        [trainerId, clientId]
      );
      const trainer = rows.find((row) => Number(row.id) === trainerId);
      const user = rows.find((row) => Number(row.id) === clientId);
      if (!trainer || !user) {
        await client.query("ROLLBACK");
        throw notFound("Both a trainer and a client must exist.");
      }
      if (trainer.role !== "trainer") {
        await client.query("ROLLBACK");
        throw badRequest("The selected user is not a trainer.", { trainerId: "Choose a user with the trainer role." });
      }
      if (user.role !== "user") {
        await client.query("ROLLBACK");
        throw badRequest("Clients must have the user role.", { clientId: "Choose a user with the user role." });
      }
      if (trainerId === clientId) {
        await client.query("ROLLBACK");
        throw badRequest("A trainer cannot be assigned to themselves.", { clientId: "Choose a different client." });
      }

      const inserted = await client.query(
        `INSERT INTO trainer_clients (trainer_id, client_id) VALUES ($1, $2)
         ON CONFLICT (trainer_id, client_id) DO NOTHING
         RETURNING trainer_id, client_id, assigned_at`,
        [trainerId, clientId]
      );
      await client.query("COMMIT");
      if (!inserted.rows[0]) throw conflict("That assignment already exists.");
      return res.status(201).json({
        data: { trainerId, clientId, assignedAt: inserted.rows[0].assigned_at },
        meta: { requestId: res.locals.requestId }
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return error.status ? next(error) : pgError(error, next);
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/admin/trainer-assignments/:trainerId/:clientId",
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      "DELETE FROM trainer_clients WHERE trainer_id = $1 AND client_id = $2 RETURNING trainer_id",
      [req.params.trainerId, req.params.clientId]
    );
    if (!rows[0]) return next(notFound("Assignment not found."));
    return ok(res, { trainerId: Number(rows[0].trainer_id), removed: true });
  })
);

router.get(
  "/admin/database-schema",
  asyncHandler(async (_req, res) => {
    const tablesResult = await timedQuery(
      `SELECT c.relname AS table_name,
              obj_description(c.oid) AS table_comment
       FROM pg_class c
       INNER JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`
    );

    const columnsResult = await pool.query(
      `SELECT table_name, column_name, data_type,
              is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );

    const pkResult = await pool.query(
      `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       INNER JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY tc.table_name, kcu.ordinal_position`
    );

    const fkResult = await pool.query(
      `SELECT tc.table_name, kcu.column_name,
              ccu.table_name AS referenced_table, ccu.column_name AS referenced_column,
              rc.delete_rule
       FROM information_schema.table_constraints tc
       INNER JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       INNER JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       INNER JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
       ORDER BY tc.table_name, kcu.column_name`
    );

    const uniqueResult = await pool.query(
      `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       INNER JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
       ORDER BY tc.table_name, kcu.ordinal_position`
    );

    const tables = tablesResult.rows.map((table) => ({
      name: table.table_name,
      columns: columnsResult.rows
        .filter((column) => column.table_name === table.table_name)
        .map((column) => ({
          name: column.column_name,
          type: column.data_type,
          length: column.character_maximum_length,
          nullable: column.is_nullable === "YES",
          default: column.column_default,
          primaryKey: pkResult.rows.some((pk) => pk.table_name === table.table_name && pk.column_name === column.column_name),
          unique: uniqueResult.rows.some((uq) => uq.table_name === table.table_name && uq.column_name === column.column_name),
          foreignKey: fkResult.rows
            .filter((fk) => fk.table_name === table.table_name && fk.column_name === column.column_name)
            .map((fk) => ({ table: fk.referenced_table, column: fk.referenced_column, onDelete: fk.delete_rule }))
        })),
      primaryKey: pkResult.rows.filter((pk) => pk.table_name === table.table_name).map((pk) => pk.column_name),
      constraints: fkResult.rows
        .filter((fk) => fk.table_name === table.table_name)
        .map((fk) => ({
          column: fk.column_name,
          references: `${fk.referenced_table}.${fk.referenced_column}`,
          onDelete: fk.delete_rule
        }))
    }));

    const relationshipCount = fkResult.rows.length;
    return ok(
      res,
      {
        tableCount: tables.length,
        relationshipCount,
        tables
      },
      { query: queryMeta(tablesResult) }
    );
  })
);

export default router;
