import { useEffect, useRef, useState } from "react";
import { Answers, PRICE_CT, Selected, modelM2 } from "./api";
import { Face } from "./HomeMap";
import { Button, Field, Input } from "./ui";

const BANDS = [["Under 3,000", 2500], ["3,000 – 4,000", 3500], ["4,000 – 5,000", 4500], ["5,000 – 7,000", 6000], ["Over 7,000", 8500]] as const;
// The last resort when the use is not known at all. Stromspiegel 2025, single-family house, from secondary sources; one person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5+", 4500]] as const;
// Past projects hold almost only heat pump, gas and oil (scripts/profile_heating.py); anything else the engine treats as unknown.
// What the customer can tell us beyond that is asked, never required: a heat pump's own meter, the gas or oil a year.
const HEATING = [["Heatpump", "Heat pump"], ["Gas", "Gas"], ["Oil", "Oil"], ["OtherRenewable", "Wood or pellets"], ["unknown", "Something else or not sure"]] as const;
const BIG_USERS = [["pool", "Pool"], ["sauna", "Sauna"], ["ac", "Air conditioning"], ["water", "Electric water heater"]] as const;
const BUILT = [["before1979", "Before 1979"], ["1979to1990", "1979 – 1990"], ["1991to2000", "1991 – 2000"], ["2001to2010", "2001 – 2010"], ["since2011", "2011 or later"]] as const;
const GOALS = [["cost", "Low cost", "A system that pays back fast"], ["independence", "Independence", "As much of my own power as I can"], ["environment", "The environment", "As much clean power as the roof gives"]] as const;
const KWH_PER_LITRE_OIL = 10; // heating oil, about 10 kWh of heat per litre
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const number = (v: string) => (v === "" ? null : Number(v));

export type Stage = "roof" | "roofinfo" | "solar" | "battery" | "use" | "big" | "house" | "heat" | "car" | "charge" | "goal" | "send" | "sent";
/** One topic a page. A follow-up opens on the same page, under the answer that needs it, so the count never changes. */
// Every household sees the same pages, so the count never moves. A battery without solar is rare, but one tap answers it.
// Charging habits only follow a car, now or soon.
const PAGES: Stage[] = ["roof", "roofinfo", "solar", "battery", "use", "big", "house", "heat", "car", "charge", "goal", "send"];
const flowFor = (a: Answers): Stage[] => PAGES.filter((p) => p !== "charge" || a.ev);

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void;
  buildings: Selected[]; setFace: (f: Face | null) => void; m2: number; panelM2: number; reset: () => void; back: () => void; changed: boolean; retrySun: () => void;
};

