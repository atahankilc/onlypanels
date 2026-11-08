import { useEffect, useRef, useState } from "react";
import { Answers, GAS_CT, PRICE_CT, Selected, modelM2, shrinkPhoto } from "./api";
import { Face } from "./HomeMap";
import { Handoff, Mine } from "./plan";
import { Shared, forInstaller } from "./share";
import SendView from "./SendView";
import { Status, day, stepOf } from "./Requests";
import { Button, Check, Field, Input } from "./ui";

const BANDS = [["Under 3,000", 2500], ["3,000 – 4,000", 3500], ["4,000 – 5,000", 4500], ["5,000 – 7,000", 6000], ["Over 7,000", 8500]] as const;
// The last resort when the use is not known at all. Stromspiegel 2025, single-family house, from secondary sources; one person is our own guess. Shown to the planner as assumed.
const BY_PEOPLE = [["1", 2000], ["2", 2700], ["3", 3500], ["4", 3800], ["5+", 4500]] as const;
// Past projects hold almost only heat pump, gas and oil (scripts/profile_heating.py); anything else the engine treats as unknown.
// What the customer can tell us beyond that is asked, never required: a heat pump's own meter, the gas or oil a year.
// District and electric heating are what the census can name as common here, so they can be picked too. Electric heating can take a heat pump;
// district heating gets none (the planner is told why).
const HEATING = [["Heatpump", "Heat pump"], ["Gas", "Gas"], ["Oil", "Oil"], ["District", "District heating"], ["Electric", "Electric heating"], ["OtherRenewable", "Wood or pellets"], ["unknown", "Something else or not sure"]] as const;
const SOLAR_KIND = [["pv", "Electricity"], ["thermal", "Hot water"], ["both", "Both"]] as const;
const BOILER_AGE = [["under10", "Under 10 years"], ["10to20", "10 – 20 years"], ["over20", "Over 20 years"]] as const;
const HEAT_DIST = [["floor", "Underfloor"], ["radiators", "Radiators"], ["both", "Both"]] as const;
const HOME_DAY = [["most", "Mostly"], ["some", "Sometimes"], ["rarely", "Rarely"]] as const;
const OWNER = [["sole", "Only me or my family"], ["shared", "Shared with other owners"], ["tenant", "I rent it"]] as const;
const BIG_USERS = [["pool", "Pool"], ["sauna", "Sauna"], ["ac", "Air conditioning"], ["water", "Electric water heater"]] as const;
const BUILT = [["before1979", "Before 1979"], ["1979to1990", "1979 – 1990"], ["1991to2000", "1991 – 2000"], ["2001to2010", "2001 – 2010"], ["since2011", "2011 or later"]] as const;
const GOALS = [["cost", "Low cost", "A smaller system, a lower price"], ["independence", "Independence", "As much of my own power as I can"], ["environment", "The environment", "As much clean power as the roof gives"]] as const;
const KWH_PER_LITRE_OIL = 10; // heating oil, about 10 kWh of heat per litre
const FOSSIL = ["Gas", "Oil", "OtherNonRenewable"];
const REPLACEABLE = [...FOSSIL, "Electric"]; // heating a heat pump can replace
const number = (v: string) => (v === "" ? null : Number(v));

