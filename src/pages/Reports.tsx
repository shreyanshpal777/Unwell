import { BarChart3, Database, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { QueryPanel } from "../components/QueryPanel";
import { Badge, Button, Card, Select } from "../components/ui";
import { api, errorMessage, type DatabaseSchema, type QueryInfo } from "../services/api";

type ReportKey =
  | "weekly-workout-summary"
  | "daily-nutrition-totals"
  | "average-sleep-per-user"
  | "active-workout-users"
  | "trainer-client-counts"
  | "goal-progress"
  | "frequent-exercises";

const reportLabels: Record<ReportKey, string> = {
  "weekly-workout-summary": "Weekly workout summary",
  "daily-nutrition-totals": "Daily nutrition totals",
  "average-sleep-per-user": "Average sleep per user",
  "active-workout-users": "Users with more than three workout sessions",
  "trainer-client-counts": "Trainer-wise client counts",
  "goal-progress": "Goal progress summary",
  "frequent-exercises": "Most frequently performed exercises"
};

const reportColumns: Record<ReportKey, { key: string; label: string }[]> = {
  "weekly-workout-summary": [
    { key: "week", label: "Week" },
    { key: "sessions", label: "Sessions" },
    { key: "total_minutes", label: "Total minutes" },
    { key: "avg_duration", label: "Average duration" }
  ],
  "daily-nutrition-totals": [
    { key: "date", label: "Date" },
    { key: "entries", label: "Entries" },
    { key: "calories", label: "Calories" },
    { key: "protein", label: "Protein" },
    { key: "carbs", label: "Carbs" },
    { key: "fat", label: "Fat" }
  ],
  "average-sleep-per-user": [
    { key: "name", label: "User" },
    { key: "avg_sleep_hours", label: "Average sleep (h)" },
    { key: "log_days", label: "Log days" }
  ],
  "active-workout-users": [
    { key: "name", label: "User" },
    { key: "email", label: "Email" },
    { key: "session_count", label: "Sessions" },
    { key: "total_minutes", label: "Total minutes" }
  ],
  "trainer-client-counts": [
    { key: "trainer_name", label: "Trainer" },
    { key: "client_count", label: "Clients" },
    { key: "active_clients", label: "Active clients" }
  ],
  "goal-progress": [
    { key: "name", label: "User" },
    { key: "goal_type", label: "Goal type" },
    { key: "target_value", label: "Target" },
    { key: "current_value", label: "Current" },
    { key: "unit", label: "Unit" },
    { key: "deadline", label: "Deadline" },
    { key: "status", label: "Status" },
    { key: "progress_percent", label: "Progress %" }
  ],
  "frequent-exercises": [
    { key: "name", label: "Exercise" },
    { key: "muscle_group", label: "Muscle group" },
    { key: "times_performed", label: "Times performed" },
    { key: "total_reps", label: "Total reps" }
  ]
};

const reportKeys = Object.keys(reportLabels) as ReportKey[];

export default function Reports() {
  const [report, setReport] = useState<ReportKey>("weekly-workout-summary");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [query, setQuery] = useState<QueryInfo | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getReports(report)
      .then((result) => {
        if (cancelled) return;
        setRows(result.data);
        setQuery(result.query);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  const exportCsv = () => {
    const keys = reportColumns[report].map((column) => column.key);
    const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <div className="page-intro"><div><h2>SQL report library</h2><p>Parameterized, permission-aware analysis over relational data.</p></div><Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}><Download size={16} />Export CSV</Button></div>
    <Card className="report-hero"><div className="report-icon"><BarChart3 size={22} /></div><div><p className="eyebrow">Selected report</p><Select value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>{reportKeys.map((key) => <option key={key} value={key}>{reportLabels[key]}</option>)}</Select></div><div className="report-meta"><span><strong>{rows.length}</strong> rows</span><span><strong>{query ? query.ms.toFixed(1) : "—"}</strong> ms</span><Badge>Live query</Badge></div></Card>
    <Card className="table-card"><div className="card-heading"><div><p className="eyebrow">Report output</p><h3>{reportLabels[report]}</h3></div><span className="select-like">PostgreSQL · admin scope</span></div>
      {error && <p className="form-error table-error" role="alert">{error}</p>}
      {loading ? <p className="empty-note">Running query…</p> : <DataTable columns={reportColumns[report]} rows={rows} />}
      {query && <QueryPanel sql={query.sql} ms={query.ms} rows={rows.slice(0, 3)} />}
    </Card>
  </>;
}

const fieldLabel = (column: DatabaseSchema["tables"][number]["columns"][number]) =>
  `${column.name}${column.primaryKey ? " PK" : column.foreignKey.length ? " FK" : ""}${column.unique && !column.primaryKey ? " UNIQUE" : ""}`;

export function DatabaseExplorer() {
  const [tab, setTab] = useState<"diagram" | "schema">("diagram");
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getDatabaseSchema()
      .then((result) => setSchema(result.data))
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, []);

  const schemaRows = useMemo(
    () =>
      schema
        ? schema.tables.flatMap((table) =>
            table.columns.map((column) => ({
              table: table.name,
              column: column.name,
              type: column.type.toUpperCase(),
              constraint: column.primaryKey
                ? "PRIMARY KEY"
                : column.foreignKey.length
                  ? `FOREIGN KEY → ${column.foreignKey[0].table}.${column.foreignKey[0].column}`
                  : column.unique
                    ? "UNIQUE"
                    : column.nullable
                      ? "NULL allowed"
                      : "NOT NULL"
            }))
          )
        : [],
    [schema]
  );

  if (error) return <div className="page-loading"><span className="eyebrow">Connection error</span><p>{error}</p></div>;
  if (!schema) return <div className="page-loading"><span className="eyebrow">WellTrack</span><p>Loading data model…</p></div>;

  return <>
    <div className="page-intro"><div><h2>PostgreSQL data model</h2><p>{schema.tableCount} normalized tables with explicit keys and relationships.</p></div><Badge>{schema.tableCount} tables · {schema.relationshipCount} relations</Badge></div>
    <div className="tabs"><Button variant={tab === "diagram" ? "primary" : "ghost"} onClick={() => setTab("diagram")}>ER diagram</Button><Button variant={tab === "schema" ? "primary" : "ghost"} onClick={() => setTab("schema")}>Relational schema</Button></div>
    {tab === "diagram" ? (
      <div className="schema-grid">{schema.tables.map((table) => <Card className="schema-card" key={table.name}><div><Database size={15} /><strong>{table.name}</strong></div>{table.columns.map((column) => <span key={column.name}>{fieldLabel(column)}</span>)}</Card>)}</div>
    ) : (
      <Card className="table-card"><DataTable columns={[{ key: "table", label: "Table" }, { key: "column", label: "Column" }, { key: "type", label: "Data type" }, { key: "constraint", label: "Constraint" }]} rows={schemaRows} /></Card>
    )}
  </>;
}
