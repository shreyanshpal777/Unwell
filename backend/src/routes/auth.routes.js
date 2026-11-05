import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../config/db.js";
import { clearSessionCookie, requireAuth, setSessionCookie, signToken } from "../middlewares/auth.js";
import {
  asyncHandler,
  badRequest,
  collectFieldErrors,
  conflict,
  formatDate,
  notFound,
  ok,
  parseDate,
  pgError,
  toNumber
} from "../utils/http.js";

const router = Router();

const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "high", "very_high"];

const safeUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.email,
  role: row.role,
  heightCm: row.height_cm === null ? null : Number(row.height_cm),
  weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
  dateOfBirth: row.date_of_birth ? formatDate(row.date_of_birth) : null,
  fitnessGoal: row.fitness_goal,
  activityLevel: row.activity_level,
  isActive: row.is_active,
  joinedAt: row.created_at
});

router.post(
  "/register",
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = collectFieldErrors({
      name: () => (typeof body.name === "string" && body.name.trim().length >= 2 ? null : "Enter your full name."),
      email: () =>
        typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
          ? null
          : "Enter a valid email address.",
      password: () => (typeof body.password === "string" && body.password.length >= 8 ? null : "Password must be at least 8 characters."),
      activityLevel: () =>
        body.activityLevel === undefined || body.activityLevel === null || body.activityLevel === "" || ACTIVITY_LEVELS.includes(body.activityLevel)
          ? null
          : "Choose a supported activity level.",
      heightCm: () => {
        const height = toNumber(body.heightCm);
        if (height === null) return null;
        if (Number.isNaN(height)) return "Height must be a number.";
        return height >= 50 && height <= 300 ? null : "Height must be between 50 and 300 cm.";
      },
      weightKg: () => {
        const weight = toNumber(body.weightKg);
        if (weight === null) return null;
        if (Number.isNaN(weight)) return "Weight must be a number.";
        return weight >= 20 && weight <= 500 ? null : "Weight must be between 20 and 500 kg.";
      },
      fitnessGoal: () =>
        body.fitnessGoal === undefined || body.fitnessGoal === null || String(body.fitnessGoal).length <= 160
          ? null
          : "Fitness goal is too long.",
      dateOfBirth: () => {
        if (!body.dateOfBirth) return null;
        const fieldErrors = {};
        parseDate(body.dateOfBirth, "dateOfBirth", fieldErrors);
        return fieldErrors.dateOfBirth ?? null;
      }
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const email = String(body.email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(String(body.password), 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, height_cm, weight_kg, date_of_birth, fitness_goal, activity_level, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user')
         RETURNING id, name, email, role, height_cm, weight_kg, date_of_birth, fitness_goal, activity_level, is_active, created_at`,
        [
          String(body.name).trim(),
          email,
          passwordHash,
          toNumber(body.heightCm),
          toNumber(body.weightKg),
          body.dateOfBirth || null,
          body.fitnessGoal ? String(body.fitnessGoal).trim() : null,
          body.activityLevel || null
        ]
      );
      const user = safeUser(rows[0]);
      setSessionCookie(res, signToken(user));
      return res.status(201).json({ data: { user }, meta: { requestId: res.locals.requestId } });
    } catch (error) {
      if (error.code === "23505") throw conflict("An account with that email already exists.", { email: "This email is already registered." });
      return pgError(error, next);
    }
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const errors = collectFieldErrors({
      email: () => (typeof body.email === "string" && body.email.trim() ? null : "Enter your email address."),
      password: () => (typeof body.password === "string" && body.password ? null : "Enter your password.")
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const email = String(body.email).trim().toLowerCase();
    const { rows } = await pool.query(
      `SELECT id, name, email, role, password_hash, height_cm, weight_kg, date_of_birth,
              fitness_goal, activity_level, is_active, created_at
       FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];
    const valid = user && (await bcrypt.compare(String(body.password), user.password_hash));
    if (!valid) throw badRequest("Email or password is incorrect.", { password: "Email or password is incorrect." });
    if (!user.is_active) throw badRequest("This account has been deactivated.", { email: "Contact an administrator to reactivate this account." });

    setSessionCookie(res, signToken(user));
    return ok(res, { user: safeUser(user) });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, height_cm, weight_kg, date_of_birth, fitness_goal, activity_level, is_active, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return next(notFound("User not found."));
    return ok(res, { user: safeUser(rows[0]) });
  })
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res, next) => {
    const body = req.body ?? {};
    const errors = collectFieldErrors({
      name: () => {
        if (body.name === undefined) return null;
        return typeof body.name === "string" && body.name.trim().length >= 2 ? null : "Enter your full name.";
      },
      email: () => {
        if (body.email === undefined) return null;
        return typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? null : "Enter a valid email address.";
      },
      activityLevel: () => {
        if (body.activityLevel === undefined || body.activityLevel === null || body.activityLevel === "") return null;
        return ACTIVITY_LEVELS.includes(body.activityLevel) ? null : "Choose a supported activity level.";
      },
      heightCm: () => {
        if (body.heightCm === undefined || body.heightCm === null || body.heightCm === "") return null;
        const height = toNumber(body.heightCm);
        return !Number.isNaN(height) && height >= 50 && height <= 300 ? null : "Height must be between 50 and 300 cm.";
      },
      weightKg: () => {
        if (body.weightKg === undefined || body.weightKg === null || body.weightKg === "") return null;
        const weight = toNumber(body.weightKg);
        return !Number.isNaN(weight) && weight >= 20 && weight <= 500 ? null : "Weight must be between 20 and 500 kg.";
      },
      fitnessGoal: () => {
        if (body.fitnessGoal === undefined || body.fitnessGoal === null) return null;
        return String(body.fitnessGoal).length <= 160 ? null : "Fitness goal is too long.";
      },
      dateOfBirth: () => {
        if (body.dateOfBirth === undefined || body.dateOfBirth === null || body.dateOfBirth === "") return null;
        const fieldErrors = {};
        parseDate(body.dateOfBirth, "dateOfBirth", fieldErrors);
        if (fieldErrors.dateOfBirth) return fieldErrors.dateOfBirth;
        return body.dateOfBirth <= new Date().toISOString().slice(0, 10) ? null : "Date of birth cannot be in the future.";
      },
      newPassword: () => {
        if (body.newPassword === undefined || body.newPassword === null || body.newPassword === "") return null;
        return typeof body.newPassword === "string" && body.newPassword.length >= 8 ? null : "Password must be at least 8 characters.";
      },
      currentPassword: () => {
        if (body.newPassword === undefined || body.newPassword === null || body.newPassword === "") return null;
        return typeof body.currentPassword === "string" && body.currentPassword ? null : "Enter your current password to change it.";
      }
    });
    if (errors) throw badRequest("Please correct the highlighted fields.", errors);

    const fields = [];
    const params = [];
    const assign = (column, value) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };

    if (body.name !== undefined) assign("name", String(body.name).trim());
    if (body.email !== undefined) assign("email", String(body.email).trim().toLowerCase());
    if (body.heightCm !== undefined) assign("height_cm", body.heightCm === null || body.heightCm === "" ? null : toNumber(body.heightCm));
    if (body.weightKg !== undefined) assign("weight_kg", body.weightKg === null || body.weightKg === "" ? null : toNumber(body.weightKg));
    if (body.dateOfBirth !== undefined) assign("date_of_birth", body.dateOfBirth === null || body.dateOfBirth === "" ? null : body.dateOfBirth);
    if (body.fitnessGoal !== undefined) assign("fitness_goal", body.fitnessGoal ? String(body.fitnessGoal).trim() : null);
    if (body.activityLevel !== undefined) assign("activity_level", body.activityLevel || null);

    if (body.newPassword) {
      const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
      const valid = rows[0] && (await bcrypt.compare(String(body.currentPassword), rows[0].password_hash));
      if (!valid) throw badRequest("Your current password is incorrect.", { currentPassword: "Your current password is incorrect." });
      assign("password_hash", await bcrypt.hash(String(body.newPassword), 10));
    }

    if (!fields.length) throw badRequest("Provide at least one field to update.");

    params.push(req.user.id);
    try {
      const { rows } = await pool.query(
        `UPDATE users SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${params.length}
         RETURNING id, name, email, role, height_cm, weight_kg, date_of_birth, fitness_goal, activity_level, is_active, created_at`,
        params
      );
      if (!rows[0]) return next(notFound("User not found."));
      return ok(res, { user: safeUser(rows[0]) });
    } catch (error) {
      if (error.code === "23505") throw conflict("That email is already in use.", { email: "This email is already registered." });
      return pgError(error, next);
    }
  })
);

router.post("/logout", requireAuth, (req, res) => {
  clearSessionCookie(res);
  return ok(res, { loggedOut: true });
});

export default router;
