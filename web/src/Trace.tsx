// The engine's own decision steps, and what a change did. Every number shown here comes from the engine.
import { useEffect, useState } from "react";
import { Design, Source, TraceStep } from "./plan";
import { Button } from "./ui";

const KIND: Record<TraceStep["kind"], string> = { measured: "Measured", learned: "Learned", rule: "Rule", physics: "Estimate", input: "Input" };
const TAG: Record<Source | "measured", string> = { customer: "Customer", assumed: "Assumed", planner: "You", measured: "Measured" };

/** Each step shows its result. Opening it shows what went in, where that came from, and how it was decided. */
export function Trace({ steps, sources, lit }: { steps: TraceStep[]; sources: Record<string, Source>; lit: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return <ol className="trace">
    {steps.map((s, n) => {
      const on = open === s.id;
      return <li key={s.id} className={`${on ? "open" : ""}${lit.includes(s.id) ? " lit" : ""}`}>
        <button type="button" className="trace-head" aria-expanded={on} onClick={() => setOpen(on ? null : s.id)}>
          <i>{n + 1}</i>
          <span className="trace-title"><b>{s.title}</b><em className={`kind ${s.kind}`}>{KIND[s.kind]}</em>{s.by === "planner" && <em className="kind you">You</em>}</span>
          <span className="trace-result">{s.result}</span>
        </button>
        {on && <div className="trace-body">
          {s.inputs.length > 0 && <ul className="trace-in">{s.inputs.map((f) => {
            const tag = f.key === "surfaces" ? "measured" : f.key ? sources[f.key] : undefined;
            return <li key={f.label}><span>{f.label}</span><b>{f.value}</b>{tag && <em className={tag}>{TAG[tag]}</em>}</li>;
          })}</ul>}
          <p>{s.how}</p>
          {s.context && <p className="trace-context">{s.context}</p>}
        </div>}
      </li>;
    })}
  </ol>;
}

export type Change = { label: string; before: Design; after: Design; undo: () => void };

const kwh = (v: number) => (v ? `${v} kWh` : "none");
const yes = (v: boolean, what: string) => (v ? what : "none");

/** What one change did to the design, with the engine's reason for each line that moved. */
export function ChangeCard({ c, close }: { c: Change; close: () => void }) {
  const a = c.before, b = c.after, rows: [string, string, string, string][] = [];
  if (a.energy.total_mwh !== b.energy.total_mwh) rows.push(["Need", `${a.energy.total_mwh.toFixed(1)} MWh`, `${b.energy.total_mwh.toFixed(1)} MWh`, ""]);
  if (a.pv.modules !== b.pv.modules) rows.push(["Solar", `${a.pv.modules} modules`, `${b.pv.modules} modules`, b.pv.locked ? "you fixed it" : b.pv.capped ? "the roof limits it" : a.energy.total_mwh !== b.energy.total_mwh ? "follows the need" : "re-sized"]);
  if (a.battery.kwh !== b.battery.kwh) rows.push(["Battery", kwh(a.battery.kwh), kwh(b.battery.kwh), b.battery.locked ? "you chose it" : a.pv.modules !== b.pv.modules ? `follows ${b.pv.kwp.toFixed(1)} kWp solar` : "re-sized"]);
  else if (a.pv.modules !== b.pv.modules && b.battery.kwh) rows.push(["Battery", kwh(b.battery.kwh), "same", "the next size up is not needed"]);
  if (a.wallbox.included !== b.wallbox.included) rows.push(["Wallbox", yes(a.wallbox.included, "included"), yes(b.wallbox.included, "included"), b.wallbox.locked ? "you chose it" : b.wallbox.included ? "for the car" : "no car"]);
  if (a.heatpump.included !== b.heatpump.included || a.heatpump.kw !== b.heatpump.kw) rows.push(["Heat pump", yes(a.heatpump.included, `${a.heatpump.kw} kW`), yes(b.heatpump.included, `${b.heatpump.kw} kW`), b.heatpump.locked ? "you chose it" : ""]);
  if (a.energy.production_mwh !== b.energy.production_mwh) rows.push(["Makes", `${a.energy.production_mwh.toFixed(1)} MWh`, `${b.energy.production_mwh.toFixed(1)} MWh`, ""]);
  // A change that moves nothing in the design (the photo checked as the request opens, a fact confirmed) says so on one line and
  // goes by itself; a card that stayed on every tab saying "the design stays the same" told the planner nothing.
  useEffect(() => { if (rows.length) return; const t = setTimeout(close, 4000); return () => clearTimeout(t); }, [c]);
  if (!rows.length) return <p className="change quiet" aria-live="polite"><b>{c.label}</b><span>Design unchanged</span><Button variant="plain" onClick={c.undo}>Undo</Button></p>;
  return <section className="change" aria-live="polite">
    <header><b>{c.label}</b><Button onClick={c.undo}>Undo</Button><Button variant="plain" aria-label="Close" onClick={close}>×</Button></header>
    <table><tbody>{rows.map(([what, from, to, why]) => <tr key={what}><th scope="row">{what}</th><td>{from}</td><td>→</td><td><b>{to}</b></td><td>{why}</td></tr>)}</tbody></table>
  </section>;
}

/** Which steps a change touched, so the trace can light them up. */
export const touched = (a: Design, b: Design) => {
  const t: string[] = [];
  if (a.energy.total_mwh !== b.energy.total_mwh) t.push("need");
  if (a.pv.max_modules !== b.pv.max_modules) t.push("roof");
  if (a.pv.modules !== b.pv.modules) t.push("pv");
  if (a.battery.kwh !== b.battery.kwh) t.push("battery");
  if (a.heatpump.included !== b.heatpump.included) t.push("heatpump");
  if (a.wallbox.included !== b.wallbox.included) t.push("wallbox");
  if (t.length) t.push("energy", "review");
  return t;
};
