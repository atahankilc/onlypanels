import { useEffect, useRef, useState } from "react";
import { Answers, Draft, Selected, View, draftFor, homesIn, meanSun, polyOf, surfaceKey, surfaceName } from "./api";
import { Face, letter } from "./HomeMap";
import { Back, Close } from "./icons";
import { Button, Check, Field, IconButton, Input, Segmented, Slider } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BANDS = [["Under 3,000 kWh", 2500], ["3,000 to 4,000 kWh", 3500], ["4,000 to 5,000 kWh", 4500], ["5,000 to 7,000 kWh", 6000], ["Over 7,000 kWh", 8500]] as const;
// Stromspiegel 2025, single-family house, from secondary sources. One person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5 or more", 4500]] as const;
const HEATING = [["Gas", "Gas"], ["Oil", "Oil"], ["Heatpump", "Heat pump"], ["OtherNonRenewable", "Something else"], ["unknown", "Not sure"]] as const;
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const number = (v: string) => (v === "" ? null : Number(v));

export type Stage = "roof" | "solar" | "panels" | "battery" | "batterysize" | "use" | "exact" | "people" | "heat" | "heatuse" | "hp" | "car" | "km" | "draft" | "sent";
/** The pages this household needs, in order. Answers open and close the follow-up pages. */
const pagesFor = (a: Answers): Stage[] => [
  "roof", "solar", ...(a.has_solar ? ["panels" as const] : []), "battery", ...(a.has_storage ? ["batterysize" as const] : []),
  "use", ...(a.use_source === "exact" ? ["exact" as const] : []), ...(a.use_source === "people" ? ["people" as const] : []),
  "heat", ...(FOSSIL.includes(a.heating ?? "") ? ["heatuse" as const, "hp" as const] : []), "car", ...(a.ev ? ["km" as const] : []), "draft",
];

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; goTo: (id: string) => void; face: Face | null; setFace: (f: Face | null) => void;
  view: View; setView: (v: View) => void; chosen: string[]; toggle: (key: string) => void; reset: () => void; back: () => void; changed: boolean; installed: string[]; toggleInstalled: (key: string) => void; retrySun: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, goTo, face, setFace, view, setView, chosen, toggle, reset, back, changed, installed, toggleInstalled, retrySun }: Props) {
  const all = buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => ({ b, s, key: surfaceKey(b, s) })));
  const picked = all.filter((x) => chosen.includes(x.key));
  const marked = all.filter((x) => installed.includes(x.key)); // a removed building takes its marks with it
  const roofs = picked.filter((x) => x.s.kind === "roof").reduce((sum, x) => sum + x.s.m2, 0);
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);
  const at = view.moment ?? { month: 6, hour: 12 };
  const suns = buildings.find((b) => b.sun)?.sun?.suns ?? [];
  const hoursIn = (month: number) => suns.filter((s) => s.month === month).map((s) => s.hour);
  const hours = hoursIn(at.month);
  const setMoment = (month: number, hour: number) => {
    const list = hoursIn(month);
    setView({ ...view, moment: { month, hour: list.length ? Math.min(Math.max(hour, list[0]), list[list.length - 1]) : hour } });
  };
  const mode = view.layer === "photo" ? "photo" : view.moment ? "moment" : "year";
  const show = (m: typeof mode) => setView({ layer: m === "photo" ? "photo" : "sun", moment: m === "moment" ? at : null });

  const pages = pagesFor(a), at_ = Math.max(0, pages.indexOf(stage));
  const go = (next: Stage) => {
    setFace(null);
    if (next !== "roof" && view.layer !== "photo") setView({ layer: "photo", moment: null });
    setStage(next);
  };
  /** Answer and move on. The next page comes from the answers as they now stand. */
  const answer = (change: Partial<Answers>) => {
    const after = { ...a, ...change }, list = pagesFor(after);
    setAnswers(after);
    go(list[list.indexOf(stage) + 1]);
  };
  const next = () => go(pages[at_ + 1]);
  const previous = () => (at_ ? go(pages[at_ - 1]) : back());

  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollTo(0, 0);
    if (matchMedia("(pointer: fine)").matches) panel.current?.querySelector<HTMLInputElement>(".answers input")?.focus();
  }, [stage]);
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "number") next(); };

  const yesNo = (key: "has_solar" | "has_storage", extra: Partial<Answers> = {}) => <div className="answers">
    <Button size="lg" wide aria-pressed={a[key] === true} onClick={() => answer({ [key]: true })}>Yes</Button>
    <Button size="lg" wide aria-pressed={a[key] === false} onClick={() => answer({ [key]: false, ...extra })}>No</Button>
  </div>;
  const page = (title: string, line: string | null, body: React.ReactNode, optional = false) => <>
    <p className="count">Question {at_ + 1} of {pages.length - 1}</p>
    <h1>{title}</h1>
    {line && <p className="muted">{line}</p>}
    {body}
    <div className="quizfoot">
      <button type="button" className="textlink" onClick={previous}>Back</button>
      {optional && <button type="button" className="textlink" onClick={next}>Skip</button>}
    </div>
  </>;
  const numberPage = (title: string, line: string | null, label: string, value: number | null, set: (v: number | null) => void, placeholder?: string) => page(title, line, <div className="answers">
    <Field label={label}><Input type="number" min={0} placeholder={placeholder} value={value ?? ""} onChange={(e) => set(number(e.target.value))} /></Field>
    <Button variant="solid" size="lg" wide disabled={!value} onClick={next}>Next</Button>
  </div>, true);

  if (stage === "roof") return (
    <aside className="panel tall quiz" key="roof" ref={panel}>
      <p className="count">Question 1 of {pages.length - 1}</p>
      <h1>Your surfaces</h1>
      {loading ? <p className="muted">Working out the sun…</p> : <p className="muted">{Math.round(roofs)} m² of roof chosen. Click a surface to change it.</p>}
      {failed && <p className="error small">Sun data is missing for a building. <button type="button" className="again" onClick={retrySun}>Try again</button></p>}
      {!loading && !failed && all.length === 0 && <p className="error small">No surface is big enough here. Go back and pick another building.</p>}
      <div className="sunbar">
        <Segmented wide label="Show on the map" value={mode} onChange={show} options={[{ value: "photo", label: "Photo" }, { value: "year", label: "Yearly sun" }, { value: "moment", label: "Sun by time" }]} />
        {view.moment && view.layer === "sun" && <div className="sunrow">
          <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => setMoment(Number(e.target.value), at.hour)} /></Field>
          <Field label="Time" value={`${at.hour}:00`}><Slider min={hours[0] ?? 8} max={hours[hours.length - 1] ?? 16} value={at.hour} onChange={(e) => setMoment(at.month, Number(e.target.value))} /></Field>
        </div>}
        {view.layer === "sun" && <div className="legend" role="img" aria-label="Blue is least sun, red is most"><i /><span>Less sun</span><span>More sun</span></div>}
      </div>
      {homesIn(buildings).map((g, i) => {
        const mine = all.filter((x) => x.b.home === g.home).sort((x, y) => meanSun(y.s) - meanSun(x.s));
        const row = ({ b, s, key }: (typeof mine)[number]) => {
          const me = { building: b.id, poly: polyOf(b, s) };
          if (installed.includes(key)) return <li key={key}><div className="taken"><b>{surfaceName(s)}</b><small>Already has panels</small></div></li>;
          return <li key={key} className={face?.building === b.id && face.poly === me.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
            <Check checked={chosen.includes(key)} onChange={() => toggle(key)}><b>{surfaceName(s)}</b><small>{Math.round(s.m2)} m² · {Math.round(meanSun(s)).toLocaleString("en")} kWh/m² sun a year</small></Check>
          </li>;
        };
        const walls = mine.filter((x) => x.s.kind === "wall");
        return <section key={g.home}>
          <button type="button" className="row" onClick={() => goTo(g.home)}><span className="tag">{letter(i)}</span><span className="name">{g.label}</span></button>
          <ul className="chosen">{mine.filter((x) => x.s.kind === "roof").map(row)}</ul>
          {walls.length > 0 && <details><summary>Ask about walls ({walls.length})</summary><p className="small muted">Your installer decides if they work.</p><ul className="chosen">{walls.map(row)}</ul></details>}
        </section>;
      })}
      {changed && <button type="button" className="textlink" onClick={reset}>Back to all roofs</button>}
      <div className="stick"><Button size="lg" onClick={back}>Back</Button><Button variant="solid" size="lg" wide disabled={loading} onClick={next}>Next</Button></div>
      <p className="source small muted">Bayerische Vermessungsverwaltung, PVGIS (European Commission). Shadows from nearby buildings, without trees.</p>
    </aside>
  );

  if (stage === "draft") return <DraftPage answers={a} buildings={buildings} chosen={chosen} back={previous} send={() => go("sent")} />;

  if (stage === "sent") return (
    <aside className="panel tall quiz" key="sent" ref={panel}>
      <p className="count">Sent</p>
      <h1>An installer is on it</h1>
      <p className="muted">They check your roof and your real use, then send you an offer.</p>
    </aside>
  );

  return (
    <aside className="panel tall quiz" key={stage} ref={panel} onKeyDown={enter}>
      {stage === "solar" && page("Is there solar here already?", null, yesNo("has_solar", { solar_kwp: null, solar_year: null }))}

      {stage === "panels" && page("Where are the panels?", "Click those surfaces on the map.", <div className="answers">
        {marked.length > 0 && <ul className="chosen">{marked.map(({ b, s, key }) => <li key={key} className={face?.building === b.id && face.poly === polyOf(b, s) ? "on" : ""} onMouseEnter={() => setFace({ building: b.id, poly: polyOf(b, s) })} onMouseLeave={() => setFace(null)}>
          <div><b>{surfaceName(s)}</b><small>{letter(homesIn(buildings).findIndex((g) => g.home === b.home))} · {Math.round(s.m2)} m²</small></div>
          <IconButton label={`Remove ${surfaceName(s)}`} onClick={() => { setFace(null); toggleInstalled(key); }}><Close /></IconButton>
        </li>)}</ul>}
        <div className="pair">
          <Field label="Size (kWp)"><Input type="number" min={0} step={0.1} value={a.solar_kwp ?? ""} onChange={(e) => setAnswers({ ...a, solar_kwp: number(e.target.value) })} /></Field>
          <Field label="Year"><Input type="number" min={1990} max={2026} value={a.solar_year ?? ""} onChange={(e) => setAnswers({ ...a, solar_year: number(e.target.value) })} /></Field>
        </div>
        <Button variant="solid" size="lg" wide disabled={!marked.length} onClick={next}>Next</Button>
      </div>, true)}

      {stage === "battery" && page("Is there a home battery?", null, yesNo("has_storage", { battery_kwh: null }))}
      {stage === "batterysize" && numberPage("How big is the battery?", null, "Size (kWh)", a.battery_kwh, (battery_kwh) => setAnswers({ ...a, battery_kwh }))}

      {stage === "use" && page("How much electricity do you use a year?", "A rough answer is enough.", <div className="answers">
        {BANDS.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.use_source === "band" && a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh, use_source: "band" })}>{label}</Button>)}
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.use_source === "exact"} onClick={() => answer({ use_source: "exact" })}>I know it</Button>
          <Button size="lg" wide aria-pressed={a.use_source === "people"} onClick={() => answer({ use_source: "people" })}>No idea</Button>
        </div>
      </div>)}
      {stage === "exact" && numberPage("What is your yearly use?", "It is on your bill.", "kWh a year", a.demand_kwh, (demand_kwh) => setAnswers({ ...a, demand_kwh }))}
      {stage === "people" && page("How many people live here?", "We use an average for now.", <div className="answers">
        {BY_PEOPLE.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh })}>{label}</Button>)}
      </div>)}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value} onClick={() => answer({ heating: value })}>{label}</Button>)}
      </div>)}
      {stage === "heatuse" && numberPage("How much heat do you use a year?", "It is on your gas or oil bill.", "kWh a year", a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh }))}
      {stage === "hp" && page("Should we look at a heat pump?", null, <div className="answers">
        <Button size="lg" wide aria-pressed={a.wants_hp === true} onClick={() => answer({ wants_hp: true })}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.wants_hp === false} onClick={() => answer({ wants_hp: false })}>No</Button>
      </div>)}

      {stage === "car" && page("Do you drive an electric car?", null, <div className="answers">
        <Button size="lg" wide aria-pressed={a.ev === true && !a.ev_planned} onClick={() => answer({ ev: true, ev_planned: false })}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.ev === true && a.ev_planned} onClick={() => answer({ ev: true, ev_planned: true })}>Not yet, but soon</Button>
        <Button size="lg" wide aria-pressed={a.ev === false} onClick={() => answer({ ev: false, ev_planned: false })}>No</Button>
      </div>)}
      {stage === "km" && numberPage("How far do you drive a year?", null, "Kilometres a year", a.ev_km, (ev_km) => setAnswers({ ...a, ev_km }), "11,300 if you skip")}
    </aside>
  );
}

