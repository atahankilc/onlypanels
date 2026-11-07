import { useEffect, useRef, useState } from "react";
import { Answers, Selected, homesIn, meanSun, polyOf, surfaceKey, surfaceName } from "./api";
import { Face, letter } from "./HomeMap";
import { Back, Close } from "./icons";
import { Button, Check, Field, IconButton, Input } from "./ui";

const BANDS = [["Under 3,000 kWh", 2500], ["3,000 to 4,000 kWh", 3500], ["4,000 to 5,000 kWh", 4500], ["5,000 to 7,000 kWh", 6000], ["Over 7,000 kWh", 8500]] as const;
// Stromspiegel 2025, single-family house, from secondary sources. One person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5 or more", 4500]] as const;
const HEATING = [["Gas", "Gas"], ["Oil", "Oil"], ["Heatpump", "Heat pump"], ["OtherNonRenewable", "Something else"], ["unknown", "Not sure"]] as const;
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const number = (v: string) => (v === "" ? null : Number(v));

export type Stage = "roof" | "solar" | "panels" | "battery" | "batterysize" | "use" | "exact" | "people" | "heat" | "heatuse" | "hp" | "car" | "km" | "send" | "sent";
/** The pages this household needs, in order. Answers open and close the follow-up pages. */
const pagesFor = (a: Answers): Stage[] => [
  "roof", "solar", ...(a.has_solar ? ["panels" as const] : []), "battery", ...(a.has_storage ? ["batterysize" as const] : []),
  "use", ...(a.use_source === "exact" ? ["exact" as const] : []), ...(a.use_source === "people" ? ["people" as const] : []),
  "heat", ...(FOSSIL.includes(a.heating ?? "") ? ["heatuse" as const, "hp" as const] : []), "car", ...(a.ev ? ["km" as const] : []), "send",
];

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; goTo: (id: string) => void; face: Face | null; setFace: (f: Face | null) => void;
  chosen: string[]; toggle: (key: string) => void; reset: () => void; back: () => void; changed: boolean; installed: string[]; toggleInstalled: (key: string) => void; retrySun: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, goTo, face, setFace, chosen, toggle, reset, back, changed, installed, toggleInstalled, retrySun }: Props) {
  const all = buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => ({ b, s, key: surfaceKey(b, s) })));
  const picked = all.filter((x) => chosen.includes(x.key));
  const marked = all.filter((x) => installed.includes(x.key)); // a removed building takes its marks with it
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const pages = pagesFor(a), at_ = Math.max(0, pages.indexOf(stage));
  const go = (next: Stage) => {
    setFace(null);
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
      <p className="muted">{loading ? "Loading your roof…" : "Click a surface to take it out."}</p>
      {failed && <p className="error small">We could not load a building. <button type="button" className="again" onClick={retrySun}>Try again</button></p>}
      {!loading && !failed && all.length === 0 && <p className="error small">No surface is big enough here. Go back and pick another building.</p>}
      {homesIn(buildings).map((g, i) => {
        const mine = all.filter((x) => x.b.home === g.home).sort((x, y) => meanSun(y.s) - meanSun(x.s));
        const row = ({ b, s, key }: (typeof mine)[number]) => {
          const me = { building: b.id, poly: polyOf(b, s) };
          if (installed.includes(key)) return <li key={key}><div className="taken"><b>{surfaceName(s)}</b><small>Already has panels</small></div></li>;
          return <li key={key} className={face?.building === b.id && face.poly === me.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
            <Check checked={chosen.includes(key)} onChange={() => toggle(key)}><b>{surfaceName(s)}</b></Check>
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
      <p className="source small muted">Bayerische Vermessungsverwaltung</p>
    </aside>
  );

  if (stage === "send") return (
    <aside className="panel tall quiz" key="send" ref={panel}>
      <p className="count">Last step</p>
      <h1>That is all we need</h1>
      <p className="muted">An installer plans your system from this and sends you an offer.</p>
      <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go("sent")}>Send to an installer</Button></div>
    </aside>
  );

  if (stage === "sent") return (
    <aside className="panel tall quiz" key="sent" ref={panel}>
      <p className="count">Sent</p>
      <h1>An installer is on it</h1>
      <p className="muted">They will be in touch with your offer.</p>
    </aside>
  );

  return (
    <aside className="panel tall quiz" key={stage} ref={panel} onKeyDown={enter}>
      {stage === "solar" && page("Is there solar here already?", null, yesNo("has_solar", { solar_kwp: null, solar_year: null }))}

      {stage === "panels" && page("Where are the panels?", "Click those surfaces on the map.", <div className="answers">
        {marked.length > 0 && <ul className="chosen">{marked.map(({ b, s, key }) => <li key={key} className={face?.building === b.id && face.poly === polyOf(b, s) ? "on" : ""} onMouseEnter={() => setFace({ building: b.id, poly: polyOf(b, s) })} onMouseLeave={() => setFace(null)}>
          <div><b>{surfaceName(s)}</b><small>{letter(homesIn(buildings).findIndex((g) => g.home === b.home))}</small></div>
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
