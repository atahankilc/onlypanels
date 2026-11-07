import { useEffect, useRef, useState } from "react";
import { View, surfaceKey } from "./api";
import HomeMap, { Face, SUN_HIGH, SUN_LOW } from "./HomeMap";
import { Back } from "./icons";
import { Design, Handoff, Inputs, Overrides, Request, Source, Spot, design, facing, fromHomeowner, loadHome, refine, roofOf, turnTo } from "./plan";
import { Change, ChangeCard, Trace, touched } from "./Trace";
import "./planner.css";
import ProofPage from "./Proof";
import Offer from "./Offer";
import { Options } from "./Options";
import { Button, Check, Field, Input, Segmented, Select, Slider } from "./ui";

const LEFT = 620;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SOURCE: Record<Source, string> = { customer: "Customer", assumed: "Assumed", planner: "You" };
const INSTALLERS: [string, string][] = [["2a8ba8e2", "Installer A"], ["23c108b7", "Installer B"]];
const HEATS: [string, string][] = [["", "Unknown"], ["Gas", "Gas"], ["Oil", "Oil"], ["OtherNonRenewable", "Other fossil"], ["Heatpump", "Heat pump"]];
const summary = (d: Design) => `${d.pv.kwp.toFixed(1)} kWp · ${d.battery.kwh ? `${d.battery.kwh} kWh` : "no battery"}${d.wallbox.included ? " · wallbox" : ""}${d.heatpump.included ? ` · ${d.heatpump.kw} kW heat pump` : ""}`;
const FACT: Record<string, string> = { demand_kwh: "Yearly electricity", price_ct_kwh: "Price", heating: "Heating", heat_kwh: "Yearly heat", ev: "Electric car", ev_km: "Driving", has_solar: "Existing solar", has_storage: "Existing battery", installer: "Catalog" };
const UNDERSTOOD: Record<string, (u: Record<string, unknown>) => string> = {
  c_ev_on: () => "electric car", c_ev_off: () => "no electric car", c_ev_km: (u) => `${Number(u.km).toLocaleString("en")} km a year`, c_demand: (u) => `${Number(u.kwh).toLocaleString("en")} kWh a year`,
  c_mount: (u) => `mount on ${u.mount}`, c_area: (u) => `${u.area} m² usable`, c_max_panels: (u) => `at most ${u.panels} modules fit`, c_has_storage: () => "a battery is already there",
  c_modules: (u) => `${u.panels} modules`, c_no_battery: () => "no battery", c_battery: (u) => `${u.kwh} kWh battery`, c_hp_on: () => "add a heat pump", c_hp_off: () => "no heat pump", c_wb_on: () => "add a wallbox", c_wb_off: () => "no wallbox",
};
const describe = (o: Overrides) => [
  o.modules !== undefined && (o.modules == null ? "Solar back to the engine" : `Solar fixed at ${o.modules} modules`),
  o.battery_kwh !== undefined && (o.battery_kwh == null ? "Battery back to the engine" : o.battery_kwh ? `Battery set to ${o.battery_kwh} kWh` : "Battery removed"),
  o.wallbox !== undefined && (o.wallbox == null ? "Wallbox back to the engine" : o.wallbox ? "Wallbox added" : "Wallbox removed"),
  o.heatpump !== undefined && (o.heatpump == null ? "Heat pump back to the engine" : o.heatpump ? "Heat pump added" : "Heat pump removed"),
].filter(Boolean).join(", ");
const useDesign = (r: Request, roof: Spot[]) => {
  const [out, setOut] = useState<{ d: Design; panels: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!roof.length) return;
    let live = true;
    const t = setTimeout(() => design(r.inputs, r.overrides, roof, r.off).then((x) => live && setOut(x)).catch(() => undefined), 120);
    return () => { live = false; clearTimeout(t); };
  }, [r.inputs, r.overrides, r.off, roof]);
  return out;
};

// A public sample home, so the desk is not empty before a homeowner has sent anything.
const SAMPLE = { square: "682_5336", home: "DEBY_LOD2_4545924" };

