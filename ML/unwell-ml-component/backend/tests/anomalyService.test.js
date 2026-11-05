import test from "node:test";
import assert from "node:assert/strict";
import { assessLatestSessionLoad, sessionLoad } from "../src/services/recovery/anomalyService.js";

const row = (id, dur, rpe) => ({ id, session_date: "2026-01-01", duration_minutes: dur, perceived_exertion: rpe });
const fake = (rows) => async () => ({ rows });

test("missing RPE gives null load, not 0", () => {
  assert.equal(sessionLoad(row(1, 45, null)), null);
  assert.equal(sessionLoad(row(1, 45, 6)), 270);
});

test("no workouts -> unavailable", async () => {
  const r = await assessLatestSessionLoad(fake([]), 1);
  assert.equal(r.reason, "no_workout_history");
});

test("latest session without RPE -> unavailable", async () => {
  const rows = [row(99, 60, null), ...Array.from({ length: 20 }, (_, i) => row(i, 45, 6))];
  const r = await assessLatestSessionLoad(fake(rows), 1);
  assert.equal(r.status, "unavailable");
  assert.equal(r.reason, "no_session_load");
});

test("too little history -> unavailable", async () => {
  const rows = [row(99, 60, 9), ...Array.from({ length: 5 }, (_, i) => row(i, 45, 6))];
  assert.equal((await assessLatestSessionLoad(fake(rows), 1)).reason, "insufficient_history");
});

test("very demanding latest session is flagged", async () => {
  const past = Array.from({ length: 25 }, (_, i) => row(i, 40 + (i % 6) * 2, 5 + (i % 3)));
  const r = await assessLatestSessionLoad(fake([row(99, 150, 10), ...past]), 1);
  assert.equal(r.status, "available");
  assert.equal(r.isAnomaly, true);
});

test("passes the authenticated user id to the query", async () => {
  let seen;
  await assessLatestSessionLoad(async (_t, p) => { seen = p[0]; return { rows: [] }; }, 42);
  assert.equal(seen, 42);
});
