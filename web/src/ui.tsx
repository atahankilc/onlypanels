// The only place controls are defined. Screens compose these and never style a button or field themselves.
// Two sizes: lg (44) floats on the map or is the main action, md (36) sits in a panel.
// Three surfaces: solid (the one main action), fill (in a panel), glass (on the map). Plain is for inside a stack.
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useEffect, useId, useRef } from "react";
import { Close } from "./icons";
import "./ui.css";

type Size = "md" | "lg";
type Variant = "solid" | "fill" | "glass" | "plain" | "dev";
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; wide?: boolean };
export function Button({ variant = "fill", size = "md", wide, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx("btn", `btn-${variant}`, `btn-${size}`, wide && "btn-wide", className)} {...rest} />;
}

type IconButtonProps = Omit<ButtonProps, "wide"> & { label: string };
export function IconButton({ label, variant = "fill", size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return <button type={type} aria-label={label} title={label} className={cx("btn", "btn-icon", `btn-${variant}`, `btn-${size}`, className)} {...rest} />;
}

type Option<T> = { value: T; label: string; disabled?: boolean };
type SegmentedProps<T> = { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void; variant?: "fill" | "glass" | "dev"; size?: Size; wide?: boolean };
export function Segmented<T extends string>({ label, value, options, onChange, variant = "fill", size = "md", wide }: SegmentedProps<T>) {
  return (
    <div className={cx("seg", `seg-${variant}`, `seg-${size}`, wide && "seg-wide")} role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" disabled={o.disabled} className={o.value === value ? "on" : undefined} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Field({ label, value, hint, children }: { label: ReactNode; value?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span className="field-label"><span>{label}</span>{value !== undefined && <b>{value}</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx("control", className)} {...rest} />;
export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx("control", className)} {...rest} />;

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></i>
      <span>{children}</span>
    </label>
  );
}

export function Slider({ min = 0, max = 100, value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "min" | "max" | "value"> & { min?: number; max?: number; value: number }) {
  const at = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return <input type="range" className="slider" style={{ "--at": `${at}%` } as React.CSSProperties} min={min} max={max} value={value} {...rest} />;
}

/** A number field with its unit inside the pill: "€ 115 / module". Commits on blur or Enter, like the other fields. */
export function Amount({ prefix, suffix, className, value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "prefix"> & { prefix?: string; suffix?: string }) {
  const w = Math.max(3, String(value ?? rest.defaultValue ?? "").length + 1);
  return <span className={cx("control", "amount", className)} style={{ "--w": w } as React.CSSProperties}>
    {prefix && <i>{prefix}</i>}<input type="number" step="any" value={value} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} {...rest} />{suffix && <i>{suffix}</i>}
  </span>;
}

/** One answer among a few, as a tile: a coloured icon, a word, and at most a few words under it. Pressed, it takes its colour. */
export function Tile({ icon, label, sub, color, pressed, onClick }: { icon: ReactNode; label: string; sub?: string; color: string; pressed: boolean; onClick: () => void }) {
  return <button type="button" className="tile" aria-pressed={pressed} style={{ "--c": color } as React.CSSProperties} onClick={onClick}><i>{icon}</i><b>{label}</b>{sub && <small>{sub}</small>}</button>;
}

/** A modal over the page: title and close at the top, the content, the actions at the bottom. Esc or a click outside closes it. */
export function Modal({ open, title, onClose, children, actions }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <dialog ref={ref} className="modal" aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
    {open && <div className="modal-box">
      <header><h2 id={id}>{title}</h2><IconButton variant="plain" label="Close" onClick={onClose}><Close /></IconButton></header>
      <div className="modal-body">{children}</div>
      {actions && <footer>{actions}</footer>}
    </div>}
  </dialog>;
}
