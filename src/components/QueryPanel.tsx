import { ChevronDown, Code2 } from "lucide-react";
import { useState } from "react";
import { DataTable } from "./DataTable";
import { Button } from "./ui";

export function QueryPanel({ sql, ms, rows }: { sql: string; ms: number; rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  const columns = rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key.replaceAll("_", " ") })) : [];
  return (
    <div className="query-panel">
      <Button variant="ghost" className="query-toggle" onClick={() => setOpen(!open)}>
        <Code2 size={15} /> View SQL Query <ChevronDown size={15} className={open ? "rotate" : ""} />
      </Button>
      {open && (
        <div className="query-content">
          <div className="query-meta"><span>PostgreSQL</span><span>{rows.length} rows</span><span>{ms} ms</span></div>
          <pre><code>{sql}</code></pre>
          {rows.length > 0 && <DataTable columns={columns} rows={rows} />}
        </div>
      )}
    </div>
  );
}
