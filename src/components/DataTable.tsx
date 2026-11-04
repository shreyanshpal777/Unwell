import { MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "./ui";

export function DataTable({
  columns,
  rows,
  onDelete,
  onEdit
}: {
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  onDelete?: (row: Record<string, unknown>) => void;
  onEdit?: (row: Record<string, unknown>) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{(onDelete || onEdit) && <th aria-label="Actions" />}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => <td key={column.key}>{column.key === "status" || column.key === "role" ? <span className="badge badge-green">{String(row[column.key])}</span> : String(row[column.key] ?? "—")}</td>)}
              {(onDelete || onEdit) && <td className="table-action">{onEdit && <Button variant="ghost" aria-label="Edit record" onClick={() => onEdit(row)}><Pencil size={17} /></Button>}{onDelete && <Button variant="ghost" aria-label="Row actions" onClick={() => onDelete(row)}><MoreHorizontal size={18} /></Button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
