import { useEffect, useRef, useState } from "react";
import { Answers, GAS_CT, PRICE_CT, Selected, modelM2, shrinkPhoto } from "./api";
import { Face } from "./HomeMap";
import { Handoff, Mine } from "./plan";
import { Shared, forInstaller, m2Words } from "./share";
import SendView from "./SendView";
import { Ctx, Known, factsFor } from "./Known";
import { Status, day, stepOf } from "./Requests";
import { Button, Check, Field, Input, Segmented } from "./ui";
import { Info, Layers, Lock, Pencil, Skip, Spark } from "./icons";

import { BANDS, BIG_USERS, BOILER_AGE, BUILT, BY_PEOPLE, FACING, FOSSIL, GOALS, HEAT_DIST, HEATING, HOME_DAY, KWH_PER_LITRE_OIL, OWNER, REPLACEABLE, SIZE, SLOPE, SOLAR_KIND, SPAN, TYPICAL_KM, clean, number } from "./questions";
export type Stage = "intro" | "where" | "roofq" | "roof" | "solar" | "battery" | "use" | "big" | "house" | "heat" | "car" | "goal" | "send" | "share" | "sent";
/** One topic a page. A follow-up opens on the same page, under the answer that needs it, so the count never changes. */
// Every household sees the same pages, so the count never moves. A battery without solar is rare, but one tap answers it.
// How the car charges opens on the car page, under the answer that needs it.
const PAGES: Stage[] = ["roof", "solar", "battery", "use", "big", "house", "heat", "car", "goal", "send"];
// Without a home on the map there is no roof to mark: questions only start with where the home is and its roof, in words.
export const pagesFor = (mapped: boolean): Stage[] => (mapped ? PAGES : ["where", "roofq", ...PAGES.filter((p) => p !== "roof")]); // without the map the home is told in words
const flowFor = (_a: Answers, mapped = true): Stage[] => pagesFor(mapped);

type Props = {
  stage: Stage; setStage: (s: Stage) => void; answers: Answers; setAnswers: (a: Answers) => void; refId: string; progress?: Mine; done: () => void; onPanels?: (p: Record<string, number> | null) => void;
  buildings: Selected[]; setFace: (f: Face | null) => void; m2: number; panelM2: number; reset: () => void; back: () => void; changed: boolean; retrySun: () => void;
  request: Handoff; shared: Shared; setShared: (s: Shared) => void;
};

