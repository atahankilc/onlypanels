// How close the engine comes to experts on past projects it never saw. Every number is from scripts/build_proof.py.
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Segmented, Select } from "./ui";

type Pair = Record<string, number>;
type Summary = { projects: number; kwp_gap: Pair; kwp_within20: Pair; battery_same: Pair; battery_gap: Pair; experts: { homes: number; kwp_gap: number; battery_same: number; battery_gap: number } };
type Option = { kwp: number; modules: number; battery_kwh: number; wallbox: boolean; hp_kw?: number; hp?: boolean };
type Home = { n: number; installer: string; facts: { demand_mwh: number | null; heating: string | null; heat_mwh: number | null; ev: boolean; has_solar: boolean; has_storage: boolean }; engine: Option; experts: Option[]; kwp_gap: number; battery_same: boolean };
type Proof = { projects: number; folds: number; summary: Record<string, Summary>; checks: Record<string, number>; check_homes: number; homes: Home[] };

const CHECKS: [string, string][] = [
  ["ev_never_shrinks_pv", "Adding a car never shrinks solar"], ["ev_grows_pv", "Adding a car grows solar"], ["ev_never_shrinks_battery", "Adding a car never shrinks the battery"],
  ["heat_pump_never_shrinks_pv", "A heat pump never shrinks solar"], ["more_pv_never_shrinks_battery", "More solar never shrinks the battery"], ["area_limit_respected", "The roof limit always holds"],
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const kwp = (v: number) => `${v.toFixed(1)} kWp`;
const system = (o: Option) => `${o.kwp.toFixed(1)} kWp · ${o.battery_kwh ? `${o.battery_kwh} kWh` : "no battery"}${o.wallbox ? " · wallbox" : ""}${o.hp || o.hp_kw ? " · heat pump" : ""}`;

/** One measure, a few methods side by side. The engine's bar carries the accent; the value is written on every bar. */
function Bars({ title, note, rows, format, lower }: { title: string; note: string; rows: [string, number, boolean?][]; format: (v: number) => string; lower?: boolean }) {
  const top = Math.max(...rows.map((r) => r[1]), 1e-9);
  return <figure className="bars">
    <figcaption><b>{title}</b><small>{note} {lower ? "Shorter is better." : "Longer is better."}</small></figcaption>
    {rows.map(([label, v, ours]) => <div key={label} className={`bars-row${ours ? " ours" : ""}`} title={`${label}: ${format(v)}`}>
      <span>{label}</span><i><b style={{ width: `${(v / top) * 100}%` }} /></i><em>{format(v)}</em>
    </div>)}
  </figure>;
}

export default function ProofPage() {
  const [p, setP] = useState<Proof | null>(null);
  const [failed, setFailed] = useState(false);
  const [who, setWho] = useState("A");
  const [order, setOrder] = useState<"mixed" | "close" | "far">("mixed");
  const [shown, setShown] = useState(20);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { fetch("/api/proof").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setP).catch(() => setFailed(true)); }, []);
  const homes = useMemo(() => {
    const list = (p?.homes ?? []).filter((h) => h.installer === who);
    return order === "mixed" ? list : [...list].sort((a, b) => (order === "close" ? a.kwp_gap - b.kwp_gap : b.kwp_gap - a.kwp_gap));
  }, [p, who, order]);
  if (failed) return <p className="muted">Proof is not prepared. Run <code>uv run python scripts/build_proof.py</code>.</p>;
  if (!p) return <p className="muted">Loading past projects…</p>;
  const s = p.summary[who], few = s.experts.homes < 30;

  return <div className="proof">
    <p className="muted">Each of {p.projects.toLocaleString("en")} past projects was proposed by an engine trained without it, then compared with what the installer's expert sold. The home's roof and address are not in these projects, so this is the engine at its weakest.</p>
    <Segmented label="Installer" value={who} onChange={(v) => { setWho(v); setShown(20); setOpen(null); }} options={[{ value: "A", label: `Installer A · ${p.summary.A.projects}` }, { value: "B", label: `Installer B · ${p.summary.B.projects}` }]} />

    <div className="proof-grid">
      <Bars title="Solar: typical gap to the expert" lower note="Average difference from the closest option the expert offered." format={kwp}
        rows={[["Engine", s.kwp_gap.engine, true], ["Same design for every home", s.kwp_gap.typical], [`Expert's own two options${few ? ` (${s.experts.homes} homes)` : ""}`, s.experts.kwp_gap]]} />
      <Bars title="Solar: within 20% of the expert" note="Share of homes." format={pct}
        rows={[["Engine", s.kwp_within20.engine, true], ["Same design for every home", s.kwp_within20.typical]]} />
      <Bars title="Battery: same size as the expert" note="Among homes where both have a battery." format={pct}
        rows={[["Engine", s.battery_same.engine, true], ["Installer's most common size", s.battery_same.habit], [`Expert's own two options${few ? ` (${s.experts.homes} homes)` : ""}`, s.experts.battery_same]]} />
      <Bars title="Battery: typical gap to the expert" lower note="Average difference in kWh." format={(v) => `${v.toFixed(1)} kWh`}
        rows={[["Engine", s.battery_gap.engine, true], ["Installer's most common size", s.battery_gap.habit], [`Expert's own two options${few ? ` (${s.experts.homes} homes)` : ""}`, s.experts.battery_gap]]} />
    </div>

    <div className="proof-read">
      <h3>What this says</h3>
      <ul>
        <li>Solar: the engine is closer to the expert than one design for every home, but further away than an expert's own two options for the same home. The roof is missing from these projects, which is one likely reason; the planner desk adds the measured roof, but we cannot score that here.</li>
        <li>Battery: when its own answer is within 2 kWh of the installer's usual size, the engine takes the usual size, as experts mostly do. It still matches the expert less often than always picking the usual size, and is closer in kWh only at installer A. So the desk shows the sizes this installer sells and what similar homes bought, and the planner picks.</li>
        <li>Experts disagree with themselves too. A design within that spread is as good as another expert's.</li>
      </ul>
    </div>

    <h3>Does it react like an expert?</h3>
    <p className="small muted">On {p.check_homes} homes the engine had not seen, each change was made and the new design checked.</p>
    <ul className="checks">{CHECKS.map(([k, label]) => <li key={k}><span>{label}</span><b>{pct(p.checks[k])}</b></li>)}</ul>

    <div className="proof-list-head"><h3>Past projects, installer {who}</h3>
      <Select aria-label="Order" value={order} onChange={(e) => { setOrder(e.target.value as typeof order); setShown(20); }}><option value="mixed">Mixed</option><option value="close">Closest first</option><option value="far">Furthest first</option></Select></div>
    <table className="inbox proof-table"><thead><tr><th>#</th><th>Home</th><th>Engine</th><th>Expert</th><th>Solar gap</th></tr></thead>
      <tbody>{homes.slice(0, shown).map((h) => { const f = h.facts; return <Fragment key={h.n}>
        <tr tabIndex={0} onClick={() => setOpen(open === h.n ? null : h.n)} onKeyDown={(e) => e.key === "Enter" && setOpen(open === h.n ? null : h.n)}>
          <td className="mono">{h.n}</td>
          <td>{f.demand_mwh == null ? "use unknown" : `${f.demand_mwh} MWh`}{f.heating ? ` · ${f.heating === "OtherNonRenewable" ? "other fossil" : f.heating === "Heatpump" ? "heat pump" : f.heating.toLowerCase()}` : ""}{f.ev ? " · car" : ""}</td>
          <td className="mono">{system(h.engine)}</td>
          <td className="mono">{system(h.experts[h.experts.length - 1])}{h.experts.length > 1 ? <small> +{h.experts.length - 1} more</small> : null}</td>
          <td className="mono">{h.kwp_gap.toFixed(1)}</td>
        </tr>
        {open === h.n && <tr className="proof-open"><td /><td colSpan={4}>
          <dl className="rows">
            <div><dt>Facts the engine had</dt><dd>{[f.demand_mwh != null && `${f.demand_mwh} MWh a year`, f.heating && `heating: ${f.heating}`, f.heat_mwh && `${f.heat_mwh} MWh heat`, f.ev && "electric car", f.has_solar && "has solar", f.has_storage && "has a battery"].filter(Boolean).join(", ") || "almost none"}</dd></div>
            <div><dt>Engine</dt><dd>{h.engine.modules} modules, {system(h.engine)}</dd></div>
            {h.experts.map((o, k) => <div key={k}><dt>Expert option {k + 1}</dt><dd>{o.modules ? `${o.modules} modules, ` : ""}{system(o)}</dd></div>)}
            <div><dt>Battery size</dt><dd>{h.battery_same ? "same as an expert option" : "different"}</dd></div>
          </dl>
        </td></tr>}
      </Fragment>; })}</tbody></table>
    {shown < homes.length && <Button onClick={() => setShown(shown + 40)}>Show more ({homes.length - shown} left)</Button>}
  </div>;
}