export default function Planner({ dark, handoff }: { dark: boolean; handoff?: Handoff | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState<"requests" | "proof">("requests");
  const [requests, setRequests] = useState<Request[]>([]);
  const [scores, setScores] = useState<Scores | null>(null);
  const update = (id: string, p: Partial<Request>) => setRequests((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r)));
  useEffect(() => { fetch("/api/scores").then((r) => r.json()).then(setScores).catch(() => undefined); }, []);
  useEffect(() => {
    loadHome(SAMPLE.square, SAMPLE.home).then((buildings) => setRequests((l) => [...l.filter((r) => r.id !== "sample"), {
      id: "sample", label: buildings[0].label, from: "Phone call", buildings, status: "draft", overrides: {}, off: [], installed: [], walls: [], existing: { kwp: null, year: null, battery_kwh: null },
      inputs: { installer: "2a8ba8e2", demand_kwh: 4200, price_ct_kwh: 32, heating: "Gas", heat_kwh: null, has_solar: false, has_storage: false, ev: false, ev_km: 11300 },
      sources: { demand_kwh: "customer", price_ct_kwh: "assumed", heating: "customer", heat_kwh: "assumed", ev: "customer", ev_km: "assumed", has_solar: "customer", has_storage: "customer" },
    }])).catch(() => undefined);
  }, []);
  useEffect(() => { if (handoff?.buildings.length) setRequests((l) => [fromHomeowner(handoff), ...l.filter((r) => r.id !== "homeowner")]); }, [handoff]);
  const open = requests.find((r) => r.id === openId);
  if (open) return <Workspace key={open.id} dark={dark} r={open} update={update} back={() => setOpenId(null)} scores={scores} />;
  return <main className="inbox-page">
    <div className="pagehead"><h1>{page === "requests" ? "Requests" : "Proof"}</h1>
      <Segmented label="Page" value={page} onChange={setPage} options={[{ value: "requests", label: "Requests" }, { value: "proof", label: "Proof" }]} /></div>
    {page === "proof" ? <ProofPage /> : <>
    <p className="muted">A draft is ready before you open a request. You check it, change it and send it.</p>
    <table className="inbox"><thead><tr><th>Home</th><th>From</th><th>AI draft</th><th>To check</th><th>Status</th></tr></thead>
      <tbody>{requests.map((r) => <Line key={r.id} r={r} open={() => setOpenId(r.id)} />)}</tbody></table>
    {!requests.length && <p className="muted">Loading sample requests…</p>}
    </>}
  </main>;
}

function Line({ r, open }: { r: Request; open: () => void }) {
  const [roof] = useState(() => roofOf(r.buildings, r.installed));
  const out = useDesign(r, roof);
  const assumed = Object.values(r.sources).filter((s) => s === "assumed").length;
  return <tr tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
    <th scope="row">{r.label}</th><td>{r.from}</td><td className="mono">{out ? summary(out.d) : "…"}</td><td>{assumed} assumed {assumed === 1 ? "fact" : "facts"}</td>
    <td><span className={`state ${r.status}`}>{r.status === "sent" ? "Offer sent" : "Draft ready"}</span></td>
  </tr>;
}

type Scores = { scores: Record<string, { kwp_within20: number; n: number; batt_exact_closest: number }> };
type Tab = "home" | "design" | "checks" | "offer";
type Req = Request & { allowed?: string[] };
const fmt = (r: Request, k: string, d: Design): string => {
  const i = r.inputs as unknown as Record<string, unknown>, v = i[k];
  if (k === "demand_kwh") return v == null ? `${(d.energy.base_mwh * 1000).toLocaleString("en")} kWh (stand-in)` : `${Number(v).toLocaleString("en")} kWh`;
  if (k === "heat_kwh") return v == null ? "15,000 kWh (stand-in)" : `${Number(v).toLocaleString("en")} kWh`;
  if (k === "price_ct_kwh") return `${v} ct per kWh`;
  if (k === "ev_km") return `${Number(v).toLocaleString("en")} km a year`;
  if (k === "heating") return v == null ? "unknown" : v === "OtherNonRenewable" ? "other fossil" : v === "Heatpump" ? "heat pump" : String(v).toLowerCase();
  return v ? "yes" : "no";
};
/** Facts that matter for this design and were not given by anyone: they must be confirmed before the offer leaves. */
const relevant = (r: Request, d: Design) => Object.keys(r.sources).filter((k) => (k !== "heat_kwh" || d.heatpump.included) && (k !== "ev_km" || r.inputs.ev));
const SOURCE_LONG: Record<Source, string> = { customer: "from the customer", assumed: "assumed", planner: "confirmed by the planner" };

