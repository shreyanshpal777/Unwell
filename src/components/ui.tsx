import { X } from "lucide-react";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="field" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="field" {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "gray" | "amber" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Modal({ open, title, eyebrow = "New record", children, onClose }: { open: boolean; title: string; eyebrow?: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <Button variant="ghost" aria-label="Close" onClick={onClose}><X size={19} /></Button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ProgressIndicator({ value }: { value: number }) {
  return <div className="progress"><span style={{ width: `${Math.min(value, 100)}%` }} /></div>;
}