/** What the system is, in ranges, with the reason. No share or saving until those numbers are checked. */
function DraftPage({ answers: a, buildings, chosen, back, send }: { answers: Answers; buildings: Selected[]; chosen: string[]; back: () => void; send: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; draftFor(a, buildings, chosen).then((d) => { if (live) setDraft(d); }).catch(() => live && setFailed(true)); return () => { live = false; }; }, []);
  const rows = draft ? [
    ["Solar", `${draft.pv.low} to ${draft.pv.high} kWp`, "From your use and what experts chose for similar homes."],
    ["Battery", a.has_storage ? "You have one" : draft.battery.yes ? `${draft.battery.low} to ${draft.battery.high} kWh` : "Not needed for now", a.has_storage ? "We plan around it." : "From the solar size and similar homes."],
    ["Car charging", draft.wallbox ? "Included" : "Not included", a.ev ? "For your electric car." : "No electric car."],
    ["Heat pump", a.heating === "Heatpump" ? "You have one" : a.wants_hp ? "Worth a look" : "Not for now", a.wants_hp ? "Your installer checks your home first." : ""],
  ] : [];
  return (
    <aside className="panel tall quiz" key="draft">
      <p className="count">Your first draft</p>
      <h1>{failed ? "We could not make a draft" : draft ? "This could suit your home" : "Making your draft…"}</h1>
      {failed && <p className="muted">Please try again in a moment.</p>}
      {draft && <dl className="plain">{rows.map(([name, value, why]) => <div key={name}><dt>{name}<small>{why}</small></dt><dd>{value}</dd></div>)}</dl>}
      {draft && <p className="small muted">A rough first look. Your installer checks everything before an offer.{a.use_source !== "band" && a.use_source !== "exact" || a.demand_kwh === null ? " Your electricity use is an average for now." : ""}</p>}
      <div className="stick"><Button size="lg" onClick={back}>Back</Button>{draft && <Button variant="solid" size="lg" wide onClick={send}>Ask an installer to check this</Button>}</div>
    </aside>
  );
}