function Workspace({ dark, r, update, back, scores }: { dark: boolean; r: Request; update: (id: string, p: Partial<Request>) => void; back: () => void; scores: Scores | null }) {
  const [tab, setTab] = useState<Tab>("design");
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [roof] = useState(() => roofOf(r.buildings, r.installed));
  const [view, setView] = useState<View>({ layer: "photo", moment: null });
  const [face, setFace] = useState<Face | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const out = useDesign(r, roof);
  const first = useRef<Design | null>(null);
  if (out && !first.current) first.current = out.d;
  const d = out?.d;
  // A change remembers the request as it was, so the card can say what moved and undo it.
  const [change, setChange] = useState<Change | null>(null);
  const [lit, setLit] = useState<string[]>([]);
  const pending = useRef<{ label: string; was: Partial<Request> } | null>(null);
  const prev = useRef<Design | null>(null);
  useEffect(() => {
    if (!d) return;
    const p = pending.current, before = prev.current;
    if (p && before && d !== before) {
      setChange({ label: p.label, before, after: d, undo: () => { pending.current = null; update(r.id, p.was); setChange(null); } });
      setLit(touched(before, d));
      pending.current = null;
    }
    prev.current = d;
  }, [d]);
  useEffect(() => { if (!lit.length) return; const t = setTimeout(() => setLit([]), 2600); return () => clearTimeout(t); }, [lit]);
  const mark = (label: string) => { pending.current = { label, was: { inputs: r.inputs, overrides: r.overrides, sources: r.sources, off: r.off } }; };
  useEffect(() => { if (tab !== "home") { setView({ layer: "photo", moment: null }); setFace(null); } }, [tab]);

  const setI = (change: Partial<Inputs>, by: Source = "planner", label?: string) => { mark(label ?? `${Object.keys(change).map((k) => FACT[k] ?? k).join(", ")} changed`); update(r.id, { inputs: { ...r.inputs, ...change }, sources: { ...r.sources, ...Object.fromEntries(Object.keys(change).map((k) => [k, by])) } }); };
  const setO = (change: Overrides, label?: string) => { mark(label ?? describe(change)); update(r.id, { overrides: { ...r.overrides, ...change } }); };
  const toggle = (key: string) => { if (roof.some((x) => x.key === key)) mark(r.off.includes(key) ? "Roof surface added" : "Roof surface taken out"); if (roof.some((x) => x.key === key)) update(r.id, { off: r.off.includes(key) ? r.off.filter((k) => k !== key) : [...r.off, key] }); };
  const walls = r.buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "wall").map((s) => surfaceKey(b, s)));
  const chosen = [...walls, ...roof.filter((x) => !r.off.includes(x.key)).map((x) => x.key)];
  const checks = d ? checkList(r, d) : [];
  const confirm = d ? relevant(r, d).filter((k) => r.sources[k] === "assumed") : [];
  const warns = d ? d.review.filter((n) => n.level === "warn") : [];
  const left = confirm.length + checks.filter((c) => !done.includes(c.id)).length;
  const allowed = (r as Req).allowed ?? ["no_battery", "battery_size"];
  const send = () => { update(r.id, { status: "sent" }); back(); };

  return <main className={`stage ${step} plan`} style={{ "--left": `${LEFT}px` } as React.CSSProperties}>
    <HomeMap dark={dark} buildings={r.buildings} installed={r.installed} step={step} focus={null} aerial={false} open={null} near={null} face={face} look={null} onFace={setFace} onOpen={() => undefined} view={view} chosen={chosen} onToggle={toggle} editing={tab === "home"}
      panels={tab === "home" && view.layer === "sun" ? {} : out?.panels} panelW={LEFT} turn={turnTo(roof)} onReady={() => setStep("review")} />
    <aside className="panel tall desk">
      <header className="deskhead">
        <Button variant="fill" aria-label="Back to requests" onClick={back}><Back /></Button>
        <div className="grow"><b>{r.label}</b><small>{r.from} request · {r.status === "sent" ? "offer sent" : "draft"}</small></div>
        <Button variant="solid" disabled={!d || r.status === "sent" || confirm.length > 0} title={confirm.length ? "Confirm the assumed facts in Checks first" : undefined} onClick={send}>{r.status === "sent" ? "Sent" : "Send offer"}</Button>
      </header>
      {d && <dl className="kpis">
        <div><dt>Solar</dt><dd>{d.pv.kwp.toFixed(1)}<small> kWp</small></dd></div><div><dt>Modules</dt><dd>{d.pv.modules}</dd></div>
        <div><dt>Battery</dt><dd>{d.battery.kwh || "–"}{d.battery.kwh ? <small> kWh</small> : null}</dd></div>
        <div><dt>Need</dt><dd>{d.energy.total_mwh.toFixed(1)}<small> MWh</small></dd></div><div><dt>Makes</dt><dd>{d.energy.production_mwh.toFixed(1)}<small> MWh</small></dd></div>
      </dl>}
      <div className="desktabs"><Segmented wide label="Sections" value={tab} onChange={setTab} options={[{ value: "home", label: "Home" }, { value: "design", label: "Design" }, { value: "checks", label: left ? `Checks ${left}` : "Checks" }, { value: "offer", label: "Offer" }]} /></div>
      <div className="deskbody">
        {!d && <p className="muted">The engine is working…</p>}
        {change && <ChangeCard c={change} close={() => setChange(null)} />}
        {d && tab === "design" && <><Brief d={d} assumed={confirm.length} points={warns.length} site={checks.filter((c) => !done.includes(c.id)).length} open={() => setTab("checks")} /><DesignTab d={d} first={first.current} r={r} setO={setO} apply={(label, x) => { mark(label); update(r.id, { inputs: { ...r.inputs, ...x.inputs }, overrides: { ...r.overrides, ...x.overrides }, sources: { ...r.sources, ...Object.fromEntries(Object.keys(x.inputs).map((k) => [k, "planner"])) } }); }} lit={lit} scores={scores} /><Energy d={d} inputs={r.inputs} /></>}
        {tab === "home" && <><h3>Facts</h3><Facts r={r} setI={setI} />{d && <><h3>Roof</h3><RoofTab r={r} roof={roof} d={d} off={r.off} panels={out?.panels ?? {}} toggle={toggle} face={face} setFace={setFace} view={view} setView={setView} /></>}</>}
        {d && tab === "checks" && <>
          <h3>Confirm before sending</h3>
          {confirm.length ? <ul className="tasks">{confirm.map((k) => <li key={k} className="confirm"><div><b>{FACT[k]}: {fmt(r, k, d)}</b><small>Assumed: nobody gave this. {k === "demand_kwh" ? "Solar and battery follow it." : k === "heat_kwh" ? "It sizes the heat pump." : k === "price_ct_kwh" ? "It sets the saving." : "It changes the design."}</small></div>
            <Button onClick={() => update(r.id, { sources: { ...r.sources, [k]: "planner" } })}>Confirm</Button><Button variant="plain" onClick={() => setTab("home")}>Change</Button></li>)}</ul>
            : <p className="small muted">Every fact the design uses is from the customer or confirmed by you.</p>}
          {warns.length > 0 && <><h3>Points from the review</h3>{warns.map((n) => <p key={n.code} className="flag">{n.text}</p>)}</>}
          <h3>To check before installation</h3>
          <p className="small muted">Open items print on the offer as conditions. Tick what you have checked.</p>
          <ul className="tasks">{checks.map((c) => <li key={c.id}><Check checked={done.includes(c.id)} onChange={(v) => setDone(v ? [...done, c.id] : done.filter((x) => x !== c.id))}><b>{c.title}</b><small>{c.why}</small></Check></li>)}</ul>
        </>}
        {d && tab === "offer" && <Offer r={r} d={d} first={first.current} roof={roof} panels={out?.panels ?? {}} toConfirm={confirm.length} allowed={allowed} setAllowed={(a) => update(r.id, { allowed: a } as Partial<Request>)} send={send}
          conditions={checks.filter((c) => !done.includes(c.id)).map((c) => c.title)}
          facts={[...relevant(r, d).map((k) => [FACT[k], fmt(r, k, d), SOURCE_LONG[r.sources[k]]] as [string, string, string]), ["Roof", `${roof.length} measured ${roof.length === 1 ? "surface" : "surfaces"}`, "measured, Bavarian 3D buildings"]]} />}
      </div>
    </aside>
  </main>;
}