const FACING = [["south", "South"], ["south-east", "South-east"], ["south-west", "South-west"], ["east", "East"], ["west", "West"], ["north", "North"], ["flat", "Flat roof"], ["unsure", "Not sure"]] as const;
const SLOPE = [["gentle", "Gentle", "Easy to walk on, under about 30°"], ["steep", "Steep", "A usual pitched roof"], ["unsure", "Not sure", ""]] as const;
const SIZE = [["small", "Small house", "Terraced or semi-detached"], ["medium", "Detached house", "One family"], ["large", "Large house", "Two families or more, or a big footprint"], ["known", "I know the roof area", ""]] as const;
export type Stage = "where" | "roofq" | "roof" | "solar" | "battery" | "use" | "big" | "house" | "heat" | "car" | "charge" | "goal" | "send" | "share" | "sent";
/** One topic a page. A follow-up opens on the same page, under the answer that needs it, so the count never changes. */
// Every household sees the same pages, so the count never moves. A battery without solar is rare, but one tap answers it.
// Charging habits only follow a car, now or soon.
const PAGES: Stage[] = ["roof", "solar", "battery", "use", "big", "house", "heat", "car", "charge", "goal", "send"];
// Without a home on the map there is no roof to mark: questions only start with where the home is and its roof, in words.
const pagesFor = (mapped: boolean): Stage[] => (mapped ? PAGES : ["where", "roofq", ...PAGES.filter((p) => p !== "roof")]); // without the map the home is told in words
const flowFor = (a: Answers, mapped = true): Stage[] => pagesFor(mapped).filter((p) => p !== "charge" || a.ev);

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void; refId: string; progress?: Mine; done: () => void; onPanels?: (p: Record<string, number> | null) => void;
  buildings: Selected[]; setFace: (f: Face | null) => void; m2: number; panelM2: number; reset: () => void; back: () => void; changed: boolean; retrySun: () => void;
  request: Handoff; shared: Shared; setShared: (s: Shared) => void;
};

