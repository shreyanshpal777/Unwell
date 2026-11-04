import { Calendar, Filter, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable } from "../components/DataTable";
import { QueryPanel } from "../components/QueryPanel";
import { Badge, Button, Card, Input, Modal, ProgressIndicator, Select } from "../components/ui";
import { api, ApiError, type Exercise, type Food, type Goal, type NutritionTotals, type QueryInfo } from "../services/api";

type Row = Record<string, unknown>;

const configs = {
  workouts: {
    title: "Workout history",
    helper: "Track sessions and exercises in one place.",
    add: "Add workout",
    columns: [{ key: "date", label: "Date" }, { key: "name", label: "Session" }, { key: "duration", label: "Duration" }, { key: "exercises", label: "Exercises" }, { key: "status", label: "Status" }],
    sql: "SELECT ws.id, ws.session_date, ws.duration_minutes, e.name AS exercise_name\nFROM workout_sessions ws\nINNER JOIN session_exercises se ON se.session_id = ws.id\nINNER JOIN exercises e ON e.id = se.exercise_id\nWHERE ws.user_id = $1\nORDER BY ws.session_date DESC;"
  },
  nutrition: {
    title: "Daily food intake",
    helper: "Nutrition values are calculated from food values per 100 grams.",
    add: "Log food",
    columns: [{ key: "meal", label: "Meal" }, { key: "food", label: "Food item" }, { key: "quantity", label: "Quantity" }, { key: "calories", label: "Calories" }, { key: "protein", label: "Protein" }],
    sql: "SELECT nl.meal_type, fi.name, nl.quantity_grams,\nROUND(fi.calories_per_100g * nl.quantity_grams / 100) AS calories\nFROM nutrition_logs nl\nINNER JOIN food_items fi ON fi.id = nl.food_id\nWHERE nl.user_id = $1 AND nl.consumed_date = $2\nORDER BY nl.meal_type;"
  },
  wellness: {
    title: "Wellness history",
    helper: "One entry per day keeps your trend data consistent.",
    add: "Add wellness log",
    columns: [{ key: "date", label: "Date" }, { key: "sleep", label: "Sleep" }, { key: "water", label: "Water" }, { key: "stress", label: "Stress" }, { key: "mood", label: "Mood" }],
    sql: "SELECT log_date, sleep_hours, water_liters, stress_level, mood\nFROM wellness_logs\nWHERE user_id = $1 AND log_date BETWEEN $2 AND $3\nORDER BY log_date DESC;"
  }
};