/** The first ten seconds: what is proposed, why in three lines, and what is still open. Written from the engine's numbers by template, no language model. */
function Brief({ d, assumed, points, site, open }: { d: Design; assumed: number; points: number; site: number; open: () => void }) {
  const s = d.similar, why: string[] = [];
  why.push(d.pv.locked ? `Solar is fixed by you at ${d.pv.modules} modules.` : d.pv.capped ? `The roof limits solar to ${d.pv.modules} modules; the engine wanted more.` : `Solar sized for ${d.energy.total_mwh.toFixed(1)} MWh a year. In ${s.n} similar homes, experts chose ${s.kwp_low}–${s.kwp_high} kWp.`);
  if (d.pv.max_modules) why.push(`${d.pv.modules} of ${d.pv.max_modules} modules that fit on the measured roof, best sun first. Makes about ${d.energy.production_mwh.toFixed(1)} MWh a year.`);
  why.push(d.battery.locked ? (d.battery.kwh ? `Battery set by you at ${d.battery.kwh} kWh.` : "No battery, your choice.") : d.battery.kwh ? `${d.battery.kwh} kWh battery: ${s.battery_rate}% of similar homes bought one${d.battery.unsure ? ", but this call is open" : ""}.` : `No battery proposed, though ${s.battery_rate}% of similar homes bought one.`);
  const items = [assumed && `${assumed} assumed ${assumed === 1 ? "fact" : "facts"} to confirm`, points && `${points} review ${points === 1 ? "point" : "points"}`, site && `${site} site ${site === 1 ? "check" : "checks"}`].filter(Boolean);
  return <section className="brief">
    <small>Design · summary written from the engine's numbers</small>
    <b>{d.pv.kwp.toFixed(1)} kWp · {d.battery.kwh ? `${d.battery.kwh} kWh battery` : "no battery"}{d.wallbox.included ? " · wallbox" : ""}{d.heatpump.included ? ` · ${d.heatpump.kw} kW heat pump` : ""}</b>
    <ul>{why.map((w) => <li key={w}>{w}</li>)}</ul>
    {items.length > 0 && <Button variant="plain" onClick={open}>Open: {items.join(" · ")} →</Button>}
  </section>;
}

