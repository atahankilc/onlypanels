// The only place controls are defined. Screens compose these and never style a button or field themselves.
// Two sizes: lg (44) floats on the map or is the main action, md (36) sits in a panel.
// Three surfaces: solid (the one main action), fill (in a panel), glass (on the map). Plain is for inside a stack.
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import "./ui.css";

type Size = "md" | "lg";
type Variant = "solid" | "fill" | "glass" | "plain";
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
type SegmentedProps<T> = { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void; variant?: "fill" | "glass"; size?: Size };
export function Segmented<T extends string>({ label, value, options, onChange, variant = "fill", size = "md" }: SegmentedProps<T>) {
  return (
    <div className={cx("seg", `seg-${variant}`, `seg-${size}`)} role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" disabled={o.disabled} className={o.value === value ? "on" : undefined} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Field({ label, value, hint, children }: { label: ReactNode; value?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span className="field-label"><span>{label}</span>{value !== undefined && <b>{value}</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { big?: boolean };
export const Input = ({ big, className, ...rest }: InputProps) => <input className={cx("control", big && "control-lg", className)} {...rest} />;
export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx("control", "control-select", className)} {...rest} />;

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

export const Section = ({ title, children }: { title?: string; children: ReactNode }) => <section>{title && <h2>{title}</h2>}{children}</section>;
