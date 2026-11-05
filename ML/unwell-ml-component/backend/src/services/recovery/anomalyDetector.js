/**
 * Module D: anomaly detection for unusually high workout session loads.
 *
 * session_load = duration_minutes * perceived_exertion (computed upstream).
 * Each session is compared ONLY with the same user's own history.
 *
 * Method: a small one-dimensional Isolation Forest (pure JS, no dependencies,
 * seeded for reproducibility), with a robust median/MAD z-score fallback.
 *
 * An anomaly is a statistical deviation from the user's own past loads. It is
 * NOT evidence of injury or inadequate recovery.
 */

export const DISCLAIMER =
  "An anomaly is a statistical deviation from your own past training loads. " +
  "It is not evidence of injury or inadequate recovery.";

export const DEFAULT_CONFIG = Object.freeze({
  minHistory: 15, // minimum valid past sessions before any prediction
  contamination: 0.1, // expected share of unusual sessions
  nTrees: 100,
  maxSamples: 256,
  randomState: 42, // reproducible
  useIsolationForest: true,
  robustZThreshold: 3.5 // fallback cutoff (modified z-score)
});

// ---------- helpers ----------

/** Drop missing/invalid loads. A missing RPE is never treated as 0. */
export function cleanLoads(values) {
  const out = [];
  for (const v of values ?? []) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(sortedAsc, q) {
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** Small seeded PRNG (mulberry32) so results are reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1-D Isolation Forest ----------

const EULER = 0.5772156649;
/** Average path length of an unsuccessful BST search over n points. */
function c(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n;
}

function buildTree(values, depth, maxDepth, rng) {
  const n = values.length;
  if (depth >= maxDepth || n <= 1) return { size: n };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return { size: n };
  const split = min + rng() * (max - min);
  const left = [];
  const right = [];
  for (const v of values) (v < split ? left : right).push(v);
  return {
    split,
    left: buildTree(left, depth + 1, maxDepth, rng),
    right: buildTree(right, depth + 1, maxDepth, rng)
  };
}

function pathLength(node, x, depth = 0) {
  if (node.split === undefined) return depth + c(node.size);
  return pathLength(x < node.split ? node.left : node.right, x, depth + 1);
}

function sampleWithoutReplacement(values, k, rng) {
  const copy = [...values];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

export class IsolationForest1D {
  constructor({ nTrees, maxSamples, randomState }) {
    this.nTrees = nTrees;
    this.maxSamples = maxSamples;
    this.rng = makeRng(randomState);
    this.trees = [];
    this.psi = 0;
  }

  fit(values) {
    this.psi = Math.min(this.maxSamples, values.length);
    const maxDepth = Math.ceil(Math.log2(Math.max(this.psi, 2)));
    this.trees = [];
    for (let i = 0; i < this.nTrees; i++) {
      const sample = sampleWithoutReplacement(values, this.psi, this.rng);
      this.trees.push(buildTree(sample, 0, maxDepth, this.rng));
    }
    return this;
  }

  /** Anomaly score in (0, 1); higher = more isolated = more unusual. */
  score(x) {
    let total = 0;
    for (const t of this.trees) total += pathLength(t, x);
    const avg = total / this.trees.length;
    return Math.pow(2, -avg / c(this.psi));
  }
}

// ---------- statistical fallback ----------

function robustZ(history, x) {
  const med = median(history);
  const mad = median(history.map((h) => Math.abs(h - med)));
  if (mad > 0) return (0.6745 * (x - med)) / mad;
  // Flat-ish history: use mean absolute deviation instead.
  const meanAd = history.reduce((s, h) => s + Math.abs(h - med), 0) / history.length;
  if (meanAd === 0) return x === med ? 0 : x > med ? Infinity : -Infinity;
  return (x - med) / (1.253314 * meanAd);
}

// ---------- public API ----------

/**
 * @param {Array<number|null>} historyLoads past session loads, EXCLUDING the one being checked
 * @param {number|null} sessionLoad load of the session to check (null if RPE/duration missing)
 * @param {Partial<typeof DEFAULT_CONFIG>} overrides
 */
export function detectLoadAnomaly(historyLoads, sessionLoad, overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const history = cleanLoads(historyLoads);
  const base = {
    disclaimer: DISCLAIMER,
    historyCount: history.length,
    minHistory: config.minHistory
  };

  const [x] = cleanLoads([sessionLoad]);
  if (x === undefined) {
    return {
      ...base,
      status: "unavailable",
      method: null,
      isAnomaly: null,
      reason: "no_session_load"
    };
  }
  if (history.length < config.minHistory) {
    return {
      ...base,
      status: "unavailable",
      method: null,
      isAnomaly: null,
      reason: "insufficient_history"
    };
  }

  const med = median(history);
  let method = "robust_zscore";
  let score = null;
  let isAnomaly = false;

  // Isolation Forest is meaningless on zero-variance history -> use fallback.
  if (config.useIsolationForest && new Set(history).size > 1) {
    try {
      const forest = new IsolationForest1D(config).fit(history);
      const trainScores = history.map((h) => forest.score(h)).sort((a, b) => a - b);
      const threshold = quantile(trainScores, 1 - config.contamination);
      score = forest.score(x);
      // The forest flags both tails; we only care about unusually HIGH load.
      const maxHistory = Math.max(...history);
      // A load above everything the user has ever logged ties with their top
      // (repeated) sessions in a forest, so accept >= there, backed by the
      // robust z-score as a second check.
      const beyondRange =
        x > maxHistory && (score >= threshold || robustZ(history, x) > config.robustZThreshold);
      isAnomaly = x > med && (score > threshold || beyondRange);
      method = "isolation_forest";
    } catch {
      method = "robust_zscore";
    }
  }

  if (method === "robust_zscore") {
    score = robustZ(history, x);
    isAnomaly = score > config.robustZThreshold;
  }

  return {
    ...base,
    status: "available",
    method,
    isAnomaly,
    score: Number.isFinite(score) ? Math.round(score * 1000) / 1000 : null,
    sessionLoad: x,
    personalMedianLoad: Math.round(med * 10) / 10,
    ratioToMedian: Math.round((x / med) * 100) / 100,
    reason: isAnomaly ? "unusually_high_vs_personal_history" : "within_personal_range"
  };
}
