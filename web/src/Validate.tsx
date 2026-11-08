// The planner checks their own design: each size against what experts at this installer sold in similar homes, against
// the engine's proposal, and what it does to the home's energy. The same engine designs it with the planner's sizes locked;
// every number comes from the engine, the words around them are templates.
import { useMemo, useState } from "react";
import { Design, Overrides, Request, design, roofOf } from "./plan";
import { blockedOf, mergeCells } from "./roofObstacles";
import { Button, Field, Input, Segmented, Select } from "./ui";

const KWP_PER_MODULE = 0.45; // as the engine counts modules
type Rank = { value: number; below: number | null; n: number; low: number | null; mid: number | null; high: number | null; rate?: number };
type Standing = { pv: Rank; battery: Rank; heatpump?: { need_kw: number; heat_known: boolean; kwh_per_kw: number } };
type Checked = { d: Design & { standing?: Standing }; mine: { kwp: number; modules: number; battery: number; hp: number; wallbox: boolean } };

/** Typical, small or large for its kind: the same 10% and 90% marks the engine's own review uses. */
const verdict = (below: number | null | undefined, n: number) =>
  below == null || n < 5 ? { tag: "No comparison", tone: "" } : below >= 90 ? { tag: `Larger than ${below}% of ${n}`, tone: "warn" } : below <= 10 ? { tag: `Smaller than ${100 - below}% of ${n}`, tone: "warn" } : { tag: "Typical", tone: "ok" };