type TrackerType = keyof typeof configs;

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const labelDate = (value: string) =>
  parseLocalDate(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

const todayIso = () => {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? (error.fields ? Object.values(error.fields)[0] : error.message) : "Something went wrong. Please try again.";

export default function TrackerPage({ type }: { type: TrackerType }) {
  const config = configs[type];
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState<QueryInfo | undefined>();
  const [totals, setTotals] = useState<NutritionTotals | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (type === "workouts") {
        const result = await api.getWorkoutSessions({ limit: 100 });
        setQuery(result.query);
        setRows(
          result.data.map((workout) => ({
            id: workout.id,
            _date: workout.date,
            date: labelDate(workout.date),
            name: workout.name,
            duration: `${workout.durationMinutes} min`,
            exercises: workout.exerciseCount,
            status: "Completed"
          }))
        );
      } else if (type === "nutrition") {
        const [result, todayResult] = await Promise.all([api.getNutritionLogs(), api.getNutritionLogs({ date: todayIso() })]);
        setQuery(result.query);
        setTotals(todayResult.data.totals);
        setRows(
          result.data.logs.map((log) => ({
            id: log.id,
            _date: log.date,
            meal: log.meal,
            food: log.food,
            quantity: log.quantity,
            calories: log.calories,
            protein: log.protein
          }))
        );
      } else {
        const result = await api.getWellnessLogs();
        setQuery(result.query);
        setRows(
          result.data.map((log) => ({
            id: log.id,
            _date: log.date,
            date: labelDate(log.date),
            sleep: log.sleep,
            water: log.water,
            stress: log.stress,
            mood: log.mood
          }))
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setFormError("");
    try {
      if (type === "workouts") {
        const weight = String(form.get("weightKg") ?? "").trim();
        await api.addWorkoutSession({
          date: String(form.get("date")),
          durationMinutes: Number(form.get("durationMinutes")),
          notes: String(form.get("notes") ?? "").trim() || undefined,
          exercises: [
            {
              exerciseId: Number(form.get("exerciseId")),
              sets: Number(form.get("sets")),
              reps: Number(form.get("reps")),
              weightKg: weight ? Number(weight) : null
            }
          ]
        });
      } else if (type === "nutrition") {
        await api.addNutritionLog({
          date: String(form.get("date")),
          foodId: Number(form.get("foodId")),
          mealType: String(form.get("mealType")).toLowerCase(),
          quantityGrams: Number(form.get("quantityGrams"))
        });
      } else {
        await api.addWellnessLog(String(form.get("date")), {
          sleepHours: Number(form.get("sleepHours")),
          waterLiters: Number(form.get("waterLiters")),
          stressLevel: Number(form.get("stressLevel")),
          mood: String(form.get("mood"))
        });
      }
      setOpen(false);
      setToast(`${config.add.replace("Add ", "")} saved`);
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm("Delete this record? This action cannot be undone.")) return;
    try {
      if (type === "workouts") await api.deleteWorkoutSession(Number(row.id));
      else if (type === "nutrition") await api.deleteNutritionLog(Number(row.id));
      else await api.deleteWellnessLog(String(row._date));
      setToast("Record deleted");
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <div className="page-intro"><div><h2>{config.title}</h2><p>{config.helper}</p></div><Button onClick={() => { setFormError(""); setOpen(true); }}><Plus size={16} />{config.add}</Button></div>
      {type === "nutrition" && <div className="compact-stats"><Card><span>Calories</span><strong>{(totals?.calories ?? 0).toLocaleString()} <small>kcal</small></strong></Card><Card><span>Protein</span><strong>{Math.round(totals?.protein ?? 0)} <small>g</small></strong></Card><Card><span>Carbohydrates</span><strong>{Math.round(totals?.carbs ?? 0)} <small>g</small></strong></Card><Card><span>Fat</span><strong>{Math.round(totals?.fat ?? 0)} <small>g</small></strong></Card></div>}
      <Card className="table-card">
        <div className="table-tools"><div className="search-field"><Search size={17} /><Input placeholder={`Search ${type}`} value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button variant="secondary" onClick={() => setSearch(labelDate(todayIso()))}><Calendar size={16} /> Latest date</Button><Button variant="secondary" onClick={() => setSearch(search ? "" : type === "nutrition" ? "Breakfast" : type === "wellness" ? "Good" : "Completed")}><Filter size={16} /> {search ? "Clear" : "Filter"}</Button></div>
        {error && <p className="form-error table-error" role="alert">{error}</p>}
        {loading ? (
          <p className="empty-note">Loading records…</p>
        ) : (
          <DataTable columns={config.columns} rows={filtered} onDelete={remove} />
        )}
        <div className="table-footer"><span>Showing {filtered.length} records</span><div><Button variant="secondary" disabled>Previous</Button><Button variant="secondary" disabled={filtered.length < 50}>Next</Button></div></div>
        <QueryPanel sql={query?.sql ?? config.sql} ms={query?.ms ?? 0} rows={filtered.slice(0, 3).map(({ _date, ...rest }) => rest)} />
      </Card>
      <Modal open={open} title={config.add} onClose={() => setOpen(false)}><TrackerForm type={type} onSubmit={submit} onCancel={() => setOpen(false)} error={formError} busy={saving} /></Modal>
      {toast && <div className="toast"><Badge>Saved</Badge>{toast}</div>}
    </>
  );
}

function TrackerForm({
  type,
  onSubmit,
  onCancel,
  error,
  busy
}: {
  type: TrackerType;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  error: string;
  busy: boolean;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);

  useEffect(() => {
    if (type === "workouts") {
      api.getExercises().then((result) => setExercises(result.data)).catch(() => setExercises([]));
    }
    if (type === "nutrition") {
      api.getFoods().then((result) => setFoods(result.data)).catch(() => setFoods([]));
    }
  }, [type]);

  return <form onSubmit={onSubmit} className="form-grid">
    <label><span>Date</span><Input required type="date" name="date" defaultValue={todayIso()} /></label>
    {type === "workouts" && <><label><span>Duration (minutes)</span><Input required min="1" max="1440" type="number" name="durationMinutes" placeholder="45" /></label><label className="full"><span>Exercise</span><Select required name="exerciseId" defaultValue=""><option value="" disabled>Search exercise catalog…</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</Select></label><label><span>Sets</span><Input required type="number" name="sets" min="1" max="100" placeholder="3" /></label><label><span>Reps</span><Input required type="number" name="reps" min="1" max="10000" placeholder="10" /></label><label><span>Weight (kg)</span><Input type="number" name="weightKg" min="0" step="0.5" placeholder="40" /></label><label><span>Notes</span><Input name="notes" placeholder="Optional notes" /></label></>}
    {type === "nutrition" && <><label className="full"><span>Food item</span><Select required name="foodId" defaultValue=""><option value="" disabled>Search food catalog…</option>{foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.calories} kcal/100g</option>)}</Select></label><label><span>Meal type</span><Select name="mealType" defaultValue="Breakfast"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></Select></label><label><span>Quantity (grams)</span><Input required type="number" name="quantityGrams" min="1" max="10000" placeholder="100" /></label></>}
    {type === "wellness" && <><label><span>Sleep hours</span><Input required type="number" name="sleepHours" step="0.1" min="0" max="24" placeholder="7.5" /></label><label><span>Water (liters)</span><Input required type="number" name="waterLiters" step="0.1" min="0" max="20" placeholder="2.5" /></label><label><span>Stress level</span><Select name="stressLevel" defaultValue="3"><option value="1">1 — Very low</option><option value="2">2 — Low</option><option value="3">3 — Moderate</option><option value="4">4 — High</option><option value="5">5 — Very high</option></Select></label><label><span>Mood</span><Select name="mood" defaultValue="good"><option value="excellent">Excellent</option><option value="good">Good</option><option value="neutral">Neutral</option><option value="low">Low</option><option value="very_low">Very low</option></Select></label></>}
    {error && <p className="form-error full" role="alert">{error}</p>}
    <div className="form-actions full"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save record"}</Button></div>
  </form>;
}

export function GoalsPage() {
  const [items, setItems] = useState<Goal[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getGoals();
      setItems(result.data);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setFormError("");
    try {
      await api.addGoal({
        goalType: String(form.get("goalType")),
        targetValue: Number(form.get("targetValue")),
        currentValue: Number(form.get("currentValue") || 0),
        deadline: String(form.get("deadline"))
      });
      setOpen(false);
      setToast("Goal created");
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this goal? This action cannot be undone.")) return;
    try {
      await api.deleteGoal(id);
      setToast("Goal deleted");
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return <><div className="page-intro"><div><h2>Goals that keep you moving</h2><p>Track meaningful targets without mixing measurement units.</p></div><Button onClick={() => { setFormError(""); setOpen(true); }}><Plus size={16} />Create goal</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p className="empty-note">Loading goals…</p> : <div className="goal-grid">{items.length === 0 && <p className="empty-note">No goals yet. Create your first target to start tracking progress.</p>}{items.map((goal) => <Card className="goal-card" key={goal.id}><div className="goal-card-top"><Badge tone={goal.status === "cancelled" ? "gray" : "green"}>{goal.status === "active" && goal.current >= goal.target ? "Completed" : goal.status.charAt(0).toUpperCase() + goal.status.slice(1)}</Badge><Button variant="ghost" onClick={() => remove(goal.id)}><Trash2 size={17} /></Button></div><h3>{goal.name}</h3><div className="goal-amount"><strong>{goal.current}</strong><span>/ {goal.target} {goal.unit}</span></div><ProgressIndicator value={(goal.current / goal.target) * 100} /><p>Deadline · {goal.deadlineLabel}</p></Card>)}</div>}
    <Modal open={open} title="Create goal" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={create}><label className="full"><span>Goal type</span><Select name="goalType" defaultValue="weekly_workout_minutes"><option value="weekly_workout_minutes">Weekly workout minutes</option><option value="daily_water_intake">Daily water intake</option><option value="target_body_weight">Target body weight</option></Select></label><label><span>Target value</span><Input required type="number" name="targetValue" min="1" step="0.1" /></label><label><span>Current value</span><Input required type="number" name="currentValue" min="0" step="0.1" defaultValue="0" /></label><label className="full"><span>Deadline</span><Input required type="date" name="deadline" /></label>{formError && <p className="form-error full" role="alert">{formError}</p>}<div className="form-actions full"><Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create goal"}</Button></div></form></Modal>
    {toast && <div className="toast"><Badge>Saved</Badge>{toast}</div>}
  </>;
}
