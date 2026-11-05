-- Optional RPE (1-10). Nullable so existing sessions stay "unrated", never 0.
BEGIN;
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS perceived_exertion SMALLINT;
ALTER TABLE workout_sessions
  DROP CONSTRAINT IF EXISTS workout_rpe_chk;
ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_rpe_chk
  CHECK (perceived_exertion IS NULL OR perceived_exertion BETWEEN 1 AND 10);
COMMIT;