export default function Validate({ r, d }: { r: Request; d: Design }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [res, setRes] = useState<Checked | null>(null);
  const [kwp, setKwp] = useState(String(d.pv.kwp.toFixed(1))), [battery, setBattery] = useState(String(d.battery.kwh));
  const [hp, setHp] = useState(String(d.heatpump.included ? d.heatpump.kw : 0)), [wallbox, setWallbox] = useState(d.wallbox.included ? "yes" : "no");
  const buildings = (r as Request & { shaded?: Request["buildings"] }).shaded ?? r.buildings;
  const roof = useMemo(() => roofOf(buildings, r.installed, r.priority, mergeCells(r.taken, blockedOf(buildings, r.obstacles))), [buildings, r.installed, r.priority, r.taken, r.obstacles]);
  const heatRelevant = d.heatpump.included || ["Gas", "Oil", "OtherNonRenewable"].includes(r.inputs.heating ?? "");

  const check = () => {
    const modules = Math.max(1, Math.round(Number(kwp) / KWP_PER_MODULE)), hpKw = Number(hp) || 0;
    const o: Overrides = { ...r.overrides, modules, battery_kwh: Number(battery) || 0, wallbox: wallbox === "yes", heatpump: hpKw > 0 };
    setBusy(true);
    design(r.inputs, o, roof, r.off, r.existing, r.strict)
      .then(({ d: mine }) => setRes({ d: mine, mine: { kwp: mine.pv.kwp, modules, battery: Number(battery) || 0, hp: hpKw, wallbox: wallbox === "yes" } }))
      .finally(() => setBusy(false));
  };

  if (!open) return <section className="validate">
    <div className="validate-head"><b>Check your own design</b><Button onClick={() => setOpen(true)}>Open</Button></div>
    <p className="small muted">Enter the system you would offer. Each part is set against what experts at this installer sold in similar homes, and against the engine's proposal.</p>
  </section>;

  const s = res?.d.standing, need = s?.heatpump?.need_kw;
  const hpRatio = res && need && res.mine.hp ? res.mine.hp / need : null;
  const rows = res && s ? [
    { part: "Solar", yours: `${res.mine.kwp.toFixed(1)} kWp`, engine: `${d.pv.kwp.toFixed(1)} kWp`, similar: s.pv.low != null ? `${s.pv.low}–${s.pv.high} kWp` : "–",
      // The measured roof comes first: a size that does not fit is wrong however usual it is elsewhere.
      ...(d.pv.max_modules != null && res.mine.modules > d.pv.max_modules ? { tag: `More than the roof holds: about ${d.pv.max_modules} modules, ${(d.pv.max_modules * KWP_PER_MODULE).toFixed(1)} kWp`, tone: "warn" } : verdict(s.pv.below, s.pv.n)) },
    { part: "Battery", yours: res.mine.battery ? `${res.mine.battery} kWh` : "None", engine: d.battery.kwh ? `${d.battery.kwh} kWh` : "None",
      similar: s.battery.low != null ? `${s.battery.low}–${s.battery.high} kWh · ${s.battery.rate}% buy one` : "–",
      ...(res.mine.battery ? verdict(s.battery.below, s.battery.n) : (s.battery.rate ?? 0) >= 80 ? { tag: `${s.battery.rate}% of similar homes bought one`, tone: "warn" } : { tag: "Typical", tone: "ok" }) },
    ...(heatRelevant ? [{ part: "Heat pump", yours: res.mine.hp ? `${res.mine.hp} kW` : "None", engine: d.heatpump.included ? `${d.heatpump.kw} kW` : "None",
      similar: need ? `${need} kW for ${s.heatpump?.heat_known ? "the stated" : "an assumed"} heat` : "–",
      ...(hpRatio == null ? { tag: res.mine.hp ? "No heat figure" : "–", tone: "" } : hpRatio > 1.35 ? { tag: `${Math.round((hpRatio - 1) * 100)}% above the need`, tone: "warn" } : hpRatio < 0.75 ? { tag: `${Math.round((1 - hpRatio) * 100)}% below the need`, tone: "warn" } : { tag: "Fits the need", tone: "ok" }) }] : []),
    { part: "Wallbox", yours: res.mine.wallbox ? "Yes" : "No", engine: d.wallbox.included ? "Yes" : "No", similar: `${d.similar.wallbox_rate}% have one`,
      ...(res.mine.wallbox !== !!r.inputs.ev ? { tag: r.inputs.ev ? "The customer drives electric" : "No car given", tone: "warn" } : { tag: "Fits the answers", tone: "ok" }) },
  ] : [];
  const e = res?.d.energy, flags = res?.d.review.filter((n) => n.level === "warn") ?? [];
  const unusual = rows.filter((x) => x.tone === "warn").length;

  return <section className="validate">
    <div className="validate-head"><b>Check your own design</b><button type="button" className="textlink" onClick={() => { setOpen(false); setRes(null); }}>Close</button></div>
    <div className="validate-form">
      <Field label="Solar (kWp)"><Input type="number" step={0.45} min={0} value={kwp} onChange={(e) => setKwp(e.target.value)} /></Field>
      <Field label="Battery (kWh)"><Select value={battery} onChange={(e) => setBattery(e.target.value)}>
        <option value="0">None</option>{[...new Set([...d.battery.choices, d.battery.kwh].filter((c) => c > 0))].sort((a, b) => a - b).map((c) => <option key={c} value={c}>{c} kWh</option>)}
      </Select></Field>
      {heatRelevant && <Field label="Heat pump (kW)"><Input type="number" step={1} min={0} value={hp} onChange={(e) => setHp(e.target.value)} /></Field>}
      <div className="validate-wb"><span>Wallbox</span><Segmented wide label="Wallbox" value={wallbox} onChange={setWallbox} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></div>
    </div>
    <Button variant="solid" onClick={check} disabled={busy || !(Number(kwp) > 0)}>{busy ? "Checking…" : "Check this design"}</Button>
    {res && e && <div className="validate-out" aria-live="polite">
      <p className={unusual ? "flag" : "small muted"}>{unusual ? `${unusual} ${unusual === 1 ? "part needs" : "parts need"} a second look, against the roof, the answers or similar homes. Have a reason ready for the customer.` : "Every part is within what experts sold in similar homes."}</p>
      <table className="grid">
        <thead><tr><th /><th>Yours</th><th>Engine</th><th>Similar homes</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.part}><th scope="row">{x.part}</th><td>{x.yours}</td><td>{x.engine}</td><td>{x.similar}<small className={`verdict ${x.tone}`}>{x.tag}</small></td></tr>)}</tbody>
      </table>
      <dl className="rows">
        <div><dt>Makes a year</dt><dd>{e.production_mwh.toFixed(1)} MWh <small>engine: {d.energy.production_mwh.toFixed(1)}</small></dd></div>
        <div><dt>Own power</dt><dd>{e.self_sufficiency_pct}% <small>engine: {d.energy.self_sufficiency_pct}%</small></dd></div>
        <div><dt>Saving a year</dt><dd>€{e.saving_eur.toLocaleString("en")} <small>engine: €{d.energy.saving_eur.toLocaleString("en")}</small></dd></div>
      </dl>
      {flags.map((n) => <p key={n.code} className="flag">{n.text}</p>)}
      <p className="small muted">Similar homes: {s?.pv.n} past designs at this installer with about this yearly use; the range is their middle 80%.{heatRelevant && s?.heatpump ? ` The heat pump has too few past sales to rank, so it is set against the rule the engine sizes by (${s.heatpump.kwh_per_kw.toLocaleString("en")} kWh of heat per kW).` : ""}</p>
    </div>}
  </section>;
}