export default function Review({ refId, progress, done, onPanels, stage, setStage, answers: a, setAnswers, buildings, setFace, m2, panelM2, reset, back, changed, retrySun, request, shared, setShared }: Props) {
  const all = buildings.flatMap((b) => b.sun?.surfaces ?? []);
  const ca = clean(a); // the answers as they count and go: a number outside its span is left out
  const loading = buildings.some((b) => b.sun === undefined), failed = buildings.some((b) => b.sun === null);

  const mapped = buildings.length > 0, pages = pagesFor(mapped);
  const ctx: Ctx = { mapped, roofs: all.filter((s) => s.kind === "roof"), m2, drawn: changed, panelM2, modelM2: modelM2(buildings) };
  /** What this page knows, what stands in for an answer left open, and what the installer does with it later. */
  const known = (s: Stage = stage) => <Known facts={factsFor(s, ca, ctx)} />;
  const shown = flowFor(a, mapped), at_ = Math.max(0, shown.indexOf(stage)), total = shown.length - 1;
  // The electricity page shows one way of answering at a time: the number, a range, and as a last resort the household size.
  const [way, setWay] = useState<"exact" | "range" | "people" | "payment">(a.use_source === "band" || a.use_source === "range" ? "range" : a.use_source === "people" || a.use_source === "unknown" ? "people" : a.use_source === "payment" ? "payment" : "exact");
  // Gas can be given in kWh or as what is paid a year; the euros are turned into kWh at Munich's all-in gas price.
  const [gasWay, setGasWay] = useState<"kwh" | "eur">(a.gas_eur ? "eur" : "kwh");
  // The price is a field of its own; left empty, the placeholder says what stands in.
  const priceField = () => numberField("Price per kWh (cents)", a.price_known ? a.price_ct_kwh : null, (v) => setAnswers({ ...a, price_ct_kwh: v ?? PRICE_CT, price_known: v != null }), `${PRICE_CT} if you skip, Munich's basic supply`, SPAN.price_ct_kwh);
  /** Switching how to answer drops what was given the other way: moving off "Bill" means the number typed before is not sent. */
  const switchWay = (to: typeof way) => {
    setWay(to);
    const kept = to === "range" ? ["band", "range"] : to === "people" ? ["people", "unknown"] : [to];
    if (a.use_source && !kept.includes(a.use_source)) setAnswers({ ...a, use_source: null, demand_kwh: null, monthly_eur: null, use_range: [null, null] });
  };
  const go = (next: Stage) => {
    setFace(null);
    setStage(next);
  };
  const flow = flowFor(a, mapped), here = Math.max(0, flow.indexOf(stage));
  // Changing an answer from the overview brings you straight back to it.
  const [fromOverview, setFromOverview] = useState(false);
  const next = () => go(fromOverview ? "send" : flow[here + 1]);
  const nextLabel = fromOverview ? "Go to overview" : "Next";
  const previous = () => (fromOverview ? go("send") : here ? go(flow[here - 1]) : go("intro"));
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
    <p className="count">Question {at_ + 1} of {total}</p>
    <h1>{title}</h1>
    {line && <p className="muted">{line}</p>}
    {body}
    {more && <div className="more">{more}</div>}
    {known()}
    <div className="stick"><Button size="lg" onClick={previous}>Back</Button><Button variant="solid" size="lg" wide onClick={next}>{nextLabel}</Button></div>
  </>;
  /** Every field may be left empty: the first page says so once, so no field is marked on its own. */
  const optional = (label: string) => <>{label}</>;
  /** A number with the span it can sensibly have. Outside it the field says so, and the request leaves it out (plan.ts). */
  const numberField = (label: React.ReactNode, value: number | null, set: (v: number | null) => void, placeholder?: string, span: readonly [number, number] = [0, 1e6]) =>
    <Field label={label}><Input type="number" min={span[0]} max={span[1]} placeholder={placeholder} value={value ?? ""} onChange={(e) => set(number(e.target.value))} />{warn(value, span)}</Field>;
  const warn = (value: number | null, span: readonly [number, number]) => value != null && (value < span[0] || value > span[1]) &&
    <span className="error small">{value < span[0] ? "That looks too low" : "That looks too high"}, so we leave it out. Between {span[0].toLocaleString("en")} and {span[1].toLocaleString("en")} works.</span>;

  // Before the first question: what answers are for, said once and short. Not counted as a question.
  if (stage === "intro") return (
    <aside className="panel tall quiz" key="intro" ref={panel}>
      <p className="count">Before we start</p>
      <h1>More answers, <span className="hl">better offer</span></h1>
      <ul className="intro">
        {([["var(--hud-live)", Skip, "All optional", "Skip what you don't know"],
          ["var(--hud-route)", Spark, mapped ? "Your home fills gaps" : "We fill gaps", mapped ? "Roof, sun and shade from the map" : "A fair guess for what's left open"],
          ["#B58CFF", Info, "Every answer explained", "What it's for, right under it"],
          ["var(--hud-sun)", Lock, "You decide what's sent", "Nothing leaves before you send"]] as const).map(([c, Icon, title, line]) =>
          <li key={title} style={{ "--c": c } as React.CSSProperties}><i><Icon size={18} /></i><div><b>{title}</b><span>{line}</span></div></li>)}
      </ul>
      <div className="stick"><Button size="lg" onClick={back}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go(pages[0])}>Start</Button></div>
    </aside>
  );

  if (stage === "roof") return (
    <aside className="panel tall quiz" key="roof" ref={panel}>
      <p className="count">Question 1 of {total}</p>
      <h1>Where would you like panels?</h1>
      <p className="muted">Optional. We find the best layout either way; parts you mark go first.</p>
      {loading && <p className="muted">Loading your roof…</p>}
      {failed && <p className="error small">We could not load a building. <button type="button" className="again" onClick={retrySun}>Try again</button></p>}
      {!loading && !failed && all.length === 0 && <p className="error small">No surface is big enough here. Go back and pick another building.</p>}
      {!loading && all.length > 0 && <>
        <p className="marked"><b>{Math.round(m2)} m²</b> marked</p>
        <ul className="howto">
          <li style={{ "--c": "var(--hud-route)" } as React.CSSProperties}><i><Layers /></i><div><b>Whole surface</b><span>Drag across roof sides</span></div></li>
          <li style={{ "--c": "var(--hud-sun)" } as React.CSSProperties}><i><Pencil /></i><div><b>Draw</b><span>Click around a part. Over a marked part it takes it out</span></div></li>
        </ul>
        {changed && <button type="button" className="textlink" onClick={reset}>Start over</button>}
      </>}
      {!loading && known()}
      <div className="stick"><Button size="lg" onClick={() => go("intro")}>Back</Button><Button variant="solid" size="lg" wide disabled={loading} onClick={next}>{nextLabel}</Button></div>
      <p className="source small muted">3D model: Bayerische Vermessungsverwaltung.</p>
    </aside>
  );

  /** Everything the homeowner told us, grouped as the questions were. On the overview each group can be changed; after sending it is read only. */
  const summary = (editable: boolean) => {
    // Everything the homeowner told us, grouped as the questions were, each group with a way back to change it.
    const a = ca;
    const no = "Not given", WHOLE = "Whole roof, nothing marked", NONE = "None picked", n = (v: number | null | undefined, unit: string) => (v ? `${Math.round(v).toLocaleString("en")} ${unit}` : no);
    const label = <T extends readonly (readonly string[])[]>(list: T, v: string | null | undefined) => list.find((x) => x[0] === v)?.[1] ?? no;
    const yes = (v: boolean | null | undefined, y = "Yes", nn = "No") => (v === true ? y : v === false ? nn : no);
    const use = a.use_source === "exact" ? n(a.demand_kwh, "kWh a year") : a.use_source === "band" ? `${BANDS.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} kWh a year`
      : a.use_source === "range" ? `${(a.use_range.filter(Boolean) as number[]).sort((x, y) => x - y).map((x) => x.toLocaleString("en")).join(" – ")} kWh a year` : a.use_source === "payment" ? `${n(a.monthly_eur, "€ a month")} payment`
      : a.use_source === "people" ? `${BY_PEOPLE.find((x) => x[1] === a.demand_kwh)?.[0] ?? ""} people, typical use` : a.use_source === "unknown" ? "Not known" : no;
    const car = a.ev === false ? "No" : a.ev ? (a.ev_planned ? (a.ev_when === "soon" ? "Coming within a year" : a.ev_when === "later" ? "Coming later" : "Planned") : "Yes") : no;
    const groups: [string, Stage, [string, string][]][] = [
      ...(mapped ? [["Your roof", "roof", [["Priority area", changed ? `${Math.round(m2)} m²` : WHOLE]]] as [string, Stage, [string, string][]]]
        : [["Your home", "where", [["Address", a.address || no]]], ["Your roof", "roofq", [["Larger side", label(FACING, a.roof_facing)], ...(a.roof_facing === "flat" ? [] : [["Slope", label(SLOPE, a.roof_slope)]]),
          ["Size", a.roof_size === "known" ? n(a.roof_m2, "m²") : label(SIZE, a.roof_size)]]]] as [string, Stage, [string, string][]][]),
      ["Solar already there", "solar", a.has_solar ? [["Solar", "Yes"], ["Solar makes", label(SOLAR_KIND, a.solar_kind)], ...(mapped ? [["Area with old panels", panelM2 > 0 ? `${Math.round(panelM2)} m²` : no]] as [string, string][] : []), ...(a.solar_kind === "thermal" ? [] : [["Solar size", a.solar_kwp ? `${a.solar_kwp} kWp` : no], ["Year installed", a.solar_year ? String(a.solar_year) : no]] as [string, string][])] : [["Solar", yes(a.has_solar)]]],
      ["Home battery", "battery", [["Battery", yes(a.has_storage)], ...(a.has_storage ? [["Battery size", a.battery_kwh ? `${a.battery_kwh} kWh` : no] as [string, string]] : [])]],
      ["Electricity", "use", [["Yearly use", use], ["Price", a.price_known ? `${a.price_ct_kwh} ct per kWh` : no], ["Home in the day", label(HOME_DAY, a.home_day)]]],
      ["Big electric users", "big", [["Has", a.big_users.length ? a.big_users.map((v) => label(BIG_USERS, v)).join(", ") : NONE]]],
      ["Your house", "house", [["Built", label(BUILT, a.built)], ["Living area", n(a.living_m2, "m²")], ["Owned by", label(OWNER, a.owner)]]],
      ["Heating", "heat", [["Heating", label(HEATING, a.heating)], ...(a.heating === "Heatpump" ? [["Heat pump's electricity", n(a.hp_kwh, "kWh a year")] as [string, string]] : []),
        ...(REPLACEABLE.includes(a.heating ?? "") ? [["Heat pump", yes(a.wants_hp, "Interested", "Not interested")], ...(a.heating === "Electric" ? [["Meter", a.electric_heat_meter === "own" ? "Its own" : a.electric_heat_meter === "house" ? "Same as the house" : no]] as [string, string][] : []), [a.heating === "Oil" ? "Oil a year" : a.heating === "Electric" ? "Heating electricity" : "Gas a year", a.heating === "Oil" ? n(a.oil_l, "litres a year") : a.heating === "Gas" && a.gas_eur ? `€${Math.round(a.gas_eur).toLocaleString("en")} a year` : n(a.heat_kwh, "kWh a year")], ...(a.cert_kwh_m2 ? [["Energy certificate", n(a.cert_kwh_m2, "kWh per m²")]] as [string, string][] : []), ["Heats through", label(HEAT_DIST, a.heat_dist)], ...(FOSSIL.includes(a.heating ?? "") ? [["Boiler age", label(BOILER_AGE, a.boiler_age)]] : [])] as [string, string][] : [])]],
      ["Electric car", "car", a.ev ? [["Car", car], ["How many", a.ev_count ? (a.ev_count >= 3 ? "3 or more" : String(a.ev_count)) : no], ...(a.ev_planned ? [] : [["Charged at home a month", n(a.ev_kwh_month, "kWh")]] as [string, string][]), ["Driving", n(a.ev_km, "km a year")]] : [["Car", car]]],
      ...(a.ev ? [["Charging", "car", [["Where", a.ev_charge_home === "most" ? "Mostly at home" : a.ev_charge_home === "half" ? "Half and half" : a.ev_charge_home === "little" ? "Mostly elsewhere" : no],
        ["Car home in the day", yes(a.ev_day, "Often", "Rarely")], ["Wallbox", yes(a.has_wallbox, "Already there", "Not yet")]]] as [string, Stage, [string, string][]]] : []),
      ["What matters most", "goal", [["Priority", GOALS.find((x) => x[0] === a.goal)?.[1] ?? no], ["Power in an outage", yes(a.backup, "Wanted", "Not needed")]]],
    ];
    if (!editable) groups.push(["Meter cabinet", "send", [["Photo", a.meter_photo ? "Added" : no]]]);
    // Rows that are not answers count neither way: the whole roof when nothing is marked, no big user picked.
    const all = groups.flatMap(([, , rows]) => rows).filter(([, v]) => v !== WHOLE && v !== NONE);
    return { missing: all.filter(([, v]) => v === no || v === "Not known").length, answered: all.filter(([, v]) => v !== no && v !== "Not known").length, groups, view: <div className="overview">
      {groups.map(([title, to, rows]) => <section key={title}>
        <header><h2>{title}</h2>{editable && <button type="button" className="textlink" onClick={() => { setFromOverview(true); go(to); }}>Change</button>}</header>
        <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v === no ? "none" : undefined}>{v}</dd></div>)}</dl>
        {editable && to !== "send" && title !== "Charging" && (() => { const open = factsFor(to, ca, ctx).assumed; return open.length > 0 && <ul className="assumed">{open.map((l, i) => <li key={i}>{l.t}</li>)}</ul>; })()}
      </section>)}
    </div> };
  };

  if (stage === "send") return (
    <aside className="panel tall quiz" key="send" ref={panel}>
      <p className="count">Overview</p>
      <h1>Is everything right?</h1>
      <p className="muted">An installer plans your system from this and sends you an offer. Anything left open is fine: what we assume is under each part.</p>
      {(() => {
        // The whole request in three numbers: the answers given (the same count the sending page shows), what maps and the census
        // found without asking, and what stands in for an answer left open. Arithmetic on an answer is not counted again.
        const all = flow.filter((x) => x !== "send").map((x) => factsFor(x, ca, ctx));
        const said = summary(true).answered;
        const isFound = (l: { from?: string }) => l.from === "3D model" || l.from === "Census 2022";
        const found = all.reduce((n, f) => n + [...f.known, ...f.assumed].filter(isFound).length, 0);
        const open = all.reduce((n, f) => n + f.assumed.filter((l) => !isFound(l)).length, 0);
        return <div className="tally" role="group" aria-label="Your request so far">
          <div className="is-known"><b>{said}</b><span>from you</span></div>
          {found > 0 && <div className="is-found"><b>{found}</b><span>found for you</span></div>}
          <div className="is-assumed"><b>{open}</b><span>assumed for now</span></div>
        </div>;
      })()}
      <section className="photo-ask">
        <h2>A photo of your meter cabinet</h2>
        <p className="small muted">One photo of the open cabinet shows whether it needs work.</p>
        {a.meter_photo && <img className="photo-preview" src={a.meter_photo} alt="Your meter cabinet" />}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="pair">
          <Button size="lg" wide onClick={() => photoInput.current?.click()}>{a.meter_photo ? "Take another" : "Add a photo"}</Button>
          {a.meter_photo && <Button size="lg" wide onClick={() => setAnswers({ ...a, meter_photo: null })}>Remove</Button>}
        </div>
        {photoFailed && <p className="error small">That file could not be read as a photo.</p>}
        {known("send")}
      </section>
      {summary(true).view}
      <div className="stick"><Button size="lg" onClick={() => { setFromOverview(false); go(flow[flow.indexOf("send") - 1]); }}>Back</Button><Button variant="solid" size="lg" wide onClick={() => go("share")}>Choose what to send</Button></div>
    </aside>
  );

  // The last page: what leaves this browser, switched by the homeowner, shown as a list and as the very object that goes.
  if (stage === "share") {
    const out = forInstaller(request, shared), home = buildings.length > 0, roof = request.roof;
    const set = (change: Partial<Shared>) => setShared({ ...shared, ...change });
    const { answered, groups } = summary(true); // the overview's rows that are not "Not given"
    // The answers as they go, without the home and roof rows: SendView words those from what is actually sent.
    const given = groups.filter(([, to]) => !["where", "roofq", "roof", "send"].includes(to)).flatMap(([title, , rows]) => rows.map(([k, v]) => [rows.length === 1 ? title : k, v] as [string, string])).filter(([, v]) => v !== "Not given" && v !== "None picked" && v !== "Whole roof, nothing marked"); // a lone row is named by its question
    return (
      <aside className="panel tall quiz" key="share" ref={panel}>
        <p className="count">Before sending</p>
        <h1>What goes to us and your installer</h1>
        <p className="muted">None of your answers has left this browser yet. Switch off what you would rather keep.</p>
        <ul className="share-list">
          <li className="share-fixed"><span className="share-mark" aria-hidden="true">✓</span><div><b>Your answers</b><small>{answered} {answered === 1 ? "answer" : "answers"}, as in the overview. Always sent: the offer is built on them.</small></div></li>
          {home && <li><Check checked={shared.home} onChange={(v) => set({ home: v })}><b>Your home</b><small>{buildings[0]?.label ?? "Your building"}, with its building shape. Bavaria publishes every building's shape openly, so the shape shows where the home is: the two only go together.</small></Check></li>}
          {home && shared.home && <li className="share-sub"><Check checked={shared.marked} onChange={(v) => set({ marked: v })}><b>Areas you marked</b><small>{request.choice && Object.keys(request.choice.cells).length ? `${Math.round(m2)} m² of roof you want panels on first.` : `Nothing marked, so the whole roof counts (${Math.round(m2)} m²).`}</small></Check></li>}
          {home && !shared.home && roof && <li className="share-sub"><Check checked={shared.roof} onChange={(v) => set({ roof: v })}><b>Roof numbers only</b><small>{m2Words(roof.m2)} of roof · {roof.facing === "flat" ? "flat" : `facing ${roof.facing}, ${roof.tilt}° slope`}. Rounded, so they fit many roofs and do not lead to your address.</small></Check></li>}
          {!home && a.address && <li><Check checked={shared.address} onChange={(v) => set({ address: v })}><b>Your address</b><small>{a.address}. After you send, the installer looks it up to check monument rules and the heat plan, and to plan a visit.</small></Check></li>}
          {!home && roof?.told && <li><Check checked={shared.roof} onChange={(v) => set({ roof: v })}><b>Your roof, as you described it</b><small>{m2Words(roof.m2)} · {roof.facing === "flat" ? "flat" : roof.facing === "unknown" ? "direction not known" : `larger side facing ${roof.facing}, about ${roof.tilt}°`}. Without it the installer guesses a typical roof.</small></Check></li>}
          {a.meter_photo && <li><Check checked={shared.photo} onChange={(v) => set({ photo: v })}><b>Meter cabinet photo</b><small>The one photo you added.</small></Check></li>}
        </ul>
        {home && (shared.home
          ? <p className="share-note small">With your home, the installer also checks trees that shade the roof, monument rules and the city's heat plan, without asking you.</p>
          : <p className="share-note small">Without your home, the installer plans from your answers{out.roof ? " and the roof numbers" : ""}, and may need to ask more before an offer.</p>)}
        {given.length === 0 && !home && !a.address && !roof && <p className="share-note small">You left every question open. The installer gets only your request number and plans from typical values, so expect a call with a few questions.</p>}
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
            : <li><b>They look at your answers</b><span>{buildings.length > 0 ? (shared.roof && request.roof ? "With the roof numbers you sent. Your home stayed with you." : "Your home stayed with you, so they estimate the roof.") : shared.roof && request.roof ? "With your roof as you described it." : "No roof was sent, so they estimate it."}</span></li>}
          <li><b>{missing ? `${missing} ${missing === 1 ? "answer" : "answers"} left open: we assumed ${missing === 1 ? "it" : "them"}` : "You answered everything"}</b><span>{missing ? "Your offer is built on what we assumed, as shown in what you sent." : "Your offer is built on your own answers."}</span></li>
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
        {mapped && <><h2>Where are they?</h2>
        <p className="small muted">Mark them on the map, or skip: we find them on the aerial photo.</p>
        {panelM2 > 0 && <p className="marked"><b>{Math.round(panelM2)} m²</b> with panels</p>}</>}
        {a.solar_kind !== "thermal" && <div className="pair">
          <Field label={optional("Size (kWp, peak power)")}><Input type="number" min={0} max={100} step={0.1} value={a.solar_kwp ?? ""} onChange={(e) => setAnswers({ ...a, solar_kwp: number(e.target.value) })} />{warn(a.solar_kwp, SPAN.solar_kwp)}</Field>
          <Field label={optional("Year installed")}><Input type="number" min={1990} max={new Date().getFullYear()} value={a.solar_year ?? ""} onChange={(e) => setAnswers({ ...a, solar_year: number(e.target.value) })} />{warn(a.solar_year, SPAN.solar_year)}</Field>
        </div>}

      </>)}

      {stage === "battery" && page(a.has_solar && a.solar_kind !== "thermal" ? "Is there a home battery too?" : "Is there a home battery?", null, yesNo("has_storage", { battery_kwh: null }), a.has_storage && <>
        {numberField(optional("How big is it? (kWh)"), a.battery_kwh, (battery_kwh) => setAnswers({ ...a, battery_kwh }), undefined, SPAN.battery_kwh)}
      </>)}

      {stage === "use" && <>
        <p className="count">Question {at_ + 1} of {total}</p>
        <h1>How much electricity do you use a year?</h1>
        <div className="ways"><Segmented wide label="How you know it" value={way} onChange={switchWay}
          options={[{ value: "exact", label: "Bill" }, { value: "payment", label: "Monthly" }, { value: "range", label: "Range" }, { value: "people", label: "People" }]} /></div>
        {way === "exact" && <>
          <p className="muted">It is on your yearly bill.</p>
          <div className="answers">
            <Field label="kWh a year"><Input type="number" min={0} placeholder="e.g. 4,200" value={a.use_source === "exact" ? a.demand_kwh ?? "" : ""}
              onChange={(e) => setAnswers({ ...a, demand_kwh: number(e.target.value), use_source: e.target.value ? "exact" : null })} />{a.use_source === "exact" && warn(a.demand_kwh, SPAN.demand_kwh)}</Field>
            {priceField()}
          </div>
        </>}
        {way === "payment" && <>
          <p className="muted">What you pay each month. We work out the use from it.</p>
          <div className="answers">
            {numberField("Monthly payment (€)", a.monthly_eur, (monthly_eur) => setAnswers({ ...a, monthly_eur, use_source: monthly_eur ? "payment" : null, demand_kwh: null }), undefined, SPAN.monthly_eur)}
            {priceField()}
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
            }} />{warn(a.use_range[k], SPAN.use_range)}</Field>)}
          </div></div>}
        </>}
        {way === "people" && <>
          <p className="muted">How many people live here? We start from a typical home of that size.</p>
          <div className="answers people">{BY_PEOPLE.map(([label, kwh]) => <Button key={label} size="lg" wide aria-pressed={a.use_source === "people" && a.demand_kwh === kwh} onClick={() => answer({ demand_kwh: kwh, use_source: "people", use_range: [null, null] })}>{label}</Button>)}</div>
        </>}
        <div className="more">
          <h2>Is someone home during the day on weekdays?</h2>
          <p className="small muted">Power used while the sun shines comes straight from the roof.</p>
          <div className="answers">
            {HOME_DAY.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.home_day === v} onClick={() => setAnswers({ ...a, home_day: a.home_day === v ? null : v })}>{label}</Button>)}
          </div>
        </div>
        {known()}
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
        {numberField(optional("Living area (m²)"), a.living_m2, (living_m2) => setAnswers({ ...a, living_m2 }), modelM2(buildings) ? `About ${modelM2(buildings)} from the 3D model` : undefined, SPAN.living_m2)}
        <h2>Who owns the home?</h2>
        <div className="answers">
          {OWNER.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.owner === v} onClick={() => setAnswers({ ...a, owner: a.owner === v ? null : v })}>{label}</Button>)}
        </div>
      </div>)}

      {stage === "heat" && page("How do you heat your home?", null, <div className="answers grid2">
        {HEATING.map(([value, label]) => <Button key={value} size="lg" wide aria-pressed={a.heating === value}
          onClick={() => answer({ heating: value, heat_kwh: null, oil_l: null, hp_kwh: null, wants_hp: null, heat_dist: null, boiler_age: null, gas_eur: null, electric_heat_meter: null }, !(REPLACEABLE.includes(value) || value === "Heatpump"))}>{label}{a.area?.heating === value && <span className="common">Common here</span>}</Button>)}
        {a.area?.heating && <p className="small muted span2">{a.area.heating === "District" ? "Most homes nearby use district heating" : a.area.heating === "Electric" ? "Most homes nearby heat with electricity" : `"Common here": ${Math.round((a.area.heating_share ?? 0) * 100)}% of homes nearby`}, Census 2022.</p>}
      </div>, a.heating === "Heatpump" ? <>
        {numberField(optional("Its electricity a year (kWh)"), a.hp_kwh, (hp_kwh) => setAnswers({ ...a, hp_kwh }), "From its own meter or bill", SPAN.hp_kwh)}
        <p className="small muted">The new solar can cover it too.</p>
      </> : a.heating === "District" ? <p className="small muted">No heat pump with district heating; solar and a battery still fit.</p> : fossil && <>
        <h2>Interested in a heat pump instead?</h2>
        <div className="pair">
          <Button size="lg" wide aria-pressed={a.wants_hp === true} onClick={() => setAnswers({ ...a, wants_hp: true })}>Yes</Button>
          <Button size="lg" wide aria-pressed={a.wants_hp === false} onClick={() => setAnswers({ ...a, wants_hp: false })}>No</Button>
        </div>
        <>
          <p className="small muted">{a.wants_hp === false ? "Optional: it only matters if you change your mind about a heat pump." : `Your ${a.heating === "Oil" ? "oil" : a.heating === "Electric" ? "heating electricity" : "gas"} a year sizes a heat pump.`}</p>
          {a.heating === "Oil"
            ? numberField(optional("Oil a year (litres)"), a.oil_l, (oil_l) => setAnswers({ ...a, oil_l, heat_kwh: oil_l ? oil_l * KWH_PER_LITRE_OIL : null }), undefined, SPAN.oil_l)
            : a.heating === "Electric"
            ? <>
              <h2>Does it have its own meter?</h2>
              <p className="small muted">Night-storage heating often does. Then its power is not in your household use.</p>
              <div className="pair">
                <Button size="lg" wide aria-pressed={a.electric_heat_meter === "own"} onClick={() => setAnswers({ ...a, electric_heat_meter: a.electric_heat_meter === "own" ? null : "own" })}>Its own meter</Button>
                <Button size="lg" wide aria-pressed={a.electric_heat_meter === "house"} onClick={() => setAnswers({ ...a, electric_heat_meter: a.electric_heat_meter === "house" ? null : "house" })}>Same as the house</Button>
              </div>
              {numberField(optional("Its electricity a year (kWh)"), a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh }), "From its own meter or bill", SPAN.heat_kwh)}
            </>
            : <>
              <Segmented wide label="How you know your gas" value={gasWay} onChange={(w) => { setGasWay(w); setAnswers({ ...a, gas_eur: null, heat_kwh: null }); }}
                options={[{ value: "kwh", label: "kWh from the bill" }, { value: "eur", label: "What I pay" }]} />
              {gasWay === "eur"
                ? numberField(optional("Gas a year (€), all in"), a.gas_eur, (gas_eur) => setAnswers({ ...a, gas_eur, heat_kwh: gas_eur ? Math.round(gas_eur / (GAS_CT / 100) / 100) * 100 : null }), undefined, SPAN.gas_eur)
                : numberField(optional("Gas a year (kWh)"), a.heat_kwh, (heat_kwh) => setAnswers({ ...a, heat_kwh, gas_eur: null }), undefined, SPAN.heat_kwh)}
            </>}
          {a.wants_hp !== false && !a.heat_kwh && a.heating !== "Electric" && numberField(optional("Or, from an energy certificate (kWh per m² a year)"), a.cert_kwh_m2, (cert_kwh_m2) => setAnswers({ ...a, cert_kwh_m2 }), "If you have one", SPAN.cert_kwh_m2)}
          {FOSSIL.includes(a.heating ?? "") && <>
            <h2>How old is the boiler?</h2>
            <p className="small muted">The year is on its type plate. An old boiler puts a heat pump first{a.heating === "Gas" ? ", and for gas it can decide a grant bonus" : ""}.</p>
            <div className="answers">
              {BOILER_AGE.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.boiler_age === v} onClick={() => setAnswers({ ...a, boiler_age: a.boiler_age === v ? null : v })}>{label}</Button>)}
            </div>
          </>}
          <h2>How is the heat spread in the rooms?</h2>
          <p className="small muted">A heat pump works best with underfloor heating or large radiators.</p>
          <div className="answers">
            {HEAT_DIST.map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.heat_dist === v} onClick={() => setAnswers({ ...a, heat_dist: a.heat_dist === v ? null : v })}>{label}</Button>)}
          </div>
        </>
      </>)}

      {stage === "car" && page("Do you drive an electric car?", null, <div className="answers">
        <Button size="lg" wide aria-pressed={a.ev === true && !a.ev_planned} onClick={() => answer({ ev: true, ev_planned: false, ev_when: null })}>Yes</Button>
        <Button size="lg" wide aria-pressed={a.ev === true && a.ev_planned} onClick={() => answer({ ev: true, ev_planned: true, ev_kwh_month: null, has_wallbox: null })}>Not yet, but planned</Button>
        <Button size="lg" wide aria-pressed={a.ev === false} onClick={() => answer({ ev: false, ev_planned: false, ev_km: null, ev_count: null, ev_kwh_month: null, ev_when: null, ev_charge_home: null, ev_day: null, has_wallbox: null })}>No</Button>
      </div>, a.ev && <>
        {a.ev_planned && <>
          <h2>When?</h2>
          <div className="pair">
            <Button size="lg" wide aria-pressed={a.ev_when === "soon"} onClick={() => setAnswers({ ...a, ev_when: "soon" })}>Within a year</Button>
            <Button size="lg" wide aria-pressed={a.ev_when === "later"} onClick={() => setAnswers({ ...a, ev_when: "later" })}>Later</Button>
          </div>
        </>}
        <h2>How many?</h2>
        <div className="answers">
          {([[1, "One"], [2, "Two"], [3, "Three or more"]] as const).map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.ev_count === v} onClick={() => setAnswers({ ...a, ev_count: a.ev_count === v ? null : v })}>{label}</Button>)}
        </div>
        {!a.ev_planned && numberField(optional("Charged at home a month (kWh)"), a.ev_kwh_month, (ev_kwh_month) => setAnswers({ ...a, ev_kwh_month }), "From your wallbox or car app", SPAN.ev_kwh_month)}
        {numberField(optional(a.ev_planned ? "Kilometres a year you expect, all cars" : "Or: kilometres a year, all cars"), a.ev_km, (ev_km) => setAnswers({ ...a, ev_km }), `${(TYPICAL_KM * (a.ev_count ?? 1)).toLocaleString("en")} if you skip`, SPAN.ev_km)}
        {(a.ev_planned || !a.ev_kwh_month) && <><h2>Where will it charge mostly?</h2>
        <div className="answers">
          {([["most", "At home"], ["half", "Half and half"], ["little", "Elsewhere"]] as const).map(([v, label]) => <Button key={v} size="lg" wide aria-pressed={a.ev_charge_home === v} onClick={() => setAnswers({ ...a, ev_charge_home: v })}>{label}</Button>)}
        </div></>}
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
      </>)}

      {stage === "where" && page("Where is your home?", "Your installer needs it for a visit. Nothing looks it up: it stays as text in this browser, and before sending you can still leave it out.",
        <div className="answers"><Field label={optional("Address")}><Input autoComplete="street-address" placeholder="Street and number, postcode" value={a.address ?? ""} onChange={(e) => setAnswers({ ...a, address: e.target.value || null })} /></Field></div>)}
      {stage === "roofq" && page("Tell us about your roof", "Rough answers are fine. They stand in for what the map would measure.", <>
        <h2 className="ask">Which way does the larger side face?</h2>
        <div className="answers grid2">{FACING.map(([v, l]) => <Button key={v} size="lg" wide aria-pressed={a.roof_facing === v} onClick={() => setAnswers({ ...a, roof_facing: v })}>{l}</Button>)}</div>
        {a.roof_facing && a.roof_facing !== "flat" && <><h2 className="ask gap">How steep is it?</h2>
          <div className="answers">{SLOPE.map(([v, l, line]) => <Button key={v} size="lg" wide className={line ? "choice" : undefined} aria-pressed={a.roof_slope === v} onClick={() => setAnswers({ ...a, roof_slope: v })}>{line ? <><b>{l}</b><small>{line}</small></> : l}</Button>)}</div></>}
        <h2 className="ask gap">How big is the house?</h2>
        <div className="answers">{SIZE.map(([v, l, line]) => <Button key={v} size="lg" wide className={line ? "choice" : undefined} aria-pressed={a.roof_size === v} onClick={() => setAnswers({ ...a, roof_size: v })}>{line ? <><b>{l}</b><small>{line}</small></> : l}</Button>)}
          {a.roof_size === "known" && <Field label="Roof area, all sides together"><Input type="number" min={10} placeholder="m²" value={a.roof_m2 ?? ""} onChange={(e) => setAnswers({ ...a, roof_m2: number(e.target.value) })} />{warn(a.roof_m2, SPAN.roof_m2)}</Field>}</div>
      </>)}
      {stage === "goal" && page("What matters most to you?", "We size the system with this in mind.", <div className="answers">
        {GOALS.map(([v, label, line]) => <Button key={v} size="lg" wide className="choice" aria-pressed={a.goal === v} onClick={() => setAnswers({ ...a, goal: v })}><b>{label}</b><small>{line}</small></Button>)}
      </div>, <>
        <h2>Power during an outage?</h2>
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
