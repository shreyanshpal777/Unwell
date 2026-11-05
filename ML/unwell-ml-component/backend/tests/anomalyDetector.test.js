import test from "node:test";
import assert from "node:assert/strict";
import { detectLoadAnomaly, cleanLoads } from "../src/services/recovery/anomalyDetector.js";

// deterministic "typical" history around 300
const HIST = Array.from({ length: 40 }, (_, i) => 250 + ((i * 37) % 101));

test("insufficient history -> unavailable", () => {
  const r = detectLoadAnomaly(HIST.slice(0, 5), 300);
  assert.equal(r.status, "unavailable");
  assert.equal(r.reason, "insufficient_history");
  assert.equal(r.isAnomaly, null);
});

test("missing session load (no RPE) is unavailable, not zero", () => {
  assert.equal(detectLoadAnomaly(HIST, null).status, "unavailable");
});

test("missing history values are ignored, not counted as zero", () => {
  const r = detectLoadAnomaly([...Array(30).fill(null), ...HIST.slice(0, 5)], 300);
  assert.equal(r.historyCount, 5);
  assert.equal(r.status, "unavailable");
  assert.deepEqual(cleanLoads([null, "", undefined, 0, -5, NaN, "abc", 10]), [10]);
});

test("unusually high load is flagged", () => {
  const r = detectLoadAnomaly(HIST, 900);
  assert.equal(r.status, "available");
  assert.equal(r.method, "isolation_forest");
  assert.equal(r.isAnomaly, true);
});

test("typical load is not flagged", () => {
  assert.equal(detectLoadAnomaly(HIST, 300).isAnomaly, false);
});

test("unusually LOW load is not flagged", () => {
  assert.equal(detectLoadAnomaly(HIST, 20).isAnomaly, false);
});

test("reproducible with fixed seed", () => {
  assert.deepEqual(detectLoadAnomaly(HIST, 600), detectLoadAnomaly(HIST, 600));
});

test("statistical fallback when forest disabled", () => {
  const r = detectLoadAnomaly(HIST, 900, { useIsolationForest: false });
  assert.equal(r.method, "robust_zscore");
  assert.equal(r.isAnomaly, true);
});

test("flat history uses fallback and flags a jump", () => {
  const r = detectLoadAnomaly(Array(20).fill(300), 600);
  assert.equal(r.method, "robust_zscore");
  assert.equal(r.isAnomaly, true);
});

test("configurable min history", () => {
  assert.equal(detectLoadAnomaly(HIST.slice(0, 8), 900, { minHistory: 5 }).status, "available");
});

test("disclaimer always present", () => {
  assert.match(detectLoadAnomaly(HIST, 300).disclaimer, /not evidence of injury/);
});

test("outlier is flagged even when history has many repeated values", () => {
  const discrete = Array.from({ length: 25 }, (_, i) => (40 + (i % 6) * 2) * (5 + (i % 3)));
  assert.equal(detectLoadAnomaly(discrete, 1500).isAnomaly, true);
  assert.equal(detectLoadAnomaly(discrete, 350).isAnomaly, false); // equals their max: normal
});