function checkList(r: Request, d: Design) {
  const list: { id: string; title: string; why: string }[] = [];
  if (d.heatpump.included) list.push({ id: "flow", title: "Check radiators and flow temperature", why: "Not in our data. Usually needs a site visit." });
  const blind = roofOf(r.buildings, r.installed).filter((x) => x.s.kwh_per_kwp == null).length;
  if (blind) list.unshift({ id: "sun", title: `Sun data is missing for ${blind} ${blind === 1 ? "surface" : "surfaces"}`, why: "PVGIS did not answer. A typical yield stands in, so production is less certain. Reopen the request to try again." });
  list.push({ id: "roof", title: "Check the roof for obstacles", why: "Roof windows, chimneys and dormers are not in the measured model. See the photo in Roof." });
  list.push({ id: "state", title: "Check the roof's condition", why: "Age and load-bearing are not in our data." });
  list.push({ id: "who", title: "Who decides, and who owns the home?", why: "Not asked yet." });
  list.push({ id: "monument", title: "Check monument status", why: "Not in our data." });
  list.push({ id: "grid", title: "Check the grid connection and meter cabinet", why: "Not in our data." });
  list.push({ id: "grants", title: "Check grants", why: "They depend on the customer. Not in our data." });
  list.push({ id: "meter", title: "Smart meter and grid feed limit", why: "Without a smart meter, a new system may feed at most 60% of its power to the grid." });
  return list;
}

