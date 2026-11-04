import { Activity, ArrowUpRight, Dumbbell, Plus, Search, Target, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Card, Button, Badge, Input, Modal, Select } from "../components/ui";
import { DataTable } from "../components/DataTable";
import { QueryPanel } from "../components/QueryPanel";
import { api, errorMessage, type AdminUser, type ClientRow, type DatabaseSchema, type QueryInfo, type Role, type TrainerOption } from "../services/api";

type Row = Record<string, unknown>;

function downloadCsv(name: string, rows: Row[]) {
  const keys = Object.keys(rows[0] ?? {});
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

const trainerFallbackSql = `SELECT u.name, u.fitness_goal, MAX(ws.session_date) AS last_workout
FROM trainer_clients tc
INNER JOIN users u ON u.id = tc.client_id
LEFT JOIN workout_sessions ws ON ws.user_id = u.id
WHERE tc.trainer_id = $1
GROUP BY u.id
ORDER BY last_workout DESC NULLS LAST;`;

const clientsFallbackSql = `SELECT u.name, u.fitness_goal, u.activity_level,
MAX(ws.session_date) AS last_workout
FROM users u
INNER JOIN trainer_clients tc ON tc.client_id = u.id
LEFT JOIN workout_sessions ws ON ws.user_id = u.id
WHERE tc.trainer_id = $1
GROUP BY u.id
ORDER BY u.name;`;

export function TrainerDashboard() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState<QueryInfo | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTrainerClients()
      .then((result) => {
        setClients(result.data);
        setQuery(result.query);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  const activeThisWeek = clients.filter((client) => client.workoutsThisWeek > 0).length;
  const onTrack = clients.length ? Math.round((clients.filter((client) => client.progressValue >= 70).length / clients.length) * 100) : 0;
  const clientRows = clients as unknown as Row[];

  return <>
    <div className="welcome-row"><div><h2>Client performance at a glance</h2><p>Monitor assigned clients and focus on those needing support.</p></div><Button variant="secondary" onClick={() => downloadCsv("client-summary", clientRows)}>Export summary</Button></div>
    <div className="stats-grid three"><Metric label="Assigned clients" value={String(clients.length)} icon={UsersIcon} /><Metric label="Active this week" value={String(activeThisWeek)} icon={Activity} /><Metric label="Goals on track" value={`${onTrack}%`} icon={Target} /></div>
    <Card className="table-card"><div className="card-heading"><div><p className="eyebrow">Recent client activity</p><h3>Latest updates</h3></div></div>
      {error && <p className="form-error table-error" role="alert">{error}</p>}
      {loading ? <p className="empty-note">Loading clients…</p> : <DataTable columns={[{ key: "name", label: "Client" }, { key: "goal", label: "Focus" }, { key: "last", label: "Last workout" }, { key: "progress", label: "Goal progress" }]} rows={clientRows} />}
      <QueryPanel ms={query?.ms ?? 0} rows={clientRows.slice(0, 3)} sql={query?.sql ?? trainerFallbackSql} />
    </Card>
  </>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return <Card className="metric"><span className="icon-box"><Icon size={19} /></span><div><p>{label}</p><strong>{value}</strong></div><ArrowUpRight size={18} /></Card>;
}

export function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState<QueryInfo | undefined>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTrainerClients()
      .then((result) => {
        setClients(result.data);
        setQuery(result.query);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  const rows = clients.filter((client) => client.name.toLowerCase().includes(search.toLowerCase()));
  const clientRows = rows as unknown as Row[];
  return <>
    <div className="page-intro"><div><h2>Your assigned clients</h2><p>Access is restricted to trainer-client assignments.</p></div></div>
    <Card className="table-card"><div className="table-tools"><div className="search-field"><Search size={17} /><Input placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {error && <p className="form-error table-error" role="alert">{error}</p>}
      {loading ? <p className="empty-note">Loading clients…</p> : <DataTable columns={[{ key: "name", label: "Client" }, { key: "goal", label: "Fitness goal" }, { key: "level", label: "Activity level" }, { key: "last", label: "Last workout" }, { key: "progress", label: "Goal progress" }]} rows={clientRows} />}
      <QueryPanel ms={query?.ms ?? 0} rows={clientRows} sql={query?.sql ?? clientsFallbackSql} />
    </Card>
  </>;
}

export function AdminOverview() {
  const [stats, setStats] = useState<{ totalUsers: number; activeUsers: number; activeTrainers: number; totalWorkouts: number; activeExercises: number; activeFoods: number; assignments: number } | null>(null);
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getAdminStats(), api.getDatabaseSchema()])
      .then(([adminStats, databaseSchema]) => {
        setStats(adminStats.data);
        setSchema(databaseSchema.data);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, []);

  if (error) return <div className="page-loading"><p>{error}</p></div>;
  if (!stats) return <div className="page-loading"><p>Loading system status…</p></div>;

  return <>
    <div className="welcome-row"><div><h2>System administration</h2><p>Database health, catalog coverage, and user access.</p></div><Badge>All systems operational</Badge></div>
    <div className="stats-grid three"><Metric label="Total users" value={stats.totalUsers.toLocaleString()} icon={UsersIcon} /><Metric label="Workout records" value={stats.totalWorkouts.toLocaleString()} icon={Dumbbell} /><Metric label="Active trainers" value={String(stats.activeTrainers)} icon={Activity} /></div>
    <Card className="admin-note"><div className="insight-icon"><Target size={20} /></div><div><h3>Database integrity</h3><p>{schema ? `All ${schema.relationshipCount} foreign-key relationships resolve across ${schema.tableCount} tables.` : "Checking foreign-key relationships…"}</p></div><Button variant="secondary" onClick={() => window.location.assign("/database")}>View details</Button></Card>
    <div className="stats-grid three"><Metric label="Active catalog exercises" value={String(stats.activeExercises)} icon={Dumbbell} /><Metric label="Active food items" value={String(stats.activeFoods)} icon={Activity} /><Metric label="Trainer assignments" value={String(stats.assignments)} icon={Target} /></div>
  </>;
}

const titles: Record<AdminType, string> = {
  users: "People and permissions",
  exercises: "Exercise catalog",
  foods: "Food catalog",
  assignments: "Trainer-client assignments"
};

type AdminType = "users" | "exercises" | "foods" | "assignments";

const columnsFor: Record<AdminType, { key: string; label: string }[]> = {
  users: [{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "joined", label: "Joined" }],
  exercises: [{ key: "name", label: "Exercise" }, { key: "group", label: "Muscle group" }, { key: "difficulty", label: "Difficulty" }, { key: "calories", label: "Calories" }],
  foods: [{ key: "name", label: "Food / 100g" }, { key: "calories", label: "Calories" }, { key: "protein", label: "Protein" }, { key: "carbs", label: "Carbs" }, { key: "fat", label: "Fat" }],
  assignments: [{ key: "name", label: "Client" }, { key: "trainer", label: "Trainer" }, { key: "goal", label: "Fitness goal" }, { key: "last", label: "Last workout" }]
};

export function AdminTable({ type }: { type: AdminType }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All records");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: Row } | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [candidates, setCandidates] = useState<AdminUser[]>([]);

  const title = titles[type];
  const columns = columnsFor[type];
  const addLabel = type === "foods" ? "food" : type.slice(0, -1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (type === "users") {
        const result = await api.getAdminUsers({ limit: 200 });
        setRows(
          result.data.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: capitalize(user.role),
            joined: user.joined,
            _role: user.role,
            _active: user.isActive
          }))
        );
      } else if (type === "exercises") {
        const result = await api.getExercises({ includeInactive: true });
        setRows(
          result.data.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            group: exercise.muscleGroup,
            difficulty: capitalize(exercise.difficulty),
            calories: `${exercise.caloriesPerMinute} / min`,
            _muscleGroup: exercise.muscleGroup,
            _difficulty: exercise.difficulty,
            _calories: exercise.caloriesPerMinute,
            _active: exercise.isActive
          }))
        );
      } else if (type === "foods") {
        const result = await api.getFoods({ includeInactive: true });
        setRows(
          result.data.map((food) => ({
            id: food.id,
            name: food.name,
            calories: food.calories,
            protein: `${food.protein} g`,
            carbs: `${food.carbs} g`,
            fat: `${food.fat} g`,
            _protein: food.protein,
            _carbs: food.carbs,
            _fat: food.fat,
            _active: food.isActive
          }))
        );
      } else {
        const result = await api.getTrainerAssignments();
        setRows(
          result.data.map((assignment) => ({
            id: `${assignment.trainerId}-${assignment.clientId}`,
            name: assignment.clientName,
            trainer: assignment.trainerName,
            goal: assignment.goal,
            last: assignment.last,
            _trainerId: assignment.trainerId,
            _clientId: assignment.clientId
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

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = JSON.stringify(row).toLowerCase().includes(term);
      const matchesFilter =
        filter === "All records" ||
        (type === "users" ? String(row.role) === filter : type === "exercises" ? String(row.difficulty) === filter : true);
      return matchesSearch && matchesFilter;
    });
  }, [rows, search, filter, type]);

  const openCreate = async () => {
    setFormError("");
    setModal({ mode: "create" });
    if (type === "assignments") {
      try {
        const [trainerResult, peopleResult] = await Promise.all([
          api.getTrainers(),
          api.getAdminUsers({ role: "user", limit: 200 })
        ]);
        setTrainers(trainerResult.data);
        setCandidates(peopleResult.data);
      } catch (cause) {
        setFormError(errorMessage(cause));
      }
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const editing = modal?.mode === "edit" ? modal.row : undefined;
    setSaving(true);
    setFormError("");
    try {
      if (type === "users") {
        if (editing) {
          await api.updateAdminUser(Number(editing.id), {
            name: String(form.get("name")).trim(),
            email: String(form.get("email")).trim(),
            role: String(form.get("role")) as Role,
            isActive: String(form.get("isActive")) === "true"
          });
        } else {
          await api.createAdminUser({
            name: String(form.get("name")).trim(),
            email: String(form.get("email")).trim(),
            password: String(form.get("password")),
            role: String(form.get("role")) as Role,
            activityLevel: String(form.get("activityLevel") ?? "moderate")
          });
        }
      } else if (type === "exercises") {
        const payload = {
          name: String(form.get("name")).trim(),
          muscleGroup: String(form.get("muscleGroup")).trim(),
          difficulty: String(form.get("difficulty")),
          caloriesPerMinute: Number(form.get("caloriesPerMinute"))
        };
        if (editing) await api.updateExercise(Number(editing.id), payload);
        else await api.addExercise(payload);
      } else if (type === "foods") {
        const payload = {
          name: String(form.get("name")).trim(),
          calories: Number(form.get("calories")),
          protein: Number(form.get("protein")),
          carbs: Number(form.get("carbs")),
          fat: Number(form.get("fat"))
        };
        if (editing) await api.updateFood(Number(editing.id), payload);
        else await api.addFood(payload);
      } else {
        await api.addTrainerAssignment(Number(form.get("trainerId")), Number(form.get("clientId")));
      }
      setModal(null);
      setToast(editing ? "Record updated" : "Record created");
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm("Check dependencies and delete this record?")) return;
    try {
      if (type === "users") await api.deleteAdminUser(Number(row.id));
      else if (type === "exercises") await api.deleteExercise(Number(row.id));
      else if (type === "foods") await api.deleteFood(Number(row.id));
      else await api.removeTrainerAssignment(Number(row._trainerId), Number(row._clientId));
      setToast("Record removed");
      setTimeout(() => setToast(""), 2800);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const editing = modal?.mode === "edit" ? modal.row : undefined;

  return <>
    <div className="page-intro"><div><h2>{title}</h2><p>Manage records with validation and dependency checks.</p></div><Button onClick={openCreate}><Plus size={16} />Add {addLabel}</Button></div>
    <Card className="table-card">
      <div className="table-tools"><div className="search-field"><Search size={17} /><Input placeholder={`Search ${type}`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>{(type === "users" || type === "exercises") && <Select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All records</option>{type === "users" ? <><option>User</option><option>Trainer</option><option>Admin</option></> : <><option>Beginner</option><option>Intermediate</option><option>Advanced</option></>}</Select>}</div>
      {error && <p className="form-error table-error" role="alert">{error}</p>}
      {loading ? (
        <p className="empty-note">Loading records…</p>
      ) : (
        <DataTable columns={columns} rows={filtered} onEdit={type === "assignments" ? undefined : (row) => { setFormError(""); setModal({ mode: "edit", row }); }} onDelete={remove} />
      )}
      <div className="table-footer"><span>Showing {filtered.length} records</span></div>
    </Card>
    <Modal open={modal !== null} eyebrow={modal?.mode === "edit" ? "Edit record" : "New record"} title={modal?.mode === "edit" ? `Edit ${addLabel}` : `Add ${addLabel}`} onClose={() => setModal(null)}>
      <form className="form-grid" onSubmit={submit}>
        {type === "users" && <>
          <label><span>Full name</span><Input required name="name" defaultValue={editing ? String(editing.name) : ""} /></label>
          <label><span>Email address</span><Input required type="email" name="email" defaultValue={editing ? String(editing.email) : ""} /></label>
          {!editing && <label><span>Password</span><Input required type="password" name="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label>}
          {!editing && <label><span>Activity level</span><Select name="activityLevel" defaultValue="moderate"><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="high">High</option><option value="very_high">Very high</option></Select></label>}
          <label><span>Role</span><Select name="role" defaultValue={editing ? String(editing._role ?? "user") : "user"}><option value="user">User</option><option value="trainer">Trainer</option><option value="admin">Admin</option></Select></label>
          {editing && <label><span>Account status</span><Select name="isActive" defaultValue={String(editing._active ?? true)}><option value="true">Active</option><option value="false">Deactivated</option></Select></label>}
        </>}
        {type === "exercises" && <>
          <label><span>Exercise name</span><Input required name="name" defaultValue={editing ? String(editing.name) : ""} /></label>
          <label><span>Muscle group</span><Input required name="muscleGroup" defaultValue={editing ? String(editing._muscleGroup ?? editing.group) : ""} placeholder="Lower body" /></label>
          <label><span>Difficulty</span><Select name="difficulty" defaultValue={editing ? String(editing._difficulty ?? "beginner") : "beginner"}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select></label>
          <label><span>Calories per minute</span><Input required type="number" step="0.1" min="0" name="caloriesPerMinute" defaultValue={editing ? String(editing._calories ?? "") : ""} placeholder="8.4" /></label>
        </>}
        {type === "foods" && <>
          <label className="full"><span>Food name</span><Input required name="name" defaultValue={editing ? String(editing.name) : ""} /></label>
          <label><span>Calories</span><Input required type="number" step="0.1" min="0" name="calories" defaultValue={editing ? String(editing.calories) : ""} /></label>
          <label><span>Protein (g)</span><Input required type="number" step="0.1" min="0" name="protein" defaultValue={editing ? String(editing._protein ?? "") : ""} /></label>
          <label><span>Carbs (g)</span><Input required type="number" step="0.1" min="0" name="carbs" defaultValue={editing ? String(editing._carbs ?? "") : ""} /></label>
          <label><span>Fat (g)</span><Input required type="number" step="0.1" min="0" name="fat" defaultValue={editing ? String(editing._fat ?? "") : ""} /></label>
        </>}
        {type === "assignments" && <>
          <label><span>Trainer</span><Select required name="trainerId" defaultValue=""><option value="" disabled>Select a trainer…</option>{trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</Select></label>
          <label><span>Client</span><Select required name="clientId" defaultValue=""><option value="" disabled>Select a client…</option>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</Select></label>
        </>}
        {formError && <p className="form-error full" role="alert">{formError}</p>}
        <div className="form-actions full"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create record"}</Button></div>
      </form>
    </Modal>
    {toast && <div className="toast"><Badge>Saved</Badge>{toast}</div>}
  </>;
}
