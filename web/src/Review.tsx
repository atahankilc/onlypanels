import { useEffect, useRef, useState } from "react";
import { Answers, Selected } from "./api";
import { Face } from "./HomeMap";
import { Button, Field, Input } from "./ui";

const BANDS = [["Under 3,000", 2500], ["3,000 – 4,000", 3500], ["4,000 – 5,000", 4500], ["5,000 – 7,000", 6000], ["Over 7,000", 8500]] as const;
// The last resort when the use is not known at all. Stromspiegel 2025, single-family house, from secondary sources; one person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5+", 4500]] as const;
// Past projects hold almost only heat pump, gas and oil (scripts/profile_heating.py); anything else the engine treats as unknown.
// What the customer can tell us beyond that is asked, never required: a heat pump's own meter, the gas or oil a year.
const HEATING = [["Heatpump", "Heat pump"], ["Gas", "Gas"], ["Oil", "Oil"], ["OtherRenewable", "Wood or pellets"], ["unknown", "Something else or not sure"]] as const;
const KWH_PER_LITRE_OIL = 10; // heating oil, about 10 kWh of heat per litre
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const number = (v: string) => (v === "" ? null : Number(v));

export type Stage = "roof" | "solar" | "battery" | "use" | "heat" | "car" | "send" | "sent";
/** One topic a page. A follow-up opens on the same page, under the answer that needs it, so the count never changes. */
// Every household sees the same pages, so the count never moves. A battery without solar is rare, but one tap answers it.
const PAGES: Stage[] = ["roof", "solar", "battery", "use", "heat", "car", "send"];
const flowFor = (_: Answers): Stage[] => PAGES;

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; setFace: (f: Face | null) => void; m2: number; panelM2: number; reset: () => void; back: () => void; changed: boolean; retrySun: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, setFace, m2, panelM2, reset, back, changed, retrySun }: Props) {
  const all = buildings.flatMap((b) => b.sun?.surfaces ?? []);
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const at_ = Math.max(0, PAGES.indexOf(stage));
  // The electricity page shows one way of answering at a time: the number, a range, and as a last resort the household size.
  const [way, setWay] = useState<"exact" | "range" | "people">(a.use_source === "band" || a.use_source === "range" ? "range" : a.use_source === "people" || a.use_source === "unknown" ? "people" : "exact");
  const noIdea = <button type="button" className="textlink" onClick={() => setWay("people")}>I have no idea</button>;
  const go = (next: Stage) => {
    setFace(null);
    setStage(next);
  };
  const flow = flowFor(a), here = Math.max(0, flow.indexOf(stage));
  const next = () => go(flow[here + 1]);
  const previous = () => (here ? go(flow[here - 1]) : back());
  /** An answer with nothing more to ask moves on; one that needs more opens it below. The next page follows the answer as it now stands. */
  const answer = (change: Partial<Answers>, done = true) => {
    const after = { ...a, ...change }, list = flowFor(after);
    setAnswers(after);
    if (done) go(list[list.indexOf(stage) + 1]);
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
  /** A field that helps but can be left empty: it says so in its label. */
  const optional = (label: string) => <>{label}<span className="opt">Optional</span></>;
  const numberField = (label: React.ReactNode, value: number | null, set: (v: number | null) => void, placeholder?: string) =>
    <Field label={label}><Input type="number" min={0} placeholder={placeholder} value={value ?? ""} onChange={(e) => set(number(e.target.value))} /></Field>;

  if (stage === "roof") return (
    <aside className="panel tall quiz" key="roof" ref={panel}>
      <p className="count">Question 1 of {PAGES.length - 1}</p>
      <h1>Where would you like panels?</h1>
      <p className="muted">You do not have to change anything here. We find the best layout for your home either way. If some parts matter to you, mark them and we use them first.</p>
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
        <h2>Where are the panels?<span className="opt">Optional</span></h2>
        <p className="small muted">Mark them on the map with <b>Whole surface</b> or <b>Draw</b>. We leave that area out of your new system.</p>
        <p className="marked"><b>{Math.round(panelM2)} m²</b> with panels</p>
        <p className="small muted">Size and year help, but you can skip them: we then work from the area you marked.</p>
        <div className="pair">
          <Field label={optional("Size (kWp)")}><Input type="number" min={0} step={0.1} value={a.solar_kwp ?? ""} onChange={(e) => setAnswers({ ...a, solar_kwp: number(e.target.value) })} /></Field>
          <Field label={optional("Year")}><Input type="number" min={1990} max={2026} value={a.solar_year ?? ""} onChange={(e) => setAnswers({ ...a, solar_year: number(e.target.value) })} /></Field>
        </div>

      </>)}

      {stage === "battery" && page(a.has_solar ? "Is there a home battery too?" : "Is there a home battery?", null, yesNo("has_storage", { battery_kwh: null }), a.has_storage && <>
        {numberField(optional("How big is it? (kWh)"), a.battery_kwh, (battery_kwh) => setAnswers({ ...a, battery_kwh }))}
      </>)}

      {stage === "use" && <>
        <p className="count">Question {at_ + 1} of {PAGES.length - 1}</p>
        <h1>How much electricity do you use a year?</h1>
        {way === "exact" && <>
          <p className="muted">It is on your yearly bill.</p>
          <div className="answers">
            <Field label="kWh a year"><Input type="number" min={0} placeholder="e.g. 4,200" value={a.use_source === "exact" ? a.demand_kwh ?? "" : ""}
              onChange={(e) => setAnswers({ ...a, demand_kwh: number(e.target.value), use_source: e.target.value ? "exact" : null })} /></Field>
          </div>
          <div className="switches">
            <button type="button" className="textlink" onClick={() => setWay("range")}>I don't know it exactly</button>
            {noIdea}
          </div>
        </>}
        {way === "range" && <>
          <p className="muted">A rough range is enough, in kWh a year.</p>
          <div className="answers grid2">
            {BANDS.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.use_source === "band" && a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh, use_source: "band", use_range: [null, null] })}>{label}</Button>)}
            <Button size="lg" wide aria-pressed={a.use_source === "range"} onClick={() => setAnswers({ ...a, use_source: "range", demand_kwh: null, use_range: [null, null] })}>My own range</Button>
          </div>
          {a.use_source === "range" && <div className="more"><div className="pair">
            {([0, 1] as const).map((k) => <Field key={k} label={k ? "To" : "From"}><Input type="number" min={0} placeholder="kWh" value={a.use_range[k] ?? ""} onChange={(e) => {
              const range: [number | null, number | null] = [...a.use_range];
              range[k] = number(e.target.value);
              const [lo, hi] = range;
              setAnswers({ ...a, use_range: range, demand_kwh: lo && hi ? Math.round((lo + hi) / 2) : lo || hi || null });
            }} /></Field>)}
          </div></div>}
          <div className="switches">
            <button type="button" className="textlink" onClick={() => setWay("exact")}>I know the number</button>
            {noIdea}
          </div>
        </>}
        {way === "people" && <>
          <p className="muted">Then tell us how many people live here. We start from a typical value, and your installer checks it with you.</p>
          <div className="answers people">{BY_PEOPLE.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.use_source === "people" && a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh, use_source: "people", use_range: [null, null] })}>{label}</Button>)}</div>
          <div className="switches">
            <button type="button" className="textlink" onClick={() => setWay("range")}>Back to ranges</button>
            <button type="button" className="textlink" onClick={() => answer({ use_source: "unknown", demand_kwh: null, use_range: [null, null] })}>Skip</button>
          </div>
        </>}
        <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={next}>Next</Button></div>
      </>}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers grid2">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value}
          onClick={() => answer({ heating: value, heat_kwh: null, oil_l: null, hp_kwh: null, wants_hp: null }, !(FOSSIL.includes(value) || value === "Heatpump"))}>{label}</Button>)}
      </div>, a.heating === "Heatpump" ? <>
        {numberField(optional("Its electricity a year (kWh)"), a.hp_kwh, (hp_kwh) => setAnswers({ ...a, hp_kwh }), "From its own meter or bill")}
        <p className="small muted">The new solar can cover it too.</p>
      </> : fossil && <>
        <h2>Interested in a heat pump instead?</h2>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.wants_hp === true} onClick={() => setAnswers({ ...a, wants_hp: true })}>Yes</Button>
          <Button size="lg" wide aria-pressed={a.wants_hp === false} onClick={() => setAnswers({ ...a, wants_hp: false })}>No</Button>
        </div>
        {a.wants_hp !== null && <>
          <p className="small muted">{a.wants_hp ? "Your yearly use sizes the heat pump." : "We may still show you a heat pump option. Your yearly use sizes it."}</p>
          {a.heating === "Oil"
            ? numberField(optional("Oil a year (litres)"), a.oil_l, (oil_l) => setAnswers({ ...a, oil_l, heat_kwh: oil_l ? oil_l * KWH_PER_LITRE_OIL : null }))
            : numberField(optional("Gas a year (kWh), from your bill"), a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh }))}
        </>}
      </>)}

      {stage === "car" && page("Do you drive an electric car?", null, <div className="answers">
        <Button size="lg" wide aria-pressed={a.ev === true && !a.ev_planned} onClick={() => answer({ ev: true, ev_planned: false }, false)}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.ev === true && a.ev_planned} onClick={() => answer({ ev: true, ev_planned: true }, false)}>Not yet, but soon</Button>
        <Button size="lg" wide aria-pressed={a.ev === false} onClick={() => answer({ ev: false, ev_planned: false, ev_km: null })}>No</Button>
      </div>, a.ev && numberField(optional("How far do you drive a year? (km)"), a.ev_km, (ev_km) => setAnswers({ ...a, ev_km }), "11,300 if you skip"))}
    </aside>
  );
}

/** What the system is, in ranges, with the reason. No share or saving until those numbers are checked. */
