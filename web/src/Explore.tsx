// The homeowner tries the offer: only what the planner allowed, each variant computed by the same engine on the same facts.
// The numbers are the engine's; the sentence around them is a template.
import { useEffect, useMemo, useState } from "react";
import { Design, Mine, Overrides, design, designBody, roofOf } from "./plan";
import type { Selected } from "./api";
import { withTrees } from "./treeShade";
import type { Costs } from "./money";
import { Button, Input, Slider } from "./ui";
import { ask, describeChange, useAsks } from "./asks";
import "./asks.css";

type Variant = { battery_kwh?: number; wallbox?: boolean; modules?: number };
const eur = (v: number) => `€${v.toLocaleString("en")}`;

export default function Explore({ m, onPanels }: { m: Mine; onPanels?: (p: Record<string, number> | null) => void }) {
  const o = m.offer!, b = o.basis!, allowed = o.allowed ?? [];
  // The roof on the trees' sun, as the planner designed the offer: without them a tried change starts from other yields.
  // A home the homeowner kept to themselves never reached the planner: the offer was designed without it, and so is every change.
  const sentHomes = m.handoff.shared?.home === false ? [] : m.handoff.buildings;
  const [homes, setHomes] = useState<Selected[] | null>(sentHomes.length ? null : sentHomes);
  // An offer designed without trees is tried without them; one with them waits for them, tried again if the tree map is away.
  useEffect(() => {
    if (!sentHomes.length) return;
    if (b.trees === false) { setHomes(sentHomes); return; }
    let live = true, t = 0;
    const go = (k: number) => withTrees(sentHomes).then((x) => {
      if (!live) return;
      if (x.shade.status === "unknown" && k < 3) t = window.setTimeout(() => go(k + 1), 2000 * (k + 1)); else setHomes(x.buildings);
    }, () => live && setHomes(sentHomes));
    go(0);
    return () => { live = false; clearTimeout(t); };
  }, [m.ref]);
  const roof = useMemo(() => (homes ? roofOf(homes, b.installed, b.priority, b.taken, b.obstacles) : null), [homes]);
  const [v, setV] = useState<Variant>({});
  const [out, setOut] = useState<{ d: Design; panels: Record<string, number> } | null>(null);
  // The offer carries the planner's price and first year when it was priced: the change is then priced the same way.
  const priced = o.pays_eur != null;
  const [money, setMoney] = useState<Costs | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(""), [asking, setAsking] = useState(false);
  const asked = useAsks(m.ref);
  useEffect(() => {
    if (!roof) return;
    let live = true;
    setBusy(true);
    const o2 = { ...b.overrides, ...v } as Overrides;
    const t = setTimeout(() => Promise.all([design(b.inputs, o2, roof, b.off, b.existing, b.strict),
      priced && Object.keys(v).length ? fetch("/api/costs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...designBody(b.inputs, o2, roof, b.off, b.existing, b.strict).body, ...(b.money ? { money: b.money } : {}) }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)])
      .then(([x, c]) => { if (live) { setOut(x); setMoney(c); setBusy(false); } }).catch(() => live && setBusy(false)), 150);
    return () => { live = false; clearTimeout(t); };
  }, [v, roof]);
  useEffect(() => { onPanels?.(out?.panels ?? null); }, [out]);
  useEffect(() => () => onPanels?.(null), []);

  const battery = v.battery_kwh ?? o.battery_kwh, wallbox = v.wallbox ?? o.wallbox, modules = v.modules ?? o.modules;
  // The offer's size and the catalog's nearest few around it: enough to feel the trade-off, not the whole price list.
  const around = o.battery_kwh || 10;
  const sizes = allowed.includes("battery_size")
    ? [...new Set([...(o.choices ?? []).filter((c) => c > 0 && c <= 25).sort((x, y) => Math.abs(x - around) - Math.abs(y - around)).slice(0, 5), ...(o.battery_kwh ? [o.battery_kwh] : [])])].sort((x, y) => x - y)
    : o.battery_kwh ? [o.battery_kwh] : [];
  const canBattery = !b.inputs.has_storage && (allowed.includes("battery_size") || allowed.includes("no_battery"));
  const fewest = Math.max(4, Math.round(o.modules * 0.5));
  const changed = Object.keys(v).length > 0, d = out?.d;
  const set = (x: Variant) => setV((now) => {
    const next = { ...now, ...x };
    (Object.keys(next) as (keyof Variant)[]).forEach((k) => { if (next[k] === (k === "battery_kwh" ? o.battery_kwh : k === "wallbox" ? o.wallbox : o.modules)) delete next[k]; });
    return next;
  });
  if (!canBattery && !allowed.includes("wallbox") && !allowed.includes("fewer_modules")) return null;

  /** One plain sentence: what the change does to own power and the saving, against the offer. */
  // Counted as the offer counts it: the first year after upkeep when the offer was priced, else the electricity saving.
  const saving = (x: Design) => (priced && money ? money.year1.total_eur : x.energy.saving_eur);
  const sentence = () => {
    if (!d) return "";
    const what = describeChange(v);
    const own = d.energy.self_sufficiency_pct, save = saving(d);
    return `With ${what}, about ${own}% of your use would come from your own power (offer: ${o.self_sufficiency_pct}%), and you would save about ${eur(save)} a year (offer: ${eur(o.saving_eur)}).`;
  };

  return <section className="explore" aria-label="Try the offer">
    <h3>Try changes</h3>
    <p className="small muted">Your installer allows these. Each is worked out by the same engine on the same facts about your home.</p>
    {canBattery && <div className="explore-row">
      <span>Battery</span>
      <div className="explore-pick" role="group" aria-label="Battery">
        {allowed.includes("no_battery") && <Button aria-pressed={battery === 0} onClick={() => set({ battery_kwh: 0 })}>None</Button>}
        {sizes.map((s) => <Button key={s} aria-pressed={battery === s} onClick={() => set({ battery_kwh: s })}>{s} kWh{s === o.battery_kwh ? <small> offer</small> : null}</Button>)}
      </div>
    </div>}
    {allowed.includes("wallbox") && <div className="explore-row">
      <span>Wallbox</span>
      <div className="explore-pick" role="group" aria-label="Wallbox">
        <Button aria-pressed={wallbox} onClick={() => set({ wallbox: true })}>With</Button>
        <Button aria-pressed={!wallbox} onClick={() => set({ wallbox: false })}>Without</Button>
      </div>
    </div>}
    {allowed.includes("fewer_modules") && o.modules > fewest && <div className="explore-row">
      <span>Solar</span>
      <div className="explore-slide">
        <Slider min={fewest} max={o.modules} value={modules} onChange={(e) => set({ modules: Number(e.target.value) })} aria-label="Solar modules" />
        <b>{modules} modules · {(modules * (o.kwp / o.modules)).toFixed(1)} kWp</b>
      </div>
    </div>}
    {changed && <div className={busy ? "explore-out busy" : "explore-out"} aria-live="polite">
      <table>
        <thead><tr><th /><th>Offer</th><th>Your change</th></tr></thead>
        <tbody>
          <tr><th scope="row">Makes</th><td>{o.production_mwh.toFixed(1)} MWh</td><td>{d ? `${d.energy.production_mwh.toFixed(1)} MWh` : "…"}</td></tr>
          <tr><th scope="row">Own power</th><td>{o.self_sufficiency_pct}%</td><td>{d ? `${d.energy.self_sufficiency_pct}%` : "…"}</td></tr>
          {priced && <tr><th scope="row">You pay</th><td>{eur(o.pays_eur!)}</td><td>{money ? eur(money.pays_eur) : "…"}</td></tr>}
          <tr><th scope="row">{priced ? "Saving, first year" : "Saving a year"}</th><td>{eur(o.saving_eur)}</td><td>{d && (!priced || money) ? eur(saving(d)) : "…"}</td></tr>
          {priced && <tr><th scope="row">Pays back</th><td>{o.payback_years != null ? `${Math.round(o.payback_years)} years` : "–"}</td><td>{money ? (money.payback_years != null ? `${Math.round(money.payback_years)} years` : "–") : "…"}</td></tr>}
        </tbody>
      </table>
      {d && (!priced || money) && <p>{sentence()}</p>}
      <p className="small muted">An estimate to compare, within what your installer allows. The offer stays as sent until you agree a change with them.</p>
      {d && !asking && <div className="ask-row">
        <Button onClick={() => setAsking(true)}>Ask my installer about this</Button>
        <button type="button" className="textlink" onClick={() => setV({})}>Back to the offer</button>
      </div>}
      {d && asking && <div className="ask-form">
        <Input value={note} maxLength={240} placeholder="Anything to add? (optional)" aria-label="A line for your installer" onChange={(e) => setNote(e.target.value)} />
        <div className="ask-row">
          <Button variant="solid" onClick={() => { ask({ ref: m.ref, change: v, own: d.energy.self_sufficiency_pct, saving: saving(d), offerOwn: o.self_sufficiency_pct, offerSaving: o.saving_eur, note: note.trim() }); setAsking(false); setNote(""); setV({}); }}>Send the question</Button>
          <button type="button" className="textlink" onClick={() => setAsking(false)}>Cancel</button>
        </div>
      </div>}
      {!d && <button type="button" className="textlink" onClick={() => setV({})}>Back to the offer</button>}
    </div>}
    {asked.length > 0 && <ul className="asked" aria-label="Your questions">{asked.map((x) => <li key={x.id}>
      <span><b>{describeChange(x.change).replace(/^./, (c) => c.toUpperCase())}</b>{x.note && <small>“{x.note}”</small>}</span>
      <em className={x.answered ? "is-answered" : ""}>{x.answered ? "Answered: see the offer" : "Sent to your installer"}</em>
    </li>)}</ul>}
  </section>;
}
