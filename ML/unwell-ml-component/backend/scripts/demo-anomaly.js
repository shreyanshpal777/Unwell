// Run: node backend/scripts/demo-anomaly.js   (no database needed)
import { detectLoadAnomaly } from "../src/services/recovery/anomalyDetector.js";

const history = Array.from({ length: 30 }, (_, i) => (40 + (i % 5) * 3) * (5 + (i % 3)));
const show = (label, r) => console.log(label, "->", r.status, "| anomaly:", r.isAnomaly, "|", r.reason, "| method:", r.method);
show("Normal session (45 min x RPE 6)    ", detectLoadAnomaly(history, 45 * 6));
show("Very hard session (120 min x RPE 9)", detectLoadAnomaly(history, 120 * 9));
show("Session with no RPE                ", detectLoadAnomaly(history, null));
show("New user (5 sessions)              ", detectLoadAnomaly(history.slice(0, 5), 270));
