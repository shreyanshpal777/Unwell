# Unwell - ML component (anomaly detection)

Detects unusually high workout loads versus a user's OWN history
(session_load = duration_minutes x perceived_exertion).
Pure JavaScript Isolation Forest (seeded, no new dependencies) with a
median/MAD z-score fallback. A flag is a statistical deviation, NOT evidence
of injury or inadequate recovery.

## Install (3 steps)
1. Copy the `backend/` contents into your project's `backend/` (merge folders; nothing is overwritten).
2. Run the migration once:
   `psql "$DATABASE_URL" -f backend/sql/migrations/001_add_perceived_exertion.sql`
3. In `backend/src/server.js` add:
   ```js
   import recoveryRoutes from "./routes/recovery.routes.js";
   app.use("/api/recovery", recoveryRoutes);
   ```
Endpoint: `GET /api/recovery/anomaly` (logged-in `user` role only; user id taken from the session cookie).

## Try it without a database
`node backend/scripts/demo-anomaly.js`

## Tests
`cd backend && node --test tests/anomalyDetector.test.js tests/anomalyService.test.js`

## Behaviour
- Missing RPE is never treated as 0 (session ignored / "unavailable").
- Fewer than 15 valid past sessions -> `status: "unavailable"` (configurable `minHistory`).
- Only unusually HIGH loads are flagged.
- Config in `DEFAULT_CONFIG`: minHistory, contamination, nTrees, randomState, useIsolationForest, robustZThreshold.

## Not included yet
Workout form/API changes to capture RPE, muscle-group and wellness analyzers,
the full recommendation engine, and the dashboard card.