export default function Review({ refId, progress, done, onPanels, stage, setStage, answers: a, setAnswers, buildings, setFace, m2, panelM2, reset, back, changed, retrySun, request, shared, setShared }: Props) {
  const all = buildings.flatMap((b) => b.sun?.surfaces ?? []);
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const mapped = buildings.length > 0, pages = pagesFor(mapped);
  const at_ = Math.max(0, pages.indexOf(stage));
  // The electricity page shows one way of answering at a time: the number, a range, and as a last resort the household size.
  const [way, setWay] = useState<"exact" | "range" | "people" | "payment">(a.use_source === "band" || a.use_source === "range" ? "range" : a.use_source === "people" || a.use_source === "unknown" ? "people" : a.use_source === "payment" ? "payment" : "exact");
  // Gas can be given in kWh or as what is paid a year; the euros are turned into kWh at Munich's all-in gas price.
  const [gasWay, setGasWay] = useState<"kwh" | "eur">(a.gas_eur ? "eur" : "kwh");
  const priceField = () => numberField(optional("Price per kWh (cents), from your bill"), a.price_known ? a.price_ct_kwh : null, (v) => setAnswers({ ...a, price_ct_kwh: v ?? PRICE_CT, price_known: v != null }), `${PRICE_CT} if you skip (Munich basic supply)`);
  const noIdea = <button type="button" className="textlink" onClick={() => setWay("people")}>I have no idea</button>;
  const go = (next: Stage) => {
    setFace(null);
    setStage(next);
  };
  const flow = flowFor(a, mapped), here = Math.max(0, flow.indexOf(stage));
  // Changing an answer from the overview brings you straight back to it.
  const [fromOverview, setFromOverview] = useState(false);
  const next = () => go(fromOverview ? "send" : flow[here + 1]);
  const nextLabel = fromOverview ? "Go to overview" : "Next";
  const previous = () => (here ? go(flow[here - 1]) : back());
  /** An answer only records itself, and opens below what it needs. Every page moves on with its own Next, never by itself. */
  const answer = (change: Partial<Answers>, _done = true) => setAnswers({ ...a, ...change });

  const panel = useRef<HTMLElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const takePhoto = (file: File | undefined) => file && shrinkPhoto(file).then((meter_photo) => { setPhotoFailed(false); setAnswers({ ...a, meter_photo }); }).catch(() => setPhotoFailed(true));
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
    <p className="count">Question {at_ + 1} of {pages.length - 1}</p>
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

  /** Everything the homeowner told us, grouped as the questions were. On the overview each group can be changed; after sending it is read only. */
  const summary = (editable: boolean) => {
    // Everything the homeowner told us, grouped as the questions were, each group with a way back to change it.
    const no = "Not given", n = (v: number | null | undefined, unit: string) => (v ? `${Math.round(v).toLocaleString("en")} ${unit}` : no);
    const label = <T extends readonly (readonly string[])[]>(list: T, v: string | null | undefined) => list.find((x) => x[0] === v)?.[1] ?? no;
    const yes = (v: boolean | null | undefined, y = "Yes", nn = "No") => (v === true ? y : v === false ? nn : no);
    const use = a.use_source === "exact" ? n(a.demand_kwh, "kWh a year") : a.use_source === "band" ? `${BANDS.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} kWh a year`
      : a.use_source === "range" ? `${a.use_range.filter(Boolean).map((x) => x!.toLocaleString("en")).join(" – ")} kWh a year` : a.use_source === "payment" ? `${n(a.monthly_eur, "€ a month")} payment`
      : a.use_source === "people" ? `${BY_PEOPLE.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} people, typical use` : a.use_source === "unknown" ? "Not known" : no;
    const car = a.ev === false ? "No" : a.ev ? (a.ev_planned ? `Coming ${a.ev_when === "soon" ? "within a year" : a.ev_when === "later" ? "later" : "soon"}` : "Yes") : no;
    const groups: [string, Stage, [string, string][]][] = [
      ...(mapped ? [["Your roof", "roof", [["Priority area", `${Math.round(m2)} m²`]]] as [string, Stage, [string, string][]]]
        : [["Your home", "where", [["Address", a.address || no]]], ["Your roof", "roofq", [["Larger side", label(FACING, a.roof_facing)], ...(a.roof_facing === "flat" ? [] : [["Slope", label(SLOPE, a.roof_slope)]]),
          ["Size", a.roof_size === "known" ? n(a.roof_m2, "m²") : label(SIZE, a.roof_size)]]]] as [string, Stage, [string, string][]][]),
      ["Solar already there", "solar", a.has_solar ? [["Solar", "Yes"], ["Makes", label(SOLAR_KIND, a.solar_kind)], ["Marked area", `${Math.round(panelM2)} m²`], ...(a.solar_kind === "thermal" ? [] : [["Size", n(a.solar_kwp, "kWp")], ["Year", a.solar_year ? String(a.solar_year) : no]] as [string, string][])] : [["Solar", yes(a.has_solar)]]],
      ["Home battery", "battery", [["Battery", yes(a.has_storage)], ...(a.has_storage ? [["Size", n(a.battery_kwh, "kWh")] as [string, string]] : [])]],
      ["Electricity", "use", [["Yearly use", use], ["Price", a.price_known ? `${a.price_ct_kwh} ct per kWh` : no], ["Home in the day", label(HOME_DAY, a.home_day)]]],
      ["Big electric users", "big", [["Has", a.big_users.length ? a.big_users.map((v) => label(BIG_USERS, v)).join(", ") : "None"]]],
      ["Your house", "house", [["Built", label(BUILT, a.built)], ["Living area", n(a.living_m2, "m²")], ["Energy certificate", n(a.cert_kwh_m2, "kWh per m²")], ["Owned by", label(OWNER, a.owner)]]],
      ["Heating", "heat", [["Heating", label(HEATING, a.heating)], ...(a.heating === "Heatpump" ? [["Its electricity", n(a.hp_kwh, "kWh a year")] as [string, string]] : []),
        ...(REPLACEABLE.includes(a.heating ?? "") ? [["Heat pump", yes(a.wants_hp, "Interested", "Not interested")], [a.heating === "Oil" ? "Oil" : a.heating === "Electric" ? "Its electricity" : "Gas", a.heating === "Oil" ? n(a.oil_l, "litres a year") : a.heating === "Gas" && a.gas_eur ? `€${Math.round(a.gas_eur).toLocaleString("en")} a year` : n(a.heat_kwh, "kWh a year")], ["Heats through", label(HEAT_DIST, a.heat_dist)], ...(FOSSIL.includes(a.heating ?? "") ? [["Boiler age", label(BOILER_AGE, a.boiler_age)]] : [])] as [string, string][] : [])]],
      ["Electric car", "car", a.ev ? [["Car", car], ["How many", a.ev_count ? String(a.ev_count) : no], ["Charged at home", n(a.ev_kwh_month, "kWh a month")], ["Driving", n(a.ev_km, "km a year")]] : [["Car", car]]],
      ...(a.ev ? [["Charging", "charge", [["Where", a.ev_charge_home === "most" ? "Mostly at home" : a.ev_charge_home === "half" ? "Half and half" : a.ev_charge_home === "little" ? "Mostly elsewhere" : no],
        ["Car home in the day", yes(a.ev_day, "Often", "Rarely")], ["Wallbox", yes(a.has_wallbox, "Already there", "Not yet")]]] as [string, Stage, [string, string][]]] : []),
      ["What matters most", "goal", [["Priority", GOALS.find((x) => x[0] === a.goal)?.[1] ?? no], ["Power in an outage", yes(a.backup, "Wanted", "Not needed")]]],
    ];
    if (!editable) groups.push(["Meter cabinet", "send", [["Photo", a.meter_photo ? "Added" : no]]]);
    const all = groups.flatMap(([, , rows]) => rows);
    return { missing: all.filter(([, v]) => v === no).length, answered: all.filter(([, v]) => v !== no).length, groups, view: <div className="overview">
      {groups.map(([title, to, rows]) => <section key={to}>
        <header><h2>{title}</h2>{editable && <button type="button" className="textlink" onClick={() => { setFromOverview(true); go(to); }}>Change</button>}</header>
        <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v === no ? "none" : undefined}>{v}</dd></div>)}</dl>
      </section>)}
    </div> };
  };

  if (stage === "send") return (
    <aside className="panel tall quiz" key="send" ref={panel}>
      <p className="count">Overview</p>
      <h1>Is everything right?</h1>
      <p className="muted">An installer plans your system from this and sends you an offer. "Not given" is fine: they will ask you.</p>
      {summary(true).view}
      <section className="photo-ask">
        <h2>A photo of your meter cabinet<span className="opt">Optional</span></h2>
        <p className="small muted">Open the cabinet door and take one photo of the whole cabinet. It shows the installer whether the cabinet needs work, often without a visit.</p>
        {a.meter_photo && <img className="photo-preview" src={a.meter_photo} alt="Your meter cabinet" />}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="pair">
          <Button size="lg" wide onClick={() => photoInput.current?.click()}>{a.meter_photo ? "Take another" : "Add a photo"}</Button>
          {a.meter_photo && <Button size="lg" wide onClick={() => setAnswers({ ...a, meter_photo: null })}>Remove</Button>}
        </div>
        {photoFailed && <p className="error small">That file could not be read as a photo.</p>}
      </section>
      <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go("share")}>Choose what to send</Button></div>
    </aside>
  );

  // The last page: what leaves this browser, switched by the homeowner, shown as a list and as the very object that goes.
  if (stage === "share") {
    const out = forInstaller(request, shared), home = buildings.length > 0, roof = request.roof;
    const set = (change: Partial<Shared>) => setShared({ ...shared, ...change });
    const { answered, groups } = summary(true); // the overview's rows that are not "Not given"
    // The answers as they go, without the home and roof rows: SendView words those from what is actually sent.
    const given = groups.filter(([, to]) => !["where", "roofq", "roof", "send"].includes(to)).flatMap(([title, , rows]) => rows.map(([k, v]) => [rows.length === 1 ? title : k, v] as [string, string])).filter(([, v]) => v !== "Not given"); // a lone row is named by its question
    return (
      <aside className="panel tall quiz" key="share" ref={panel}>
        <p className="count">Before sending</p>
        <h1>What goes to the installer</h1>
        <p className="muted">Nothing has left this browser yet. Switch off what you would rather keep.</p>
        <ul className="share-list">
          <li className="share-fixed"><span className="share-mark" aria-hidden="true">✓</span><div><b>Your answers</b><small>{answered} {answered === 1 ? "answer" : "answers"}, as in the overview. Always sent: the offer is built on them.</small></div></li>
          {home && <li><Check checked={shared.home} onChange={(v) => set({ home: v })}><b>Your home</b><small>{buildings[0]?.label ?? "Your building"}, with its building shape. Bavaria publishes every building's shape openly, so the shape shows where the home is: the two only go together.</small></Check></li>}
          {home && shared.home && <li className="share-sub"><Check checked={shared.marked} onChange={(v) => set({ marked: v })}><b>Areas you marked</b><small>{Math.round(m2)} m² of roof you want panels on first.</small></Check></li>}
          {home && !shared.home && roof && <li className="share-sub"><Check checked={shared.roof} onChange={(v) => set({ roof: v })}><b>Roof numbers only</b><small>{roof.m2} m² of roof · {roof.facing === "flat" ? "flat" : `facing ${roof.facing}, ${roof.tilt}° slope`}. Rounded, so they fit thousands of roofs and cannot lead to your address.</small></Check></li>}
          {!home && a.address && <li><Check checked={shared.address} onChange={(v) => set({ address: v })}><b>Your address</b><small>{a.address}. Lets the installer check trees, monument rules and the heat plan, and plan a visit.</small></Check></li>}
          {!home && roof?.told && <li><Check checked={shared.roof} onChange={(v) => set({ roof: v })}><b>Your roof, as you described it</b><small>{roof.m2} m² · {roof.facing === "flat" ? "flat" : roof.facing === "unknown" ? "direction not known" : `larger side facing ${roof.facing}, about ${roof.tilt}°`}. Without it the installer guesses a typical roof.</small></Check></li>}
          {a.meter_photo && <li><Check checked={shared.photo} onChange={(v) => set({ photo: v })}><b>Meter cabinet photo</b><small>The one photo you added.</small></Check></li>}
        </ul>
        {home && (shared.home
          ? <p className="share-note small">With your home, the installer also checks trees that shade the roof, monument rules and the city's heat plan, without asking you.</p>
          : <p className="share-note small">Without your home, the installer plans from your answers{out.roof ? " and the roof numbers" : ""}, and may need to ask more before an offer.</p>)}
        <SendView full={request} out={out} answers={given} markedM2={m2} />
        <div className="stick"><Button size="lg" onClick={() => go("send")}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go("sent")}>Send to an installer</Button></div>
      </aside>
    );
  }

  if (stage === "sent") {
    const { missing, view } = summary(false);
    return (
      <aside className="panel tall quiz" key="sent" ref={panel}>
        <div className="done" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
        <h1>{!progress || stepOf(progress) === 0 ? "Your request is with an installer" : stepOf(progress) === 1 ? "A planner is working on it" : "Your offer is ready"}</h1>
        <p className="muted">Request {refId} · sent {day(progress?.sentAt ?? Date.now())}</p>
        {progress && <Status m={progress} onPanels={onPanels} />}
        {!progress?.offer && <ol className="next-steps">
          {buildings.length > 0 && shared.home
            ? <li><b>They look at your roof and your answers</b><span>On the same 3D model of your home, with its measured sun and shade.</span></li>
            : <li><b>They look at your answers</b><span>{buildings.length > 0 && shared.roof ? "With the roof numbers you sent. Your home stayed with you." : "Your home stayed with you, so they estimate the roof."}</span></li>}
          <li><b>{missing ? `They may ask about ${missing} ${missing === 1 ? "answer" : "answers"} you left open` : "They may call with a question or two"}</b><span>{missing ? "Have your electricity and heating bills at hand." : "You answered everything, so it should be quick."}</span></li>
          <li><b>You get an offer</b><span>Solar, battery and anything else that fits, with what it makes and saves.</span></li>
        </ol>}
        <details className="sent-answers"><summary>What you sent</summary>{view}</details>
        <div className="stick"><Button variant="solid" size="lg" wide onClick={done}>{buildings.length ? "Back to map" : "Done"}</Button></div>
      </aside>
    );
  }

  const fossil = REPLACEABLE.includes(a.heating ?? "");
  return (
    <aside className="panel tall quiz" key={stage} ref={panel} onKeyDown={enter}>
      {stage === "solar" && page("Is there solar here already?", null, yesNo("has_solar", { solar_kind: null, solar_kwp: null, solar_year: null }), a.has_solar && <>
        <h2>What do the panels make?</h2>
        <div className="answers">
          {SOLAR_KIND.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.solar_kind === v} onClick={() => setAnswers({ ...a, solar_kind: v, ...(v === "thermal" ? { solar_kwp: null, solar_year: null } : {}) })}>{label}</Button>)}
        </div>
        <h2>Where are the panels?<span className="opt">Optional</span></h2>
        <p className="small muted">Mark them on the map with <b>Whole surface</b> or <b>Draw</b>. We leave that area out of your new system.</p>
        <p className="marked"><b>{Math.round(panelM2)} m²</b> with panels</p>
        {a.solar_kind !== "thermal" && <><p className="small muted">Size and year help, but you can skip them: we then work from the area you marked.</p>
        <div className="pair">
          <Field label={optional("Size (kWp)")}><Input type="number" min={0} step={0.1} value={a.solar_kwp ?? ""} onChange={(e) => setAnswers({ ...a, solar_kwp: number(e.target.value) })} /></Field>
          <Field label={optional("Year")}><Input type="number" min={1990} max={2026} value={a.solar_year ?? ""} onChange={(e) => setAnswers({ ...a, solar_year: number(e.target.value) })} /></Field>
        </div></>}

      </>)}

      {stage === "battery" && page(a.has_solar && a.solar_kind !== "thermal" ? "Is there a home battery too?" : "Is there a home battery?", null, yesNo("has_storage", { battery_kwh: null }), a.has_storage && <>
        {numberField(optional("How big is it? (kWh)"), a.battery_kwh, (battery_kwh) => setAnswers({ ...a, battery_kwh }))}
      </>)}

      {stage === "use" && <>
        <p className="count">Question {at_ + 1} of {pages.length - 1}</p>
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
        <div className="more">
          <h2>Is someone home during the day on weekdays?<span className="opt">Optional</span></h2>
          <p className="small muted">Power used while the sun shines comes straight from the roof.</p>
          <div className="answers">
            {HOME_DAY.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.home_day === v} onClick={() => setAnswers({ ...a, home_day: a.home_day === v ? null : v })}>{label}</Button>)}
          </div>
        </div>
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
        <h2>Who owns the home?<span className="opt">Optional</span></h2>
        <div className="answers">
          {OWNER.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.owner === v} onClick={() => setAnswers({ ...a, owner: a.owner === v ? null : v })}>{label}</Button>)}
        </div>
      </div>)}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers grid2">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value}
          onClick={() => answer({ heating: value, heat_kwh: null, oil_l: null, hp_kwh: null, wants_hp: null, heat_dist: null, boiler_age: null, gas_eur: null }, !(REPLACEABLE.includes(value) || value === "Heatpump"))}>{label}{a.area?.heating === value && <span className="common">Common here</span>}</Button>)}
        {a.area?.heating && <p className="small muted span2">{a.area.heating === "District" ? "Most homes nearby use district heating" : a.area.heating === "Electric" ? "Most homes nearby heat with electricity" : `"Common here": ${Math.round((a.area.heating_share ?? 0) * 100)}% of homes nearby`}, Census 2022.</p>}
      </div>, a.heating === "Heatpump" ? <>
        {numberField(optional("Its electricity a year (kWh)"), a.hp_kwh, (hp_kwh) => setAnswers({ ...a, hp_kwh }), "From its own meter or bill")}
        <p className="small muted">The new solar can cover it too.</p>
      </> : a.heating === "District" ? <p className="small muted">Your installer checks whether anything else makes sense with it.</p> : fossil && <>
        <h2>Interested in a heat pump instead?</h2>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.wants_hp === true} onClick={() => setAnswers({ ...a, wants_hp: true })}>Yes</Button>
          <Button size="lg" wide aria-pressed={a.wants_hp === false} onClick={() => setAnswers({ ...a, wants_hp: false })}>No</Button>
        </div>
        {a.wants_hp !== null && <>
          <p className="small muted">{a.wants_hp ? "Your yearly use sizes the heat pump." : "We may still show you a heat pump option. Your yearly use sizes it."}</p>
          {a.heating === "Oil"
            ? numberField(optional("Oil a year (litres)"), a.oil_l, (oil_l) => setAnswers({ ...a, oil_l, heat_kwh: oil_l ? oil_l * KWH_PER_LITRE_OIL : null }))
            : a.heating === "Electric"
            ? numberField(optional("Its electricity a year (kWh)"), a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh }), "From its own meter or bill")
            : gasWay === "eur" ? <>
              {numberField(optional("Gas a year (€), all in"), a.gas_eur, (gas_eur) => setAnswers({ ...a, gas_eur, heat_kwh: gas_eur ? Math.round(gas_eur / (GAS_CT / 100) / 100) * 100 : null }))}
              <button type="button" className="textlink lone" onClick={() => { setGasWay("kwh"); setAnswers({ ...a, gas_eur: null, heat_kwh: null }); }}>I know the kWh</button>
            </> : <>
              {numberField(optional("Gas a year (kWh), from your bill"), a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh, gas_eur: null }))}
              <button type="button" className="textlink lone" onClick={() => { setGasWay("eur"); setAnswers({ ...a, heat_kwh: null }); }}>I only know what I pay a year</button>
            </>}
          {FOSSIL.includes(a.heating ?? "") && <>
            <h2>How old is the boiler?<span className="opt">Optional</span></h2>
            <p className="small muted">The year is on its type plate. It can change the grants.</p>
            <div className="answers">
              {BOILER_AGE.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.boiler_age === v} onClick={() => setAnswers({ ...a, boiler_age: a.boiler_age === v ? null : v })}>{label}</Button>)}
            </div>
          </>}
          <h2>How is the heat spread in the rooms?<span className="opt">Optional</span></h2>
          <p className="small muted">A heat pump works best with underfloor heating or large radiators.</p>
          <div className="answers">
            {HEAT_DIST.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.heat_dist === v} onClick={() => setAnswers({ ...a, heat_dist: a.heat_dist === v ? null : v })}>{label}</Button>)}
          </div>
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

      {stage === "where" && page("Where is your home?", "Optional. Your installer needs it for a visit. Nothing looks it up: it stays as text in this browser, and before sending you can still leave it out.",
        <div className="answers"><Field label={optional("Address")}><Input autoComplete="street-address" placeholder="Street and number, postcode" value={a.address ?? ""} onChange={(e) => setAnswers({ ...a, address: e.target.value || null })} /></Field></div>)}
      {stage === "roofq" && page("Tell us about your roof", "Rough answers are fine. They stand in for what the map would measure.", <>
        <h2 className="ask">Which way does the larger side face?</h2>
        <div className="answers grid2">{FACING.map(([v, l]) => <Button key={v} size="lg" wide aria-pressed={a.roof_facing === v} onClick={() => setAnswers({ ...a, roof_facing: v })}>{l}</Button>)}</div>
        {a.roof_facing && a.roof_facing !== "flat" && <><h2 className="ask gap">How steep is it?</h2>
          <div className="answers">{SLOPE.map(([v, l, line]) => <Button key={v} size="lg" wide className={line ? "choice" : undefined} aria-pressed={a.roof_slope === v} onClick={() => setAnswers({ ...a, roof_slope: v })}>{line ? <><b>{l}</b><small>{line}</small></> : l}</Button>)}</div></>}
        <h2 className="ask gap">How big is the house?</h2>
        <div className="answers">{SIZE.map(([v, l, line]) => <Button key={v} size="lg" wide className={line ? "choice" : undefined} aria-pressed={a.roof_size === v} onClick={() => setAnswers({ ...a, roof_size: v })}>{line ? <><b>{l}</b><small>{line}</small></> : l}</Button>)}
          {a.roof_size === "known" && <Field label="Roof area, all sides together"><Input type="number" min={10} placeholder="m²" value={a.roof_m2 ?? ""} onChange={(e) => setAnswers({ ...a, roof_m2: number(e.target.value) })} /></Field>}</div>
      </>)}
      {stage === "goal" && page("What matters most to you?", "We size the system with this in mind.", <div className="answers">
        {GOALS.map(([v, label, line]) => <Button key={v} size="lg" wide className="choice" aria-pressed={a.goal === v} onClick={() => setAnswers({ ...a, goal: v })}><b>{label}</b><small>{line}</small></Button>)}
      </div>, <>
        <h2>Power during an outage?<span className="opt">Optional</span></h2>
        <p className="small muted">Some systems keep the house running when the grid is down.</p>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.backup === true} onClick={() => setAnswers({ ...a, backup: a.backup === true ? null : true })}>I want that</Button>
          <Button size="lg" wide aria-pressed={a.backup === false} onClick={() => setAnswers({ ...a, backup: a.backup === false ? null : false })}>Not needed</Button>
        </div>
      </>)}
    </aside>
  );
}

/** What the system is, in ranges, with the reason. No share or saving until those numbers are checked. */
