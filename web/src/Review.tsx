import { useEffect, useRef, useState } from "react";
import { Answers, Selected } from "./api";
import { Face } from "./HomeMap";
import { Button, Field, Input } from "./ui";

const BANDS = [["Under 3,000 kWh", 2500], ["3,000 to 4,000 kWh", 3500], ["4,000 to 5,000 kWh", 4500], ["5,000 to 7,000 kWh", 6000], ["Over 7,000 kWh", 8500]] as const;
// Stromspiegel 2025, single-family house, from secondary sources. One person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5 or more", 4500]] as const;
const HEATING = [["Gas", "Gas"], ["Oil", "Oil"], ["Heatpump", "Heat pump"], ["OtherNonRenewable", "Something else"], ["unknown", "Not sure"]] as const;
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const number = (v: string) => (v === "" ? null : Number(v));

export type Stage = "roof" | "solar" | "battery" | "use" | "heat" | "car" | "send" | "sent";
/** One topic a page. A follow-up opens on the same page, under the answer that needs it, so the count never changes. */
const PAGES: Stage[] = ["roof", "solar", "battery", "use", "heat", "car", "send"];

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; setFace: (f: Face | null) => void; m2: number; panelM2: number; reset: () => void; back: () => void; changed: boolean; retrySun: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, setFace, m2, panelM2, reset, back, changed, retrySun }: Props) {
  const all = buildings.flatMap((b) => b.sun?.surfaces ?? []);
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const at_ = Math.max(0, PAGES.indexOf(stage));
  const go = (next: Stage) => {
    setFace(null);
    setStage(next);
  };
  const next = () => go(PAGES[at_ + 1]);
  const previous = () => (at_ ? go(PAGES[at_ - 1]) : back());
  /** An answer with nothing more to ask moves on; one that needs more opens it below. */
  const answer = (change: Partial<Answers>, done = true) => {
    setAnswers({ ...a, ...change });
    if (done) next();
  };

  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollTo(0, 0);
    if (matchMedia("(pointer: fine)").matches) panel.current?.querySelector<HTMLInputElement>(".answers input")?.focus();
  }, [stage]);
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "number") next(); };

  const yesNo = (key: "has_solar" | "has_storage", none: Partial<Answers>) => <div className="answers">
    <Button size="lg" wide aria-pressed={a[key] === true} onClick={() => answer({ [key]: true }, false)}>Yes</Button>
    <Button size="lg" wide aria-pressed={a[key] === false} onClick={() => answer({ [key]: false, ...none })}>No</Button>
  </div>;
  /** A page: the question, its answers, and what an answer opened. Next shows once something is open. */
  const page = (title: string, line: string | null, body: React.ReactNode, more: React.ReactNode = null) => <>
    <p className="count">Question {at_ + 1} of {PAGES.length - 1}</p>
    <h1>{title}</h1>
    {line && <p className="muted">{line}</p>}
    {body}
    {more && <div className="more">{more}</div>}
    {more ? <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={next}>Next</Button></div>
      : <div className="quizfoot"><button type="button" className="textlink" onClick={previous}>Back</button></div>}
  </>;
  const numberField = (label: string, value: number | null, set: (v: number | null) => void, placeholder?: string) =>
    <Field label={label}><Input type="number" min={0} placeholder={placeholder} value={value ?? ""} onChange={(e) => set(number(e.target.value))} /></Field>;

  if (stage === "roof") return (
    <aside className="panel tall quiz" key="roof" ref={panel}>
      <p className="count">Question 1 of {PAGES.length - 1}</p>
      <h1>Where would you like panels?</h1>
      <p className="muted">Mark the parts you would like us to use first. Your installer may use less, or more, if that makes a better system.</p>
      {loading && <p className="muted">Loading your roof…</p>}
      {failed && <p className="error small">We could not load a building. <button type="button" className="again" onClick={retrySun}>Try again</button></p>}
      {!loading && !failed && all.length === 0 && <p className="error small">No surface is big enough here. Go back and pick another building.</p>}
      {!loading && all.length > 0 && <>
        <p className="marked"><b>{Math.round(m2)} m²</b> marked</p>
        <p className="small muted">To change it, pick a tool on the map. <b>Whole surface</b>: drag across surfaces. <b>Draw</b>: click around a part and close the shape. A shape over marked parts takes them out, over free parts or a wall adds them.</p>
        {changed && <button type="button" className="textlink" onClick={reset}>Start over</button>}
      </>}
      <div className="stick"><Button size="lg" onClick={back}>Back</Button><Button variant="solid" size="lg" wide disabled={loading} onClick={next}>Next</Button></div>
      <p className="source small muted">Bayerische Vermessungsverwaltung, PVGIS (European Commission). Shadows from nearby buildings, without trees.</p>
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

  const fossil = FOSSIL.includes(a.heating ?? "");
  return (
    <aside className="panel tall quiz" key={stage} ref={panel} onKeyDown={enter}>
      {stage === "solar" && page("Is there solar here already?", null, yesNo("has_solar", { solar_kwp: null, solar_year: null }), a.has_solar && <>
        <h2>Where are the panels?</h2>
        <p className="small muted">Mark them on the map with <b>Whole surface</b> or <b>Draw</b>. We leave that area out of your new system.</p>
        <p className="marked"><b>{Math.round(panelM2)} m²</b> with panels</p>
        <div className="pair">
          <Field label="Size (kWp)"><Input type="number" min={0} step={0.1} value={a.solar_kwp ?? ""} onChange={(e) => setAnswers({ ...a, solar_kwp: number(e.target.value) })} /></Field>
          <Field label="Year"><Input type="number" min={1990} max={2026} value={a.solar_year ?? ""} onChange={(e) => setAnswers({ ...a, solar_year: number(e.target.value) })} /></Field>
        </div>
      </>)}

      {stage === "battery" && page("Is there a home battery?", null, yesNo("has_storage", { battery_kwh: null }), a.has_storage && <>
        {numberField("How big is it? (kWh)", a.battery_kwh, (battery_kwh) => setAnswers({ ...a, battery_kwh }))}
      </>)}

      {stage === "use" && page("How much electricity do you use a year?", "A rough answer is enough.", <div className="answers">
        {BANDS.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.use_source === "band" && a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh, use_source: "band" })}>{label}</Button>)}
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.use_source === "exact"} onClick={() => answer({ use_source: "exact", demand_kwh: null }, false)}>I know it</Button>
          <Button size="lg" wide aria-pressed={a.use_source === "people"} onClick={() => answer({ use_source: "people", demand_kwh: null }, false)}>No idea</Button>
        </div>
      </div>, a.use_source === "exact" ? numberField("kWh a year, from your bill", a.demand_kwh, (demand_kwh) => setAnswers({ ...a, demand_kwh }))
        : a.use_source === "people" ? <>
          <h2>How many people live here?</h2>
          <div className="answers row">{BY_PEOPLE.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh })}>{label}</Button>)}</div>
        </> : null)}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value} onClick={() => answer(FOSSIL.includes(value) ? { heating: value } : { heating: value, heat_kwh: null, wants_hp: null }, !FOSSIL.includes(value))}>{label}</Button>)}
      </div>, fossil && <>
        {numberField(`${a.heating === "Oil" ? "Oil" : a.heating === "Gas" ? "Gas" : "Heat"} use a year (kWh), from your bill`, a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh }))}
        <h2>Should we look at a heat pump?</h2>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.wants_hp === true} onClick={() => setAnswers({ ...a, wants_hp: true })}>Yes</Button>
          <Button size="lg" wide aria-pressed={a.wants_hp === false} onClick={() => setAnswers({ ...a, wants_hp: false })}>No</Button>
        </div>
      </>)}

      {stage === "car" && page("Do you drive an electric car?", null, <div className="answers">
        <Button size="lg" wide aria-pressed={a.ev === true && !a.ev_planned} onClick={() => answer({ ev: true, ev_planned: false }, false)}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.ev === true && a.ev_planned} onClick={() => answer({ ev: true, ev_planned: true }, false)}>Not yet, but soon</Button>
        <Button size="lg" wide aria-pressed={a.ev === false} onClick={() => answer({ ev: false, ev_planned: false, ev_km: null })}>No</Button>
      </div>, a.ev && numberField("How far do you drive a year? (km)", a.ev_km, (ev_km) => setAnswers({ ...a, ev_km }), "11,300 if you skip"))}
    </aside>
  );
}

/** What the system is, in ranges, with the reason. No share or saving until those numbers are checked. */
