import { Answers, Selected, View, meanSun, polyOf, surfaceKey, surfaceName } from "./api";
import { Face, letter } from "./HomeMap";
import { Back } from "./icons";
import { Button, Check, Field, IconButton, Input, Segmented, Slider, Steps } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Stage = "roof" | "power" | "heat" | "car" | "check";
const ORDER: Stage[] = ["roof", "power", "heat", "car", "check"];
const TITLES: Record<Stage, string> = { roof: "Where should panels go?", power: "Your electricity", heat: "Your heating", car: "Your car", check: "Is this right?" };
const HEATING = [["Gas", "Gas"], ["Oil", "Oil"], ["OtherNonRenewable", "Other fossil"], ["Heatpump", "Heat pump"], ["unknown", "Not sure"]] as const;
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const heatName = (v: string | null) => HEATING.find(([k]) => k === v)?.[1] ?? "Not answered";
const number = (v: string) => (v === "" ? null : Number(v));

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; goTo: (id: string) => void; face: Face | null; setFace: (f: Face | null) => void;
  view: View; setView: (v: View) => void; chosen: string[]; toggle: (key: string) => void; reset: () => void; back: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, goTo, face, setFace, view, setView, chosen, toggle, reset, back }: Props) {
  const all = buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => ({ b, s, key: surfaceKey(b, s) })));
  const picked = all.filter((x) => chosen.includes(x.key));
  const sum = (kind: string) => picked.filter((x) => x.s.kind === kind).reduce((a, x) => a + x.s.m2, 0);
  const roofs = sum("roof"), walls = sum("wall");
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

  const set = (change: Partial<Answers>) => setAnswers({ ...a, ...change });
  const at_ = ORDER.indexOf(stage);
  const done: Record<Stage, boolean> = { roof: picked.length > 0, power: !!a.demand_kwh, heat: a.heating !== null, car: a.ev !== null, check: false };
  done.check = done.roof && done.power && done.heat && done.car;
  const open = ORDER.slice(0, 4).filter((s) => !done[s]);

  const roofStep = <>
      <div className="sum">
        {loading ? <p className="muted">Working out the sun on your buildings…</p> : <>
          <p className="bignum">{Math.round(roofs)} m²<small>of roof chosen</small></p>
          <p className="small muted">The whole measured roof, not the usable area. Windows, chimneys and edges are not known yet.</p>
          {walls > 0 && <p className="small request">Plus {Math.round(walls)} m² of wall as a request.</p>}
        </>}
        {failed && <p className="error small">Sun data could not be loaded for every building.</p>}
      </div>
      <div className="sunbar">
        <Segmented wide label="Show on the map" value={mode} onChange={show} options={[{ value: "photo", label: "Photo" }, { value: "year", label: "Yearly sun" }, { value: "moment", label: "Sun by time" }]} />
        {view.moment && view.layer === "sun" && <div className="sunrow">
          <Field label="Month" value={MONTHS[at.month - 1]}><Slider min={1} max={12} value={at.month} onChange={(e) => setMoment(Number(e.target.value), at.hour)} /></Field>
          <Field label="Time" value={`${at.hour}:00`}><Slider min={hours[0] ?? 8} max={hours[hours.length - 1] ?? 16} value={at.hour} onChange={(e) => setMoment(at.month, Number(e.target.value))} /></Field>
        </div>}
        {view.layer === "sun" && <div className="legend" role="img" aria-label="Blue is least sun, red is most"><i /><span>Less sun</span><span>More sun</span></div>}
      </div>
      <p className="hint">All roofs are in. <b>Click a surface to take it out or add it.</b> Walls are only a request: your installer decides if they work.</p>
      {buildings.map((b, i) => {
        const mine = all.filter((x) => x.b === b).sort((x, y) => meanSun(y.s) - meanSun(x.s));
        const row = ({ s, key }: (typeof mine)[number]) => {
          const me = { building: b.id, poly: polyOf(b, s) };
          return <li key={key} className={face?.building === b.id && face.poly === me.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
            <Check checked={chosen.includes(key)} onChange={() => toggle(key)}><b>{surfaceName(s)}</b><small>{Math.round(s.m2)} m² · {Math.round(meanSun(s)).toLocaleString("en")} kWh/m² sun a year</small></Check>
          </li>;
        };
        const wallList = mine.filter((x) => x.s.kind === "wall");
        return <section key={b.id}>
          <button type="button" className="row" onClick={() => goTo(b.id)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
          <ul className="chosen">{mine.filter((x) => x.s.kind === "roof").map(row)}</ul>
          {wallList.length > 0 && <details><summary>Ask about walls ({wallList.length})</summary><ul className="chosen">{wallList.map(row)}</ul></details>}
        </section>;
      })}
      <div className="panelfoot"><Button wide onClick={reset}>Back to all roofs</Button></div>
      <p className="source small muted">Buildings and aerial photo: Bayerische Vermessungsverwaltung. Yearly sunlight: PVGIS, European Commission. Sun position and shadows are calculated from these, without trees.</p>
  </>;

  return (
    <aside className="panel tall">
      <header className="panelbar"><IconButton label="Back to selecting" onClick={back}><Back /></IconButton><b>{TITLES[stage]}</b></header>
      <Steps label="Steps" value={stage} onChange={setStage} steps={[
        { value: "roof", label: "Roof", done: done.roof }, { value: "power", label: "Power", done: done.power }, { value: "heat", label: "Heating", done: done.heat },
        { value: "car", label: "Car", done: done.car }, { value: "check", label: "Check", done: done.check },
      ]} />

      {stage === "roof" && roofStep}

      {stage === "power" && <div className="ask">
        <p className="muted">This sets how big the system should be.{buildings.length > 1 ? " Answer for all chosen buildings together." : ""}</p>
        <Field label="Electricity you use in a year (kWh)" hint="It is on your yearly bill.">
          <Input type="number" min={500} step={100} placeholder="Your yearly use" value={a.demand_kwh ?? ""} onChange={(e) => set({ demand_kwh: number(e.target.value) })} />
        </Field>
        <Field label="What you pay per kWh (cent)" hint="32 ct is only a starting value. Yours is on the bill.">
          <Input type="number" min={1} step={0.5} value={a.price_ct_kwh} onChange={(e) => set({ price_ct_kwh: Number(e.target.value) })} />
        </Field>
        <h3>Already on the building</h3>
        <Check checked={a.has_solar} onChange={(has_solar) => set({ has_solar })}>Solar panels</Check>
        <Check checked={a.has_storage} onChange={(has_storage) => set({ has_storage })}>A battery</Check>
      </div>}

      {stage === "heat" && <div className="ask">
        <p className="muted">This tells us if a heat pump is worth looking at.</p>
        <h3>How do you heat today?</h3>
        <div className="pills">{HEATING.map(([value, label]) => <Button key={value} aria-pressed={a.heating === value} onClick={() => set({ heating: value })}>{label}</Button>)}</div>
        {FOSSIL.includes(a.heating ?? "") && <Field label="Heat you use in a year (kWh)" hint="Optional. Without it we cannot judge a heat pump.">
          <Input type="number" min={0} step={500} placeholder="From your gas or oil bill" value={a.heat_kwh ?? ""} onChange={(e) => set({ heat_kwh: number(e.target.value) })} />
        </Field>}
      </div>}

      {stage === "car" && <div className="ask">
        <p className="muted">A car adds a lot of electricity use, and it decides on a wallbox.</p>
        <h3>Do you have, or plan to buy, an electric car?</h3>
        <div className="pills"><Button aria-pressed={a.ev === true} onClick={() => set({ ev: true })}>Yes</Button><Button aria-pressed={a.ev === false} onClick={() => set({ ev: false })}>No</Button></div>
        {a.ev && <Field label="Kilometres a year" hint="A rough number is fine."><Input type="number" min={0} step={1000} value={a.ev_km} onChange={(e) => set({ ev_km: Number(e.target.value) })} /></Field>}
      </div>}

      {stage === "check" && <div className="ask">
        <dl className="review">
          <dt>Roof</dt><dd>{Math.round(roofs)} m² chosen{walls > 0 ? `, ${Math.round(walls)} m² of wall as a request` : ""}</dd><Button onClick={() => setStage("roof")}>Change</Button>
          <dt>Electricity</dt><dd>{a.demand_kwh ? `${a.demand_kwh.toLocaleString("en")} kWh a year at ${a.price_ct_kwh} ct` : "Not answered"}{a.has_solar ? ", has solar" : ""}{a.has_storage ? ", has a battery" : ""}</dd><Button onClick={() => setStage("power")}>Change</Button>
          <dt>Heating</dt><dd>{heatName(a.heating)}{a.heat_kwh ? `, ${a.heat_kwh.toLocaleString("en")} kWh a year` : ""}</dd><Button onClick={() => setStage("heat")}>Change</Button>
          <dt>Car</dt><dd>{a.ev === null ? "Not answered" : a.ev ? `Electric, ${a.ev_km.toLocaleString("en")} km a year` : "No electric car"}</dd><Button onClick={() => setStage("car")}>Change</Button>
        </dl>
        <p className={open.length ? "request" : "muted"}>{open.length ? `Still open: ${open.map((s) => TITLES[s].replace("Your ", "").toLowerCase()).join(", ")}.` : "That is everything for a first design."}</p>
      </div>}

      {stage !== "check" && <div className="stepnav">
        {at_ > 0 && <Button size="lg" onClick={() => setStage(ORDER[at_ - 1])}>Back</Button>}
        <Button variant="solid" size="lg" wide onClick={() => setStage(ORDER[at_ + 1])}>Next</Button>
      </div>}
    </aside>
  );
}
