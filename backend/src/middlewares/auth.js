import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { forbidden, unauthorized } from "../utils/http.js";

export const SESSION_COOKIE = "wt_session";

function readCookie(req) {
  if (req.cookies && typeof req.cookies === "object") return req.cookies[SESSION_COOKIE];
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/" });
}

export async function requireAuth(req, _res, next) {
  try {
    const token = readCookie(req);
    if (!token) throw unauthorized();

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) throw unauthorized("This account is no longer active.");

    req.user = { id: Number(user.id), name: user.name, email: user.email, role: user.role };
    next();
  } catch (error) {
    next(error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" ? unauthorized("Your session is no longer valid.") : error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export async function isAssignedTrainer(trainerId, clientId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM trainer_clients WHERE trainer_id = $1 AND client_id = $2",
    [trainerId, clientId]
  );
  return rows.length > 0;
}

export async function canAccessUser(req, targetUserId) {
  const target = Number(targetUserId);
  if (req.user.id === target) return true;
  if (req.user.role === "admin") return true;
  if (req.user.role === "trainer") return isAssignedTrainer(req.user.id, target);
  return false;
}
