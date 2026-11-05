import { detectLoadAnomaly } from "./anomalyDetector.js";

const HISTORY_LIMIT = 200;

/** session_load = duration * RPE. Missing RPE -> null (never 0). */
export function sessionLoad(row) {
  if (row.perceived_exertion === null || row.perceived_exertion === undefined) return null;
  return Number(row.duration_minutes) * Number(row.perceived_exertion);
}

/**
 * Checks the user's most recent workout session against their own history.
 * `query` is any (text, params) => Promise<{rows}> function (e.g. pool.query),
 * injected so this is testable without a database.
 */
export async function assessLatestSessionLoad(query, userId, config = {}) {
  const { rows } = await query(
    `SELECT id, session_date, duration_minutes, perceived_exertion
       FROM workout_sessions
      WHERE user_id = $1
      ORDER BY session_date DESC, id DESC
      LIMIT $2`,
    [userId, HISTORY_LIMIT]
  );

  if (rows.length === 0) {
    return {
      status: "unavailable",
      reason: "no_workout_history",
      method: null,
      isAnomaly: null,
      historyCount: 0
    };
  }

  const [latest, ...past] = rows;
  const result = detectLoadAnomaly(past.map(sessionLoad), sessionLoad(latest), config);
  return {
    ...result,
    session: { id: Number(latest.id), date: latest.session_date, durationMinutes: latest.duration_minutes }
  };
}