function DesignTab({ d, first, r, setO, apply, lit, scores }: { d: Design; first: Design | null; r: Request; setO: (c: Overrides, label?: string) => void; apply: (label: string, x: { inputs: Partial<Inputs>; overrides: Overrides }) => void; lit: string[]; scores: Scores | null }) {
  const [text, setText] = useState(""), [said, setSaid] = useState("");
  const o = r.overrides, kwp = d.pv.kwp, s = d.similar;
  const three = (v: boolean | null | undefined) => (v == null ? "auto" : v ? "yes" : "no");
  const from3 = (v: string) => (v === "auto" ? null : v === "yes");
  const ask = () => refine(text).then((x) => {
    if (!x.understood.length) { setSaid("Not understood. Try the car, battery, heat pump, wallbox or a module count."); return; }
    const heard = x.understood.map((u) => UNDERSTOOD[u.code]?.(u) ?? u.code).join(", ");
    apply(`“${text.trim()}”`, x);
    setSaid(`Understood: ${heard}${x.source === "claude" ? " (read by AI)" : ""}. The numbers come from the engine.`); setText("");
  }).catch(() => setSaid("The change could not be applied."));
  const engine = scores?.scores[`engine ${r.inputs.installer}`];
  const changed = first && summary(first) !== summary(d);
  return <>
    {changed && <p className="delta"><span>AI draft</span> {summary(first)}<br /><span>Now</span> {summary(d)}</p>}
    {d.review.filter((n) => n.level === "warn").map((n) => <p key={n.code} className="flag">{n.text}</p>)}
    <Options d={d} pick={(a) => setO(a.overrides, `Option: ${a.title.toLowerCase()}`)} />
    <table className="grid"><thead><tr><th /><th>Proposal</th><th>Similar homes</th><th>Your decision</th></tr></thead><tbody>
      <tr><th scope="row">Solar</th><td>{d.pv.modules} modules<small>{kwp.toFixed(1)} kWp{d.pv.capped ? " · roof limit" : ""}</small></td><td>{s.kwp_low}–{s.kwp_high} kWp<small>{s.n} homes</small></td>
        <td><div className="lock"><Slider min={4} max={Math.max(d.pv.max_modules ?? 40, 4)} value={o.modules ?? d.pv.modules} onChange={(e) => setO({ modules: Number(e.target.value) })} /><Button disabled={o.modules == null} onClick={() => setO({ modules: null })}>Auto</Button></div></td></tr>
      <tr><th scope="row">Battery</th><td>{r.inputs.has_storage ? "Already there" : d.battery.kwh ? `${d.battery.kwh} kWh` : "None"}{!r.inputs.has_storage && <small>{d.battery.locked ? `your choice · engine ${d.battery.probability}% for one` : `${d.battery.probability}% likely`}</small>}</td><td>{s.battery_rate}% have one<small>often {s.battery_common.join(", ")} kWh</small></td>
        <td><Select aria-label="Battery" value={o.battery_kwh == null ? "auto" : String(o.battery_kwh)} onChange={(e) => setO({ battery_kwh: e.target.value === "auto" ? null : Number(e.target.value) })}><option value="auto">Auto</option><option value="0">None</option>{d.battery.choices.map((c) => <option key={c} value={c}>{c} kWh</option>)}</Select></td></tr>
      <tr><th scope="row">Wallbox</th><td>{d.wallbox.included ? "Included" : "None"}</td><td>{s.wallbox_rate}% have one</td>
        <td><Segmented wide label="Wallbox" value={three(o.wallbox)} onChange={(v) => setO({ wallbox: from3(v) })} options={[{ value: "auto", label: "Auto" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></td></tr>
      <tr><th scope="row">Heat pump</th><td>{d.heatpump.included ? `${d.heatpump.kw} kW` : "None"}<small>{d.heatpump.blocked ? "already there" : "by rule"}</small></td><td>Too few sold</td>
        <td><Segmented wide label="Heat pump" value={three(o.heatpump)} onChange={(v) => setO({ heatpump: from3(v) })} options={[{ value: "auto", label: "Auto" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></td></tr>
    </tbody></table>
    <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask(); }}>
      <Input aria-label="What changed?" placeholder="What changed? e.g. they are buying an electric car" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit">Apply</Button>
    </form>
    {said && <p className="small muted">{said}</p>}
    <h3>How the engine decided</h3>
    <Trace steps={d.trace} sources={r.sources} lit={lit} />
    {d.review.filter((n) => n.level === "note").map((n) => <p key={n.code} className="small muted">{n.text}</p>)}
    {engine && <p className="small muted trust">How far to trust a first draft: on {Math.round(engine.n)} past projects at this installer, it landed within 20% of the expert's size {Math.round(engine.kwp_within20 * 100)}% of the time. That is why you decide.</p>}
  </>;
}

function RoofTab({ r, roof, d, off, panels, toggle, face, setFace, view, setView }: { r: Request; roof: Spot[]; d: Design; off: string[]; panels: Record<string, number>; toggle: (k: string) => void; face: Face | null; setFace: (f: Face | null) => void; view: View; setView: (v: View) => void }) {
  const [play, setPlay] = useState(false);
  const mode = view.layer === "photo" ? "photo" : view.moment ? "time" : "year";
  const at = view.moment ?? { month: 6, hour: 12 };
  const suns = r.buildings.find((b) => b.sun)?.sun?.suns ?? [], hours = suns.filter((s) => s.month === at.month).map((s) => s.hour);
  useEffect(() => {
    if (!play || !hours.length) return;
    const t = setInterval(() => { const i = hours.indexOf(at.hour); setView({ layer: "sun", moment: { month: at.month, hour: hours[(i + 1) % hours.length] } }); }, 450);
    return () => clearInterval(t);
  }, [play, at.hour, at.month]);
  const fits = roof.filter((x) => !off.includes(x.key)).reduce((a, x) => a + x.fits, 0);
  return <>
    <Segmented wide label="Show on the model" value={mode} onChange={(m) => { setPlay(false); setView({ layer: m === "photo" ? "photo" : "sun", moment: m === "time" ? at : null }); }} options={[{ value: "photo", label: "Photo and modules" }, { value: "year", label: "Yearly sun" }, { value: "time", label: "Sun by hour" }]} />
    {mode === "time" && <div className="sunrow2"><Button onClick={() => setPlay(!play)}>{play ? "Pause" : "Play the day"}</Button>
      <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => { const m = Number(e.target.value), l = suns.filter((s) => s.month === m).map((s) => s.hour); setView({ layer: "sun", moment: { month: m, hour: Math.min(Math.max(at.hour, l[0]), l[l.length - 1]) } }); }} /></Field>
      <Field label="Solar time" value={`${at.hour}:00`}><Slider min={hours[0]} max={hours[hours.length - 1]} value={at.hour} onChange={(e) => setView({ layer: "sun", moment: { month: at.month, hour: Number(e.target.value) } })} /></Field></div>}
    {mode === "year" && <div className="legend" role="img" aria-label={`Sun on the surface from ${SUN_LOW} to ${SUN_HIGH} kWh per square metre a year`}><i /><span>{SUN_LOW} kWh/m²</span><span>{SUN_HIGH.toLocaleString("en")} kWh/m²</span></div>}
    <table className="grid surfaces"><thead><tr><th /><th>Facing</th><th>Tilt</th><th>Area</th><th>Shade</th><th>kWh/kWp</th><th>Fits</th><th>Placed</th></tr></thead><tbody>
      {roof.map((x) => { const me = { building: x.b.id, poly: x.poly }; return <tr key={x.key} className={face?.building === me.building && face.poly === x.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
        <td><Check checked={!off.includes(x.key)} onChange={() => toggle(x.key)}>{""}</Check></td><td>{facing(x.s)}</td><td>{x.s.tilt}°</td><td>{Math.round(x.s.m2)} m²</td><td>{x.s.kwh_per_kwp == null ? "?" : `${Math.round(x.shade * 100)}%`}</td><td>{x.s.kwh_per_kwp == null ? `~${x.yield_}` : x.yield_}</td><td>{x.fits}</td><td><b>{panels[x.key] ?? 0}</b></td>
      </tr>; })}
    </tbody></table>
    <p className="small muted">{d.pv.modules} of {fits} modules used. Modules fill the best-yielding surfaces first, 40 cm from every edge. Click a roof on the model to take it out. Obstacles are not in the measured model, so look at the photo before you trust "Fits".</p>
    {r.installed.length > 0 && <p className="small muted">{r.installed.length} {r.installed.length === 1 ? "surface already carries" : "surfaces already carry"} panels and stay out of this design.</p>}
    {r.walls.length > 0 && <p className="flag">The customer asked about {r.walls.length} {r.walls.length === 1 ? "wall" : "walls"}. Accept or decline this with them: walls are not in the design.</p>}
  </>;
}

function Tagged({ label, source, children }: { label: string; source?: Source; children: React.ReactNode }) {
  return <div className="fact"><label><span>{label}</span>{children}</label><em className={source}>{source ? SOURCE[source] : ""}</em></div>;
}
function Facts({ r, setI }: { r: Request; setI: (c: Partial<Inputs>) => void }) {
  const i = r.inputs, s = r.sources;
  return <div className="facts">
    <Tagged label="Yearly electricity (kWh)" source={s.demand_kwh}><Input type="number" step={100} placeholder="4,000 stands in" value={i.demand_kwh ?? ""} onChange={(e) => setI({ demand_kwh: e.target.value ? Number(e.target.value) : null })} /></Tagged>
    <Tagged label="Price (ct per kWh)" source={s.price_ct_kwh}><Input type="number" step={0.5} value={i.price_ct_kwh} onChange={(e) => setI({ price_ct_kwh: Number(e.target.value) })} /></Tagged>
    <Tagged label="Heating" source={s.heating}><Select value={i.heating ?? ""} onChange={(e) => setI({ heating: e.target.value || null })}>{HEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Tagged>
    <Tagged label="Yearly heat (kWh)" source={s.heat_kwh}><Input type="number" step={500} value={i.heat_kwh ?? ""} onChange={(e) => setI({ heat_kwh: e.target.value ? Number(e.target.value) : null })} /></Tagged>
    <Tagged label="Electric car" source={s.ev}><Segmented wide label="Electric car" value={i.ev ? "yes" : "no"} onChange={(v) => setI({ ev: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    <Tagged label="Driving (km a year)" source={s.ev_km}><Input type="number" step={1000} value={i.ev_km} onChange={(e) => setI({ ev_km: Number(e.target.value) })} /></Tagged>
    <Tagged label="Existing solar" source={s.has_solar}><Segmented wide label="Existing solar" value={i.has_solar ? "yes" : "no"} onChange={(v) => setI({ has_solar: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    <Tagged label="Existing battery" source={s.has_storage}><Segmented wide label="Existing battery" value={i.has_storage ? "yes" : "no"} onChange={(v) => setI({ has_storage: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    {(r.existing.kwp || r.existing.year || r.existing.battery_kwh) && <p className="small muted span">On the building: {[r.existing.kwp && `${r.existing.kwp} kWp`, r.existing.year && `from ${r.existing.year}`, r.existing.battery_kwh && `${r.existing.battery_kwh} kWh battery`].filter(Boolean).join(", ")}. Not used by the engine yet.</p>}
    <Tagged label="Catalog"><Select value={i.installer} onChange={(e) => setI({ installer: e.target.value })}>{INSTALLERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Tagged>
  </div>;
}

function Energy({ d, inputs }: { d: Design; inputs: Inputs }) {
  const e = d.energy, top = Math.max(e.total_mwh, e.production_mwh, 0.1);
  const row = (label: string, v: number, strong?: boolean) => <div className={`bar${strong ? " strong" : ""}`} key={label}><span>{label}</span><i><b style={{ width: `${(v / top) * 100}%` }} /></i><em>{v.toFixed(1)} MWh</em></div>;
  return <>
    <h3>Need against production, a year</h3>
    {row("House", e.base_mwh)}{e.ev_mwh > 0 && row("Car", e.ev_mwh)}{e.hp_mwh > 0 && row("Heat pump", e.hp_mwh)}{row("Total need", e.total_mwh, true)}{row("Production", e.production_mwh, true)}
    <dl className="rows">
      <div><dt>Share of need met by own power</dt><dd>{e.self_sufficiency_pct}%</dd></div>
      <div><dt>Share of production used at home</dt><dd>{e.self_use_pct}%</dd></div>
      <div><dt>Saving a year at {inputs.price_ct_kwh} ct</dt><dd>€{e.saving_eur.toLocaleString("en")}</dd></div>
    </dl>
    <p className="flag">Not checked yet: the two shares and the saving come from assumed hourly profiles. Do not quote them to a customer.</p>
    <p className="small muted">Production uses this roof's measured sun and shade. There are no prices in our data, so no system cost or payback.</p>
  </>;
}