export default function Review({ stage, setStage, answers: a, setAnswers, buildings, setFace, m2, panelM2, reset, back, changed, retrySun }: Props) {
  const all = buildings.flatMap((b) => b.sun?.surfaces ?? []);
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const at_ = Math.max(0, PAGES.indexOf(stage));
  // The electricity page shows one way of answering at a time: the number, a range, and as a last resort the household size.
  const [way, setWay] = useState<"exact" | "range" | "people" | "payment">(a.use_source === "band" || a.use_source === "range" ? "range" : a.use_source === "people" || a.use_source === "unknown" ? "people" : a.use_source === "payment" ? "payment" : "exact");
  const priceField = () => numberField(optional("Price per kWh (cents), from your bill"), a.price_known ? a.price_ct_kwh : null, (v) => setAnswers({ ...a, price_ct_kwh: v ?? PRICE_CT, price_known: v != null }), `${PRICE_CT} if you skip (Munich basic supply)`);
  const noIdea = <button type="button" className="textlink" onClick={() => setWay("people")}>I have no idea</button>;
  const go = (next: Stage) => {
    setFace(null);
    setStage(next);
  };
  const flow = flowFor(a), here = Math.max(0, flow.indexOf(stage));
  // Changing an answer from the overview brings you straight back to it.
  const [fromOverview, setFromOverview] = useState(false);
  const next = () => go(fromOverview ? "send" : flow[here + 1]);
  const nextLabel = fromOverview ? "Go to overview" : "Next";
  const previous = () => (here ? go(flow[here - 1]) : back());
  /** An answer only records itself, and opens below what it needs. Every page moves on with its own Next, never by itself. */
  const answer = (change: Partial<Answers>, _done = true) => setAnswers({ ...a, ...change });

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
    <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={next}>{nextLabel}</Button></div>
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
      <div className="stick"><Button size="lg" onClick={back}>Back</Button><Button variant="solid" size="lg" wide disabled={loading} onClick={next}>{nextLabel}</Button></div>
      <p className="source small muted">Bayerische Vermessungsverwaltung, PVGIS (European Commission). Shadows from nearby buildings, without trees.</p>
    </aside>
  );

  if (stage === "send") {
    // Everything the homeowner told us, grouped as the questions were, each group with a way back to change it.
    const no = "Not given", n = (v: number | null | undefined, unit: string) => (v ? `${Math.round(v).toLocaleString("en")} ${unit}` : no);
    const label = <T extends readonly (readonly string[])[]>(list: T, v: string | null | undefined) => list.find((x) => x[0] === v)?.[1] ?? no;
    const yes = (v: boolean | null | undefined, y = "Yes", nn = "No") => (v === true ? y : v === false ? nn : no);
    const use = a.use_source === "exact" ? n(a.demand_kwh, "kWh a year") : a.use_source === "band" ? `${BANDS.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} kWh a year`
      : a.use_source === "range" ? `${a.use_range.filter(Boolean).map((x) => x!.toLocaleString("en")).join(" – ")} kWh a year` : a.use_source === "payment" ? `${n(a.monthly_eur, "€ a month")} payment`
      : a.use_source === "people" ? `${BY_PEOPLE.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} people, typical use` : a.use_source === "unknown" ? "Not known" : no;
    const car = a.ev === false ? "No" : a.ev ? (a.ev_planned ? `Coming ${a.ev_when === "soon" ? "within a year" : a.ev_when === "later" ? "later" : "soon"}` : "Yes") : no;
    const groups: [string, Stage, [string, string][]][] = [
      ["Your roof", "roof", [["Priority area", `${Math.round(m2)} m²`]]],
      ["Roof renewal", "roofinfo", [["Renewed soon", a.roof_renovation === "unsure" ? "Not sure" : yes(a.roof_renovation === "yes" ? true : a.roof_renovation === "no" ? false : null)]]],
      ["Solar already there", "solar", a.has_solar ? [["Solar", "Yes"], ["Marked area", `${Math.round(panelM2)} m²`], ["Size", n(a.solar_kwp, "kWp")], ["Year", a.solar_year ? String(a.solar_year) : no]] : [["Solar", yes(a.has_solar)]]],
      ["Home battery", "battery", [["Battery", yes(a.has_storage)], ...(a.has_storage ? [["Size", n(a.battery_kwh, "kWh")] as [string, string]] : [])]],
      ["Electricity", "use", [["Yearly use", use], ["Price", a.price_known ? `${a.price_ct_kwh} ct per kWh` : no]]],
      ["Big electric users", "big", [["Has", a.big_users.length ? a.big_users.map((v) => label(BIG_USERS, v)).join(", ") : "None"]]],
      ["Your house", "house", [["Built", label(BUILT, a.built)], ["Living area", n(a.living_m2, "m²")], ["Energy certificate", n(a.cert_kwh_m2, "kWh per m²")]]],
      ["Heating", "heat", [["Heating", label(HEATING, a.heating)], ...(a.heating === "Heatpump" ? [["Its electricity", n(a.hp_kwh, "kWh a year")] as [string, string]] : []),
        ...(FOSSIL.includes(a.heating ?? "") ? [["Heat pump", yes(a.wants_hp, "Interested", "Not interested")], [a.heating === "Oil" ? "Oil" : "Gas", a.heating === "Oil" ? n(a.oil_l, "litres a year") : n(a.heat_kwh, "kWh a year")]] as [string, string][] : [])]],
      ["Electric car", "car", a.ev ? [["Car", car], ["How many", a.ev_count ? String(a.ev_count) : no], ["Charged at home", n(a.ev_kwh_month, "kWh a month")], ["Driving", n(a.ev_km, "km a year")]] : [["Car", car]]],
      ...(a.ev ? [["Charging", "charge", [["Where", a.ev_charge_home === "most" ? "Mostly at home" : a.ev_charge_home === "half" ? "Half and half" : a.ev_charge_home === "little" ? "Mostly elsewhere" : no],
        ["Home in the day", yes(a.ev_day, "Often", "Rarely")], ["Wallbox", yes(a.has_wallbox, "Already there", "Not yet")]]] as [string, Stage, [string, string][]]] : []),
      ["What matters most", "goal", [["Priority", GOALS.find((x) => x[0] === a.goal)?.[1] ?? no]]],
    ];
    return (
      <aside className="panel tall quiz" key="send" ref={panel}>
        <p className="count">Overview</p>
        <h1>Is everything right?</h1>
        <p className="muted">An installer plans your system from this and sends you an offer. "Not given" is fine: they will ask you.</p>
        <div className="overview">
          {groups.map(([title, to, rows]) => <section key={to}>
            <header><h2>{title}</h2><button type="button" className="textlink" onClick={() => { setFromOverview(true); go(to); }}>Change</button></header>
            <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v === no ? "none" : undefined}>{v}</dd></div>)}</dl>
          </section>)}
        </div>
        <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go("sent")}>Send to an installer</Button></div>
      </aside>
    );
  }

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
      {stage === "roofinfo" && page("Will the roof be renewed in the next few years?", "Panels go on after a new roof, not before.", <div className="answers grid3">
        {([["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]] as const).map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.roof_renovation === v} onClick={() => setAnswers({ ...a, roof_renovation: v })}>{label}</Button>)}
      </div>)}

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
            {priceField()}
          </div>
          <div className="switches">
            <button type="button" className="textlink" onClick={() => setWay("range")}>I don't know it exactly</button>
            {noIdea}
          </div>
          <button type="button" className="textlink lone" onClick={() => setWay("payment")}>I only know my monthly payment</button>
        </>}
        {way === "payment" && <>
          <p className="muted">The amount you pay each month for electricity. We work out the use from it.</p>
          <div className="answers">
            {numberField("Monthly payment (€)", a.monthly_eur, (monthly_eur) => setAnswers({ ...a, monthly_eur, use_source: monthly_eur ? "payment" : null, demand_kwh: null }))}
            {priceField()}
          </div>
          <div className="switches">
            <button type="button" className="textlink" onClick={() => setWay("exact")}>I know the yearly use</button>
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
        <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={next}>{nextLabel}</Button></div>
      </>}

      {stage === "big" && page("Anything big that runs on electricity?", "Pick all that apply.", <div className="answers grid2">
        {BIG_USERS.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.big_users.includes(v)} onClick={() => setAnswers({ ...a, big_users: a.big_users.includes(v) ? a.big_users.filter((x) => x !== v) : [...a.big_users, v] })}>{label}</Button>)}
      </div>)}

      {stage === "house" && page("About your house", null, <div className="more flat">
        <h2>When was it built?</h2>
        <div className="answers grid2">
          {BUILT.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.built === v} onClick={() => setAnswers({ ...a, built: v })}>{label}{a.area?.built === v && <span className="common">Common here</span>}</Button>)}
        </div>
        {a.area?.built && <p className="small muted">"Common here": {Math.round((a.area.built_share ?? 0) * 100)}% of homes nearby, Census 2022.</p>}
        {numberField(optional("Living area (m²)"), a.living_m2, (living_m2) => setAnswers({ ...a, living_m2 }), modelM2(buildings) ? `About ${modelM2(buildings)} from the 3D model` : undefined)}
        {numberField(optional("Energy certificate (kWh per m² a year)"), a.cert_kwh_m2, (cert_kwh_m2) => setAnswers({ ...a, cert_kwh_m2 }), "If you have one")}
      </div>)}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers grid2">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value}
          onClick={() => answer({ heating: value, heat_kwh: null, oil_l: null, hp_kwh: null, wants_hp: null }, !(FOSSIL.includes(value) || value === "Heatpump"))}>{label}{a.area?.heating === value && <span className="common">Common here</span>}</Button>)}
        {a.area?.heating && <p className="small muted span2">{a.area.heating === "District" ? "Most homes nearby use district heating" : a.area.heating === "Electric" ? "Most homes nearby heat with electricity" : `"Common here": ${Math.round((a.area.heating_share ?? 0) * 100)}% of homes nearby`}, Census 2022.</p>}
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
        <Button size="lg" wide aria-pressed={a.ev === true && !a.ev_planned} onClick={() => answer({ ev: true, ev_planned: false, ev_when: null })}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.ev === true && a.ev_planned} onClick={() => answer({ ev: true, ev_planned: true, ev_kwh_month: null, has_wallbox: null })}>Not yet, but soon</Button>
        <Button size="lg" wide aria-pressed={a.ev === false} onClick={() => answer({ ev: false, ev_planned: false, ev_km: null, ev_count: null, ev_kwh_month: null, ev_when: null, ev_charge_home: null, ev_day: null, has_wallbox: null })}>No</Button>
      </div>, a.ev && <>
        {a.ev_planned && <>
          <h2>When?</h2>
          <div className="pair">
            <Button size="lg" wide aria-pressed={a.ev_when === "soon"} onClick={() => setAnswers({ ...a, ev_when: "soon" })}>Within a year</Button>
            <Button size="lg" wide aria-pressed={a.ev_when === "later"} onClick={() => setAnswers({ ...a, ev_when: "later" })}>Later</Button>
          </div>
        </>}
        {numberField(optional("How many electric cars?"), a.ev_count, (ev_count) => setAnswers({ ...a, ev_count: ev_count && ev_count > 0 ? Math.round(ev_count) : null }), "1 if you skip")}
        {!a.ev_planned && numberField(optional("Charged at home a month (kWh)"), a.ev_kwh_month, (ev_kwh_month) => setAnswers({ ...a, ev_kwh_month }), "From your wallbox or car app")}
        {numberField(optional(a.ev_planned ? "Kilometres a year you expect, all cars" : "Or: kilometres a year, all cars"), a.ev_km, (ev_km) => setAnswers({ ...a, ev_km }), `${(11300 * (a.ev_count ?? 1)).toLocaleString("en")} if you skip`)}
      </>)}

      {stage === "charge" && page("How do you charge?", null, <div className="more flat">
        <h2>Where mostly?</h2>
        <div className="answers">
          {([["most", "At home"], ["half", "Half and half"], ["little", "Elsewhere"]] as const).map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.ev_charge_home === v} onClick={() => setAnswers({ ...a, ev_charge_home: v })}>{label}</Button>)}
        </div>
        <h2>Is the car at home during the day?</h2>
        <p className="small muted">Then it can charge straight from the sun.</p>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.ev_day === true} onClick={() => setAnswers({ ...a, ev_day: true })}>Often</Button>
          <Button size="lg" wide aria-pressed={a.ev_day === false} onClick={() => setAnswers({ ...a, ev_day: false })}>Rarely</Button>
        </div>
        <h2>Is there a wallbox already?</h2>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.has_wallbox === true} onClick={() => setAnswers({ ...a, has_wallbox: true })}>Yes</Button>
          <Button size="lg" wide aria-pressed={a.has_wallbox === false} onClick={() => setAnswers({ ...a, has_wallbox: false })}>No</Button>
        </div>
      </div>)}

      {stage === "goal" && page("What matters most to you?", "We size the system with this in mind.", <div className="answers">
        {GOALS.map(([v, label, line]) => <Button key={v} size="lg" wide className="choice" aria-pressed={a.goal === v} onClick={() => setAnswers({ ...a, goal: v })}><b>{label}</b><small>{line}</small></Button>)}
      </div>)}
    </aside>
  );
}

/** What the system is, in ranges, with the reason. No share or saving until those numbers are checked. */
