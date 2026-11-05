import crypto from "node:crypto";
import { pool } from "../config/db.js";

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) =>
  new ApiError(400, "VALIDATION_ERROR", message, fields);

export const unauthorized = (message = "Authentication required.") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have permission to perform this action.") =>
  new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "The requested record was not found.") =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message, fields) =>
  new ApiError(409, "CONFLICT", message, fields);

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function requestId(req, res, next) {
  res.locals.requestId = crypto.randomUUID();
  next();
}

export function ok(res, data, extra = {}) {
  return res.json({ data, meta: { requestId: res.locals.requestId, ...extra } });
}

export async function timedQuery(text, params) {
  const start = performance.now();
  const result = await pool.query(text, params);
  const ms = Math.round((performance.now() - start) * 100) / 100;
  return { rows: result.rows, rowCount: result.rowCount, sql: text, ms };
}

export function queryMeta(result) {
  return { sql: result.sql, ms: result.ms, rowCount: result.rowCount };
}

export function formatDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseDate(value, field, errors) {
  if (!value || typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors[field] = "Use a date in YYYY-MM-DD format.";
    return null;
  }
  if (Number.isNaN(Date.parse(value))) {
    errors[field] = "Enter a valid date.";
    return null;
  }
  return value;
}

export function collectFieldErrors(validators) {
  const errors = {};
  for (const [field, check] of Object.entries(validators)) {
    const message = check();
    if (message) errors[field] = message;
  }
  return Object.keys(errors).length ? errors : null;
}

export function pgError(error, next) {
  if (error.code === "23505") {
    return next(conflict("An account or record with that value already exists.", { email: "This email is already registered." }));
  }
  if (error.code === "23503") {
    return next(conflict("This record is referenced by other data and cannot be removed."));
  }
  if (error.code === "23514" || error.code === "23502") {
    return next(badRequest("The submitted values violate a database constraint.", { value: error.message }));
  }
  return next(error);
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) }
    });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body." } });
  }
  if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Your session is no longer valid." } });
  }
  console.error(error);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } });
}
