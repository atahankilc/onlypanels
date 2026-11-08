import { isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GAS_CT, NO_CHOICE, View, paintChoice, surfaceKey } from "./api";
import { Monument, around as monumentAt, monumentOf } from "./monument";
import { HeatPlan, at as heatPlanAt, heatPlanOf } from "./heatPlan";
import { Place, searchPlace } from "./places";
import { Shade, withTrees } from "./treeShade";
import HomeMap, { Face, SUN_HIGH, SUN_LOW, Tool } from "./HomeMap";
import { Back } from "./icons";
import { Design, Handoff, Inputs, Overrides, existingArea, Progress, Request, Source, Spot, design, designBody, facing, fromHomeowner, offerOf, DEFAULT_ALLOWED, refine, roofOf, turnTo } from "./plan";
import { Change, ChangeCard, Trace, touched } from "./Trace";
import "./planner.css";
import Offer from "./Offer";
import Obstacles from "./Obstacles";
import Validate from "./Validate";
import { Ask, answer, describeChange, useAsks } from "./asks";
import "./asks.css";
import { KIND, Obstacle, blockedOf, findObstacles } from "./roofObstacles";
import { Options } from "./Options";
import { AgentPanel } from "./Agent";
import type { RoofNumbers } from "./share";
import { BatteryCurve, curveOf } from "./BatteryCurve";
import { CostTab, PriceBook } from "./Costs";
import { DeskSummary, hpWhy, keptBattery } from "./DeskSummary";
import { askAhead, askKey, keepAnswer, lastAnswer } from "./answers";
import { EvidenceCard } from "./Evidence";
import { Money, moneyAsk, moneyOf, useCosts, usePriceVersion } from "./money";
import { Button, Check, Field, Fold, IconButton, Input, Segmented, Select, Slider } from "./ui";
import SunView from "./SunView";
import { setDeskContext, setOpenContext, useVoiceActions } from "./voiceBus";
import VoiceDock from "./Voice";
import { ago } from "./Requests";
import { DraftChain, chainText } from "./DraftChain";
import { arrived, finished, started } from "./draftLog";

const LEFT = 548; // the desk's column: the homeowner's, widened for tables
/** An address as the homeowner view writes it: the street large, the town under it. */
const splitLabel = (label: string) => { const at = label.indexOf(", "); return at < 0 ? [label, ""] : [label.slice(0, at), label.slice(at + 2)]; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SOURCE: Record<Source, string> = { customer: "Customer", assumed: "Assumed", planner: "You" };
const INSTALLERS: [string, string][] = [["2a8ba8e2", "Installer A"], ["23c108b7", "Installer B"]];
const HEATS: [string, string][] = [["", "Unknown"], ["Gas", "Gas"], ["Oil", "Oil"], ["OtherNonRenewable", "Other fossil"], ["OtherRenewable", "Wood or pellets"], ["District", "District heating"], ["Electric", "Electric heating"], ["Heatpump", "Heat pump"]];
const summary = (d: Design, r?: Request) => `${d.pv.kwp.toFixed(1)} kWp · ${d.battery.kwh ? `${d.battery.kwh} kWh` : r && keptBattery(r, d) ? `keeps its ${keptBattery(r, d)} kWh battery` : "no battery"}${d.wallbox.included ? " · wallbox" : ""}${d.heatpump.included ? ` · ${d.heatpump.kw} kW heat pump` : ""}`;
const FACT: Record<string, string> = { demand_kwh: "Yearly electricity", price_ct_kwh: "Price", heating: "Heating", heat_kwh: "Yearly heat", ev: "Electric car", ev_km: "Driving", has_solar: "Existing solar", has_storage: "Existing battery", installer: "Catalog",
  ev_kwh_month: "Car charged at home", ev_charge_home: "Charging at home", ev_day: "Car charges in daytime", home_day: "Home in the day", heat_dist: "Heats through", boiler_age: "Boiler age", has_wallbox: "Wallbox already there", hp_kwh: "Heat pump use now", monthly_eur: "Monthly payment",
  big_users: "Big users", living_m2: "Living area", existing_kwp: "Existing solar size", ev_when: "Car comes", owner: "Who owns the home", backup: "Backup power", wants_hp: "Heat pump wanted", electric_heat_meter: "Electric heating meter", cert_kwh_m2: "Energy certificate", built: "Built", goal: "Customer's priority" };
const BUILT: [string, string][] = [["", "Not given"], ["before1979", "Before 1979"], ["1979to1990", "1979 – 1990"], ["1991to2000", "1991 – 2000"], ["2001to2010", "2001 – 2010"], ["since2011", "2011 or later"]];
const HOME_SHARE: [string, string][] = [["", "Not given"], ["most", "Most"], ["half", "About half"], ["little", "Little"]];
const BOILER_AGE: [string, string][] = [["", "Not given"], ["under10", "Under 10 years"], ["10to20", "10 – 20 years"], ["over20", "Over 20 years"]];
const HEAT_DIST: [string, string][] = [["", "Not given"], ["floor", "Underfloor"], ["radiators", "Radiators"], ["both", "Both"]];
const HOME_DAY: [string, string][] = [["", "Not given"], ["most", "Mostly"], ["some", "Sometimes"], ["rarely", "Rarely"]];
const GOAL: [string, string][] = [["", "Not given"], ["cost", "Lower cost"], ["independence", "Independence"], ["environment", "Environment"]];
const USE_FROM: Record<string, string> = { bill: "from the bill", range: "from a range the customer picked", payment: "from the monthly payment", people: "from the household size", unknown: "not known" };
const BIG: Record<string, string> = { pool: "pool", sauna: "sauna", ac: "air conditioning", water: "electric water heater" };
const label = (list: [string, string][], v: unknown) => list.find(([k]) => k === (v ?? ""))?.[1] ?? String(v);
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
  const prices = usePriceVersion(); // a low-cost customer's sizes are chosen by price: a price change asks again
  const wait = !roof.length && r.buildings.length > 0; // a shared home waits for its roof; without one the answers carry the design
  // The last answer to the same question shows at once (answers.ts); the engine is asked again behind it.
  const key = useMemo(() => (wait ? "" : askKey("design", designBody(r.inputs, r.overrides, roof, r.off, r.existing, r.strict).body)), [r.inputs, r.overrides, r.off, roof, r.existing, r.strict, wait]);
  type Out = { d: Design; panels: Record<string, number>; for?: string };
  const [out, setOut] = useState<Out | null>(() => { const k = key ? lastAnswer<Out>(key) : null; return k ? { ...k, for: key } : null; });
  useEffect(() => {
    if (!key) return;
    const known = lastAnswer<{ d: Design; panels: Record<string, number> }>(key);
    if (known) setOut({ ...known, for: key });
    let live = true, t = 0;
    // A failed call (the API restarting, a slow square) is tried again, sooner first, so the desk never stays on "working".
    const WAIT = [known ? 400 : 120, 1500, 4000, 8000, 15000];
    const go = (k: number) => { t = window.setTimeout(() => design(r.inputs, r.overrides, roof, r.off, r.existing, r.strict).then((x) => { keepAnswer(key, x); if (live) setOut({ ...x, for: key }); })
      .catch(() => { if (live) go(Math.min(k + 1, WAIT.length - 1)); }), WAIT[k]); };
    go(0);
    return () => { live = false; clearTimeout(t); };
  }, [key, prices]);
  return out && { ...out, fresh: out.for === key }; // fresh: the answer is for the request as it is now, not the one before
};

// The desk's requests outlive the desk: switching to the homeowner view and back must not lose the planner's work.
let kept: Request[] = [];


export default function Planner({ handoffs, onProgress, loading = 0 }: { handoffs: Handoff[]; onProgress?: (ref: string, p: Progress) => void; loading?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState<"requests" | "prices">("requests");
  const [requests, setRequests] = useState<Request[]>(() => kept);
  useEffect(() => { kept = requests; }, [requests]);
  const [scores, setScores] = useState<Scores | null>(null);
  // A planner's change to a sent offer's design opens it again as a draft, so what the homeowner holds and the desk show never
  // differ unseen. Updates the page makes by itself (trees, the photo check) and the send itself leave the status alone.
  const update = (id: string, p: Partial<Request>) => setRequests((l) => l.map((r) => (r.id !== id ? r
    : { ...r, ...p, ...(r.status === "sent" && !("status" in p) && !("obstacles" in p) && ["inputs", "overrides", "off", "strict", "priority"].some((k) => k in p) ? { status: "draft" as const } : {}) })));
  useEffect(() => { fetch("/api/scores").then((r) => r.json()).then(setScores).catch(() => undefined); }, []);
  // Every homeowner request reaches the desk once, newest on top. One already on the desk keeps the planner's work.
  useEffect(() => { setRequests((l) => handoffs.filter((h) => h.buildings.length || h.shared?.home === false).map(fromHomeowner).reduce((acc, r) => (acc.some((x) => x.id === r.id) ? acc : [r, ...acc]), l)); }, [handoffs]);
  // The draft's chain starts when a request reaches the desk (draftLog.ts).
  useEffect(() => { for (const r of requests) arrived(r.id, chainText.home(r.buildings.length, r.buildings.reduce((a, b) => a + (b.sun?.surfaces.filter((s) => s.kind === "roof").length ?? 0), 0))); }, [requests]);
  // Once a request is on the desk, trees from Bavaria's tree map go onto its sun, once: the yield, the design and the checks then carry them.
  const shading = useRef(new Set<string>());
  useEffect(() => {
    for (const r of requests) if (!r.shade && !shading.current.has(r.id)) {
      shading.current.add(r.id);
      // The tree map briefly away is asked again, twice, before the request is designed without trees.
      const go = (k: number): void => { withTrees(r.buildings).then(({ buildings, shade }) => {
        if (shade.status === "unknown" && r.buildings.length && k < 2) { window.setTimeout(() => go(k + 1), 3000 * (k + 1)); return; }
        update(r.id, { shaded: buildings, shade }); finished(r.id, "trees", ...chainText.trees(r.buildings.length > 0, shade));
      }); };
      go(0);
    }
  }, [requests]);
  // The homeowner follows their request: opened by a planner, then the offer once it is sent.
  useEffect(() => { requests.forEach((r) => r.ref && onProgress?.(r.ref, { opened: !!r.opened, offer: r.status === "sent" ? r.offer ?? null : null })); }, [requests]);
  useEffect(() => { if (openId) update(openId, { opened: true }); }, [openId]);
  const open = requests.find((r) => r.id === openId);
  // Opening and closing a request (D131). covering: the list stays over the request while its map loads unseen, so no empty
  // frame and no half-drawn map show; revealing: the list fades off the city map, then the camera flies and the desk is
  // uncovered as before; returning: the map slides back over the desk while the list fades in, and only then is the request let go.
  const [phase, setPhase] = useState<"none" | "covering" | "revealing" | "returning">("none");
  const [quiet, setQuiet] = useState(false); // the list came back from a request: it does not rise again
  const openReq = (id: string) => { setOpenId(id); setPhase("covering"); };
  const closeReq = () => setPhase("returning");
  useEffect(() => { if (phase !== "covering") return; const t = window.setTimeout(() => setPhase((p) => (p === "covering" ? "revealing" : p)), 6000); return () => clearTimeout(t); }, [phase]); // a map that never loads does not keep the list up
  // The voice sees the list as the planner does, and opens, closes and switches pages as a click would.
  useEffect(() => { setDeskContext({ page, requests: requests.map((r) => ({ id: r.id, ref: r.ref, title: r.label, status: r.status })) }); }, [requests, page]);
  useVoiceActions((a) => {
    if (a.type === "open" && requests.some((r) => r.id === a.id)) { setPage("requests"); openReq(a.id); }
    if (a.type === "back") closeReq();
    if (a.type === "page" && a.page !== "proof") setPage(a.page);
  });
  const waiting = requests.filter((r) => r.status !== "sent").length;
  const list = <main className={`inbox-page${phase === "revealing" ? " leave" : phase === "returning" ? " back" : quiet ? " still" : ""}`} inert={phase === "revealing" || phase === "returning"}
    onAnimationEnd={(e) => { if (e.target !== e.currentTarget) return; if (phase === "revealing") setPhase("none"); if (phase === "returning") { setOpenId(null); setPhase("none"); setQuiet(true); } }}>
    <div className="inbox-col">
      <header className="inbox-head">
        <div>
          <h1>{page === "prices" ? "Prices" : "Requests"}</h1>
          <p className="muted">{page === "requests"
            ? (requests.length ? `${waiting ? `${waiting} waiting for an offer, ${requests.length - waiting} sent.` : "Every offer is sent."} Each comes with the engine's draft to check, change and send.` : "Requests arrive here with the engine's draft.")
            : "What each part of an offer costs. Every offer prices its design from here, so the planner sees what the homeowner pays and when it pays back."}</p>
        </div>
      </header>
      {/* The planner's pages, in the top bar as the app's menu. In the body so the top bar's fade does not cover it. */}
      {(phase === "none" || phase === "covering") && createPortal(<nav className="pagenav" aria-label="Planner pages"><Segmented variant="glass" label="Page" value={page} onChange={setPage} options={[{ value: "requests", label: "Requests" }, { value: "prices", label: "Prices" }]} /></nav>, document.body)}
      {page === "prices" ? <PriceBook /> : <>
        <ul className="reqlist">{byTurn(requests).map((r) => <Line key={r.id} r={r} open={() => openReq(r.id)} />)}
          {Array.from({ length: loading }, (_, i) => <li key={`loading${i}`} className="loading" aria-hidden="true"><span /><span /></li>)}
        </ul>
        {loading > 0 && <p className="small muted loadnote" role="status"><span className="spinner" aria-hidden="true" />{requests.length ? `Loading ${loading} more ${loading === 1 ? "request" : "requests"}…` : "Loading requests…"}</p>}
      </>}
    </div>
  </main>;
  // An opened request sits under the list until its map can draw; then the list fades and the map flies in (D131).
  // Fixed slots, so the list stays the same element while a request opens under it and does not rise again.
  return <>{open && <Workspace key={open.id} r={open} update={update} back={closeReq} scores={scores} veiled={phase !== "none"} leaving={phase === "returning"}
    onShown={() => setPhase((p) => (p === "covering" ? "revealing" : p))} />}{(!open || phase !== "none") && list}<VoiceDock /></>;
}

/** The planner's queue: requests waiting for an offer first, the longest waiting on top; sent offers below, the latest first. */
const byTurn = (l: Request[]) => [...l].sort((a, b) => (a.status === "sent" ? 1 : 0) - (b.status === "sent" ? 1 : 0)
  || (a.status === "sent" ? (b.receivedAt ?? 0) - (a.receivedAt ?? 0) : (a.receivedAt ?? 0) - (b.receivedAt ?? 0)));
/** The roof and the engine's steps of the draft's chain, logged from whichever view runs them: the list or the open request. */
const useDraftSteps = (r: Request, roof: Spot[], out: { d: Design } | null) => {
  useEffect(() => { if (!r.buildings.length || roof.length) { finished(r.id, "roof", ...chainText.roof(r.buildings.length > 0, roof)); started(r.id, "engine"); } }, [r.id, r.buildings.length, roof]);
  useEffect(() => { if (out) finished(r.id, "engine", ...chainText.engine(summary(out.d, r), out.d.energy.self_sufficiency_pct)); }, [r, out]);
};

function Line({ r, open }: { r: Request; open: () => void }) {
  const roof = useMemo(() => roofOf(r.shaded ?? r.buildings, r.installed, r.priority, r.taken, r.obstacles), [r.shaded, r.buildings, r.installed, r.priority, r.taken, r.obstacles]); // trees reach the sun after arrival; no module touches a kept obstacle
  const out = useDesign(r, roof);
  useDraftSteps(r, roof, out);
  // Once the draft is in, the review and the price are asked ahead, so the request opens on them without waiting.
  useEffect(() => {
    if (!out) return;
    const ask = moneyAsk(r, roof);
    started(r.id, "review"); started(r.id, "costs");
    askAhead("review", "/api/review", ask, (v) => finished(r.id, "review", ...chainText.review(v)));
    askAhead("costs", "/api/costs", ask, (v) => finished(r.id, "costs", ...chainText.costs(v)));
  }, [out, r, roof]);
  // The same count Checks shows: only facts this design uses.
  const assumed = out ? toConfirm(r, out.d).length : null; // counted once the draft is in, so the number never jumps
  const [street, town] = splitLabel(r.label), sent = r.status === "sent";
  const asking = useAsks(r.ref ?? "-").filter((x) => !x.answered).length;
  return <li>
    <button type="button" className="reqrow" onClick={open}>
      <span className="reqrow-home"><b>{street}{asking > 0 && <span className="reqrow-ask">{asking === 1 ? "Question" : `${asking} questions`}</span>}</b><small>{[town, r.from, r.ref].filter(Boolean).join(" · ")}{r.receivedAt && <> · <time dateTime={new Date(r.receivedAt).toISOString()} title={new Date(r.receivedAt).toLocaleString("en-GB")}>{ago(r.receivedAt)}</time></>}</small></span>
      <span className="reqrow-draft">{out ? summary(out.d, r) : <span className="muted">Drafting…</span>}</span>
      <span className={`reqrow-todo${!sent && assumed ? " open" : ""}`}>{sent || assumed === null ? "" : assumed ? `${assumed} to confirm` : "Ready to send"}</span>
      <span className={`reqstate ${sent ? "is-sent" : r.opened ? "is-open" : "is-new"}`}>{sent ? "Offer sent" : r.opened ? "In progress" : "New"}</span>
    </button>
    <div className="reqrow-chain" onClick={open}><DraftChain id={r.id} /></div>
  </li>;
}

type Scores = { scores: Record<string, { kwp_within20: number; n: number; batt_exact_closest: number }> };
type Tab = "overview" | "home" | "design" | "cost" | "checks" | "offer";
type Req = Request & { allowed?: string[] };
const fmt = (r: Request, k: string, d: Design): string => {
  const i = r.inputs as unknown as Record<string, unknown>, v = i[k];
  if (k === "demand_kwh") {
    const from = i.demand_source === "payment" ? "from the monthly payment" : i.demand_source === "range" ? "from a range the customer picked" : i.demand_source === "people" ? "from the household size" : "stand-in";
    const counted = Math.round(d.energy.base_mwh * 10) * 100, more = v != null && counted > Number(v) + 50 && (i.big_users as string[] | undefined)?.length
      ? `; with ${(i.big_users as string[]).map((x) => BIG[x] ?? x).join(" and ")} the design counts ${counted.toLocaleString("en")} kWh` : "";
    return v == null ? `${(d.energy.base_mwh * 1000).toLocaleString("en")} kWh (${from})` : `${Number(v).toLocaleString("en")} kWh${i.demand_source && i.demand_source !== "bill" ? ` (${from})` : ""}${more}`;
  }
  if (k === "heat_kwh") return v != null ? `${Number(v).toLocaleString("en")} kWh` : `${(Math.round((d.energy.heat_mwh ?? 15) * 10) * 100).toLocaleString("en")} kWh (${i.living_m2 && (i.built || i.area_built || i.cert_kwh_m2) && !d.review.some((n) => n.code === "model_area_large") ? "estimated from the house" : "stand-in"})`;
  if (k === "installer") return INSTALLERS.find(([x]) => x === v)?.[1] ?? String(v);
  if (k === "ev_kwh_month") return `${v} kWh a month`;
  if (k === "hp_kwh") return `${Number(v).toLocaleString("en")} kWh a year`;
  if (k === "monthly_eur") return `€${v} a month`;
  if (k === "living_m2") return `${v} m²${i.living_from_model && !r.sources.living_m2 ? " (estimated from the 3D model)" : ""}`;
  if (k === "cert_kwh_m2") return `${v} kWh per m² a year`;
  if (k === "built") return v ? label(BUILT, v) : i.area_built ? `${label(BUILT, i.area_built)} (most common nearby, 2022 census: ${Math.round(Number(i.area_built_share ?? 0) * 100)}% of homes)` : "not given";
  if (k === "ev_charge_home") return label(HOME_SHARE, v);
  if (k === "goal") return label(GOAL, v);
  if (k === "home_day") return label(HOME_DAY, v);
  if (k === "heat_dist") return label(HEAT_DIST, v);
  if (k === "boiler_age") return label(BOILER_AGE, v);
  if (k === "big_users") return (v as string[]).map((x) => BIG[x] ?? x).join(", ");
  if (k === "price_ct_kwh") return `${v} ct per kWh`;
  if (k === "ev_km") return `${Number(v).toLocaleString("en")} km a year`;
  if (k === "ev") return v ? (i.ev_when === "later" ? "yes, coming later" : i.ev_when === "soon" ? "yes, coming within a year" : "yes") : "no";
  if (k === "ev_when") return v === "later" ? "later" : v === "soon" ? "within a year" : "not said";
  if (k === "existing_kwp") return v ? `${v} kWp` : "not known";
  if (k === "owner") return v === "sole" ? "the customer or their family" : v === "shared" ? "shared with other owners" : v === "tenant" ? "rented: the landlord decides" : "not said";
  if (k === "electric_heat_meter") return v === "own" ? "its own meter" : v === "house" ? "the house's meter" : "not said";
  if (k === "heating") return v == null ? "unknown" : v === "OtherNonRenewable" ? "other fossil" : v === "OtherRenewable" ? "wood or pellets" : v === "Heatpump" ? "heat pump" : String(v).toLowerCase();
  return v ? "yes" : "no";
};
/** Facts that matter for this design and were not given by anyone: they must be confirmed before the offer leaves. */
const relevant = (r: Request, d: Design) => Object.keys(r.sources).filter((k) => (!["heat_kwh", "living_m2", "built"].includes(k) || d.heatpump.included) && (k !== "ev_km" || r.inputs.ev));
const EXTRA = ["owner", "backup", "wants_hp", "electric_heat_meter", "ev_when", "home_day", "ev_kwh_month", "ev_charge_home", "ev_day", "has_wallbox", "hp_kwh", "heat_dist", "boiler_age", "big_users", "living_m2", "cert_kwh_m2", "built", "goal"];
/** What the planner must confirm before the offer leaves: assumed facts this design uses, and a living area guessed
 * from the 3D model when a heat pump is sized from it. The request list counts the same. */
const toConfirm = (r: Request, d: Design) => [...relevant(r, d).filter((k) => r.sources[k] === "assumed"),
  ...(d.heatpump.included && r.inputs.heat_kwh == null && r.inputs.living_from_model && !r.sources.living_m2 && !d.review.some((n) => n.code === "model_area_large") ? ["living_m2"] : []),
  ...(d.heatpump.included && r.inputs.heat_kwh == null && !r.inputs.cert_kwh_m2 && !r.inputs.built && r.inputs.area_built && !r.sources.built && !d.review.some((n) => n.code === "model_area_large") ? ["built"] : [])];
const SOURCE_LONG: Record<Source, string> = { customer: "from the customer", assumed: "assumed", planner: "confirmed by the planner" };

/** Old panels the aerial photo shows stand in for the existing system when the customer gave neither its size nor its
 *  marked area: their roof cells give the area, and the area the size and yield, as a marked area would (plan.ts).
 *  Nobody asks the customer: the planner sees the panels in the obstacle list and confirms "Existing solar" before sending.
 *  Customers with only hot-water collectors keep them as collectors. Switching the panels off goes back to what was said. */
export const withPhotoSolar = (r: Request, obstacles: Obstacle[]): Partial<Request> => {
  const thermalOnly = !!r.inputs.solar_thermal && !r.inputs.has_solar && r.sources.has_solar === "customer";
  const saidNo = r.sources.has_solar === "customer" && !r.inputs.has_solar && !r.existing.photo; // their word stands; the panels still take no new module
  if (r.existing.kwp || (r.existing.m2 && !r.existing.photo) || thermalOnly || saidNo) return { obstacles };
  const homes = r.shaded ?? r.buildings;
  const { m2, kwh_per_kwp } = existingArea(homes, blockedOf(homes, obstacles.filter((o) => o.on && o.kind === "solar"), 0));
  const was = r.existing.photo ?? { has_solar: r.inputs.has_solar, source: r.sources.has_solar };
  if (m2) return { obstacles, existing: { ...r.existing, m2, kwh_per_kwp, photo: was }, inputs: { ...r.inputs, has_solar: true },
    sources: { ...r.sources, has_solar: was.has_solar && was.source === "customer" ? "customer" : "assumed" } };
  if (!r.existing.photo) return { obstacles };
  return { obstacles, existing: { ...r.existing, m2: null, kwh_per_kwp: null, photo: undefined }, inputs: { ...r.inputs, has_solar: was.has_solar },
    sources: { ...r.sources, has_solar: was.source ?? "assumed" } };
};

function Workspace({ r, update, back, scores, veiled = false, leaving = false, onShown }: { r: Request; update: (id: string, p: Partial<Request>) => void; back: () => void; scores: Scores | null; veiled?: boolean; leaving?: boolean; onShown?: () => void }) {
  const [tab, setTab] = useState<Tab>("overview"); // the request at a glance and what is left to do; the other tabs get the panel's height
  const home = r.buildings.length > 0;
  const [mapStep, setStep] = useState<"pick" | "review">(home ? "pick" : "review");
  // Under the list the map stays on its city view: the flight and the desk's uncovering wait until the list has gone (D131).
  // Leaving, the map stays where it is: flying back out to the city outran its tiles and showed a dark map.
  const step = home && veiled && !leaving ? "pick" : mapStep;
  useEffect(() => { if (mapStep === "review") onShown?.(); }, [mapStep]);
  const roof = useMemo(() => roofOf(r.shaded ?? r.buildings, r.installed, r.priority, r.taken, r.obstacles), [r.shaded, r.buildings, r.installed, r.priority, r.taken, r.obstacles]); // trees reach the sun after arrival; no module touches a kept obstacle
  const [view, setView] = useState<View>({ layer: "photo", moment: null });
  const [face, setFace] = useState<Face | null>(null);
  const [hotObs, setHotObs] = useState<number | null>(null); // the obstacle under the pointer in the list, lit on the model
  const done = r.checked ?? [], setDone = (checked: string[]) => update(r.id, { checked });
  const out = useDesign(r, roof);
  useDraftSteps(r, roof, out);
  const { costs, failed: costsFailed } = useCosts(r, roof); // what the design costs and pays back, from the price book
  useEffect(() => { if (costs) finished(r.id, "costs", ...chainText.costs(costs)); }, [r.id, costs]);
  const [pricing, setPricing] = useState(false); // the price book open inside the Cost tab
  // Monument status from the Bavarian monument map, asked once per request by the page itself, never through our server.
  const [monument, setMonument] = useState<Monument | null>(null);
  // Without a home but with an address, the page finds the address with Photon (EU), as the homeowner's search does, and asks the same maps at that point.
  const [spot, setSpot] = useState<Place | null | undefined>(undefined); // undefined: not looked up (yet), null: not found
  useEffect(() => {
    let live = true; setSpot(undefined);
    const address = addressOf(r);
    if (!home && address) searchPlace(address).then((l) => live && setSpot(l[0] ?? null)).catch(() => live && setSpot(null));
    return () => { live = false; };
  }, [r.id]);
  useEffect(() => { let live = true; setMonument(null); (home ? monumentOf(r.buildings) : spot ? monumentAt(spot.lat, spot.lon) : null)?.then((m) => live && setMonument(m)); return () => { live = false; }; }, [r.id, spot]);
  // Munich's heat plan at the home, asked the same way: by the page, from the city's map server.
  const [heatPlan, setHeatPlan] = useState<HeatPlan | null>(null);
  useEffect(() => { let live = true; setHeatPlan(null); (home ? heatPlanOf(r.buildings) : spot ? heatPlanAt(spot.lat, spot.lon) : null)?.then((p) => live && setHeatPlan(p)); return () => { live = false; }; }, [r.id, spot]);
  // looking: the photo is being checked, and the offer waits for it; failed: tried three times, the planner is told.
  const [photo, setPhoto] = useState<"idle" | "looking" | "done" | "off" | "failed">(r.obstacles ? "done" : "idle");
  // The engine's first draft is taken once the roof is what the desk found by itself: trees on the sun and the photo checked.
  // Before, it was the draft from before them, and "Changes from the AI draft" showed changes nobody made.
  const settled = !home || (!!r.shade && photo !== "looking" && photo !== "idle");
  const first = useRef<Design | null>(null);
  if (out?.fresh && settled && !first.current) first.current = out.d;
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
  const mark = (label: string) => { pending.current = { label, was: { inputs: r.inputs, overrides: r.overrides, sources: r.sources, off: r.off, existing: r.existing, obstacles: r.obstacles } }; };
  // Every request with a home has its photo checked as it opens, once: chimneys and roof windows take no module, and old
  // panels count, and keep their cells, without a question to the customer. The finds land in the obstacle list as a click would.
  const roofReady = (r.shaded ?? r.buildings).some((b) => b.sun?.surfaces?.length);
  const found = useRef<(o: Obstacle[]) => void>(() => undefined); // the photo answers after a while: apply it to the request as it is then
  found.current = (obstacles) => { mark(obstacles.some((o) => o.on && o.kind === "solar") ? "Old panels found on the photo" : "Photo checked"); update(r.id, withPhotoSolar(r, obstacles)); };
  useEffect(() => {
    if (!home || !roofReady || r.obstacles) return;
    let live = true, t = 0;
    setPhoto("looking");
    const go = (k: number) => findObstacles(r.shaded ?? r.buildings).then((x) => {
      if (!live) return;
      if (x.source === "unavailable") return setPhoto("off");
      if (x.source === "failed") throw new Error();
      found.current(x.obstacles); setPhoto("done");
    }).catch(() => { if (!live) return; if (k < 2) t = window.setTimeout(() => go(k + 1), 3000 * (k + 1)); else setPhoto("failed"); });
    go(0);
    return () => { live = false; clearTimeout(t); };
  }, [r.id, roofReady]);
  useEffect(() => { if (tab !== "home") setFace(null); }, [tab]); // the map's view stays as the planner chose it, on every tab
  const [showTrees, setShowTrees] = useState(false);
  const trees = r.shade?.near ?? [];

  const setI = (change: Partial<Inputs>, by: Source = "planner", label?: string) => { mark(label ?? `${Object.keys(change).map((k) => FACT[k] ?? k).join(", ")} changed`); update(r.id, { inputs: { ...r.inputs, ...change }, sources: { ...r.sources, ...Object.fromEntries(Object.keys(change).filter((k) => k in FACT).map((k) => [k, by])) } }); };
  const setO = (change: Overrides, label?: string) => { mark(label ?? describe(change)); update(r.id, { overrides: { ...r.overrides, ...change } }); };
  // The planner draws where modules may go, with the homeowner's tools: the drawn area becomes the request's marked area and
  // the design keeps to it, so drawing over modules takes them off and drawing free roof gives it back. Each stroke is one
  // change with its card and undo; the desk and the model follow it at once.
  const [tool, setTool] = useState<Tool | null>(null);
  useEffect(() => { if (tab !== "home") setTool(null); }, [tab]);
  // A roof side not drawn on is open to modules as a whole, so the tool starts from all its cells, not from none.
  const markedAll = useMemo(() => Object.fromEntries(r.buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((x) => x.kind === "roof")
    .map((x) => [surfaceKey(b, x), r.priority?.[surfaceKey(b, x)] ?? x.year.map((_, n) => n)]))), [r.buildings, r.priority]);
  const paint = (cells: Record<string, number[]>, on: boolean, start: boolean) => {
    if (start) mark(on ? "Area added for modules" : "Area taken out of the modules");
    update(r.id, { priority: paintChoice(r.buildings, { ...NO_CHOICE, cells: markedAll, panels: r.taken ?? {} }, cells, on, "cells").cells, strict: true });
  };
  const toggle = (key: string) => { if (roof.some((x) => x.key === key)) mark(r.off.includes(key) ? "Roof surface added" : "Roof surface taken out"); if (roof.some((x) => x.key === key)) update(r.id, { off: r.off.includes(key) ? r.off.filter((k) => k !== key) : [...r.off, key] }); };
  const walls = r.buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "wall").map((s) => surfaceKey(b, s)));
  const chosen = [...walls, ...roof.filter((x) => !r.off.includes(x.key)).map((x) => x.key)];
  const checks = d ? checkList(r, d, monument, heatPlan, r.shade ?? null, spot) : [];
  const confirm = d ? toConfirm(r, d) : [];
  const warns = d ? d.review.filter((n) => n.level === "warn") : [];
  const tasks = checks.filter((c) => !c.info); // what to check on site; the rest is found for the planner and needs nothing
  const left = tasks.filter((c) => !done.includes(c.id)).length; // the facts to confirm have their own card in Design
  const allowed = (r as Req).allowed ?? DEFAULT_ALLOWED; // the same default the sent offer carries
  const send = () => {
    // The sent design is frozen into the request's own choices, so reopening it shows what was sent even after prices,
    // learning or the engine move; and the homeowner's saving is the Cost tab's first year when it prices this design.
    const priced = d && costs && costs.design.modules === d.pv.modules && costs.design.battery_kwh === d.battery.kwh ? costs : null;
    update(r.id, { status: "sent", ...(d ? { offer: { ...offerOf(d, r), ...(priced ? { saving_eur: priced.year1.total_eur, pays_eur: priced.pays_eur, payback_years: priced.payback_years } : {}) },
      overrides: { ...r.overrides, modules: d.pv.modules, battery_kwh: d.battery.kwh, wallbox: d.wallbox.included, heatpump: d.heatpump.included } } : {}) });
    answer(r.ref ?? "-"); // a new offer answers what the customer asked
    // The desk learns the planner's usual changes: the engine's first draft next to what was sent (learning.py, kept locally).
    const draft = first.current ?? d;
    if (d && draft) fetch("/api/approved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...designBody(r.inputs, { ...r.overrides, modules: d.pv.modules, battery_kwh: d.battery.kwh }, roof, r.off, r.existing, r.strict).body, draft: { modules: draft.pv.modules, battery_kwh: draft.battery.kwh }, ref: r.ref ?? r.id }) }).catch(() => undefined);
    back();
  };
  const asks = useAsks(r.ref ?? "-").filter((x) => !x.answered);
  // What the voice sees of this request, and the clicks it may make here: the same handlers as the buttons.
  useEffect(() => {
    setOpenContext({ id: r.id, ref: r.ref, title: r.label, tab, status: r.status, to_confirm: d ? confirm.map((k) => ({ key: k, label: FACT[k] ?? k, value: fmt(r, k, d) })) : [],
      checks: checks.map((c) => ({ id: c.id, title: c.title, done: done.includes(c.id) })), money: moneyOf(r), inputs: designBody(r.inputs, r.overrides, roof, r.off, r.existing, r.strict).body.inputs as Inputs, overrides: r.overrides });
  });
  useEffect(() => () => setOpenContext(null), []);
  useVoiceActions((a) => {
    if (a.type === "tab") setTab(a.tab);
    if (a.type === "set" && r.status !== "sent") { setO(a.overrides, `Voice: ${describe(a.overrides)}`); setTab("design"); }
    if (a.type === "confirm") update(r.id, { sources: { ...r.sources, ...Object.fromEntries(a.keys.filter((k) => confirm.includes(k)).map((k) => [k, "planner" as Source])) } });
    if (a.type === "check") setDone(a.done ? [...new Set([...done, ...a.ids])] : done.filter((x) => !a.ids.includes(x)));
    if (a.type === "fact" && r.status !== "sent") setI(a.inputs, "planner", `Voice: ${Object.keys(a.inputs).map((k) => FACT[k] ?? k).join(", ")} changed`);
    if (a.type === "send" && d && !confirm.length && r.status !== "sent") send();
  });
  const tryAsk = (x: Ask) => { setO(x.change as Overrides, `Tried the customer's question: ${describeChange(x.change)}`); if (r.status === "sent") update(r.id, { status: "draft" }); setTab("design"); };

  return <main className={`stage ${step} plan${leaving ? " leaving" : ""}`} style={{ "--left": `${LEFT}px` } as React.CSSProperties}>
    {home ? <HomeMap buildings={view.layer === "sun" && !showTrees ? r.buildings : r.shaded ?? r.buildings} installed={r.installed} priority={r.priority} taken={r.taken} obstacles={r.obstacles} hotObstacle={hotObs} step={step} focus={null} open={null} near={null} face={face} look={null} onFace={setFace} onOpen={() => undefined} view={view} chosen={chosen} onToggle={toggle} editing={tab === "home"} trees={trees} showTrees={showTrees}
      marked={tool ? markedAll : undefined} tool={tool ?? undefined} onPaint={tool ? paint : undefined}
      panels={out?.panels} panelW={LEFT} turn={turnTo(roof, out?.panels)} onReady={() => setStep("review")} />
      : <NoHomeStage r={r} />}
    {home && step === "review" && <SunView view={view} setView={setView} buildings={r.shaded ?? r.buildings}
      extra={<Button variant="glass" aria-pressed={showTrees} disabled={!trees.length} onClick={() => setShowTrees(!showTrees)}
        title={r.shade ? (trees.length ? `${trees.length} trees within 40 m, ${trees.filter((t) => t.shades).length} take the home's sun` : "No trees within 40 m") : "Trees are still loading"}>
        Trees{trees.length ? ` ${trees.length}` : ""}</Button>}
      below={showTrees && r.shade ? <div className="sunbox treenote">
        <p><i className="dot warm" />{trees.some((t) => t.shades) ? `${trees.filter((t) => t.shades).length} marked trees cast ${Math.round(trees.filter((t) => t.shades).reduce((a, t) => a + t.share, 0) * 100)}% of the trees' shade on the roof` : "No tree here casts much shade on the roof"}</p>
        {r.shade.surfaces.length > 0 && <ul>{r.shade.surfaces.map((x) => <li key={x.name}><span>{x.name}</span><b>−{Math.round(x.lost * 100)}% sun</b></li>)}</ul>}
        <p className="muted">{view.layer === "sun" ? "The sun on the roof includes their shade. Switch Trees off to see it without them." : "Show the sun to see their shade on the roof."}</p>
      </div> : view.layer === "sun" && r.shade && trees.some((t) => t.shades) ? <p className="sunbox treenote muted">Sun without the trees. Switch Trees on to add their shade.</p> : null} />}
    <aside className="panel tall desk">
      <header className="deskhead">
        <IconButton label="Back to requests" onClick={back}><Back /></IconButton>
        <div className="grow"><h1>{splitLabel(r.label)[0]}</h1><p className="muted">{[splitLabel(r.label)[1], `${r.from} request`, r.ref].filter(Boolean).join(" · ")}</p></div>
        <span className={`reqstate ${r.status === "sent" ? "is-sent" : "is-open"}`}>{r.status === "sent" ? "Offer sent" : "Draft"}</span>
      </header>
      <div className="desktabs"><Segmented wide label="Sections" value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "home", label: "Home" }, { value: "design", label: "Design" }, { value: "cost", label: "Cost" }, { value: "checks", label: left ? `Checks ${left}` : "Checks" }, { value: "offer", label: "Offer" }]} /></div>
      <div className="deskbody">
        {!d && <DraftChain id={r.id} full />}
        {asks.map((x) => <AskCard key={x.id} x={x} tried={() => tryAsk(x)} done={() => answer(r.ref ?? "-", x.id)} />)}
        {change && <ChangeCard c={change} close={() => setChange(null)} />}
        {d && tab === "overview" && <><DeskSummary r={r} d={d} costs={costs} go={setTab} /><ConfirmCard r={r} d={d} confirm={confirm} setI={setI} confirmFacts={(keys) => update(r.id, { sources: { ...r.sources, ...Object.fromEntries(keys.map((k) => [k, "planner" as Source])) } })} more={() => setTab("home")} /><Brief points={warns.length} site={tasks.filter((c) => !done.includes(c.id)).length} open={() => setTab("checks")} /></>}
        {d && tab === "design" && <><PriorityNote r={r} d={d} roof={roof} panels={out?.panels ?? {}} set={(strict) => { mark(strict ? "Kept to the customer's area" : "Rest of the roof allowed"); update(r.id, { strict }); }} /><DesignTab d={d} first={first.current} r={r} setO={setO} review={<AgentPanel key={r.id} r={r} d={d} roof={roof} use={(o, label) => setO(o, label)} />}
            energy={<Fold title="Energy in a year" summary={`Makes ${d.energy.production_mwh.toFixed(1)} MWh against ${d.energy.total_mwh.toFixed(1)} MWh needed; ${d.energy.self_sufficiency_pct}% from own power`}><Energy d={d} inputs={r.inputs} measured={home} /></Fold>} apply={(label, x) => { mark(label); update(r.id, { inputs: { ...r.inputs, ...x.inputs }, overrides: { ...r.overrides, ...x.overrides }, sources: { ...r.sources, ...Object.fromEntries(Object.keys(x.inputs).map((k) => [k, "planner"])) } }); }} lit={lit} scores={scores} /></>}
        {tab === "home" && <><Facts r={r} d={d} setI={setI} />{d && !home && <><h3>Roof</h3><NoHomeRoof r={r} /></>}{d && home && <><h3>Roof</h3><div className="drawtools" role="group" aria-label="Where modules go">
          <Button aria-pressed={tool === "draw"} onClick={() => setTool(tool === "draw" ? null : "draw")}>Draw an area</Button>
          <Button aria-pressed={tool === "surface"} onClick={() => setTool(tool === "surface" ? null : "surface")}>Whole surface</Button>
          {r.strict && <Button variant="plain" onClick={() => { mark("Whole roof allowed again"); update(r.id, { priority: undefined, strict: false }); }}>Use the whole roof</Button>}
          <small>{tool ? "On the model: draw around modules to take them off, or around free roof to give it to them. The design follows each stroke." : "Choose a tool to change where modules go on the model."}</small>
        </div><Obstacles buildings={r.shaded ?? r.buildings} obstacles={r.obstacles} auto={photo} hover={setHotObs} set={(obstacles, label) => { mark(label); update(r.id, withPhotoSolar(r, obstacles)); }} /><RoofTab r={r} roof={roof} d={d} off={r.off} panels={out?.panels ?? {}} toggle={toggle} face={face} setFace={setFace} view={view} setView={setView} /></>}</>}
        {d && tab === "cost" && (pricing ? <PriceBook installer={r.inputs.installer} close={() => setPricing(false)} />
          : <CostTab c={costs} failed={costsFailed} money={moneyOf(r)} setMoney={(money: Money) => update(r.id, { money } as Partial<Request>)} sent={r.status === "sent"}
            use={(change: Record<string, unknown>, label: string) => setO(change as Overrides, label)} prices={() => setPricing(true)} />)}
        {d && tab === "checks" && <Checks r={r} d={d} confirm={confirm} checks={checks} done={done} setDone={setDone} warns={warns.map((n) => ({ code: n.code, text: n.text }))}
          confirmFacts={(keys) => update(r.id, { sources: { ...r.sources, ...Object.fromEntries(keys.map((k) => [k, "planner" as Source])) } })} change={() => setTab("overview")} />}
        {d && tab === "offer" && <Offer r={r} d={d} costs={costs} first={first.current} roof={roof} panels={out?.panels ?? {}} toConfirm={confirm.length} allowed={allowed} setAllowed={(a) => update(r.id, { allowed: a } as Partial<Request>)} send={send}
          conditions={tasks.filter((c) => !done.includes(c.id)).map((c) => c.title)}
          facts={[...relevant(r, d).map((k) => [FACT[k], fmt(r, k, d), SOURCE_LONG[r.sources[k]]] as [string, string, string]),
            ...EXTRA.filter((k) => !r.sources[k] && sourceOf(r, k) && (r.inputs.ev || !k.startsWith("ev_") && k !== "has_wallbox") && (d.heatpump.included || !["living_m2", "built"].includes(k))).map((k) => [FACT[k], fmt(r, k, d), SOURCE_LONG[sourceOf(r, k)!]] as [string, string, string]), home ? ["Roof", `${roof.length} measured ${roof.length === 1 ? "surface" : "surfaces"}`, "measured, Bavarian 3D buildings"] : ["Roof", r.roofNumbers ? roofWords(r.roofNumbers) : "not shared", r.roofNumbers ? (r.roofNumbers.told ? "from the customer's description" : "from the customer, rounded") : "to be confirmed"]]} />}
      </div>
      {/* The one main action, always in reach. The way back is the arrow at the top left only: a second "Requests" button here read as a new request. */}
      <div className="stick">
        {r.status === "sent" ? <Button variant="solid" size="lg" wide disabled>Offer sent</Button>
          : confirm.length ? <Button variant="solid" size="lg" wide disabled={!d} onClick={() => setTab("overview")}>Confirm {confirm.length} {confirm.length === 1 ? "fact" : "facts"} to send</Button>
          : home && photo === "looking" ? <Button variant="solid" size="lg" wide disabled><span className="spinner" aria-hidden="true" />Checking the roof photo</Button>
          : <Button variant="solid" size="lg" wide disabled={!d} onClick={send}>Send offer</Button>}
      </div>
    </aside>
  </main>;
}

/** Where the modules sit against the area the homeowner marked as their priority. The marked area comes first; when the
 * design needs more, the rest of the roof is used and the planner sees it, and can keep to the customer's area instead. */
function PriorityNote({ r, d, roof, panels, set }: { r: Request; d: Design; roof: Spot[]; panels: Record<string, number>; set: (strict: boolean) => void }) {
  if (!r.priority || !Object.keys(r.priority).length) return null;
  const use = roof.filter((x) => !r.off.includes(x.key)), room = use.reduce((a, x) => a + x.inside, 0);
  const outside = use.reduce((a, x) => a + Math.max(0, (panels[x.key] ?? 0) - x.inside), 0);
  if (r.strict) return <div className="prio">
    <p className="small muted">Kept to the area the customer marked: room for {room} {room === 1 ? "module" : "modules"}{d.pv.capped ? `, so the design stops at ${d.pv.modules}; the engine wanted more` : ""}.</p>
    <Button variant="plain" onClick={() => set(false)}>Use the rest of the roof too</Button>
  </div>;
  if (!outside) return <p className="small muted">All {d.pv.modules} modules sit on the area the customer marked (room for {room}).</p>;
  return <div className="prio">
    <p className="flag">The customer marked room for {room} {room === 1 ? "module" : "modules"}. The design needs {d.pv.modules}, so {outside} {outside === 1 ? "goes" : "go"} on parts they did not mark. Tell the customer why, or keep to their area.</p>
    <Button variant="plain" onClick={() => set(true)}>Keep to their area</Button>
  </div>;
}

/** The first ten seconds: what is proposed, why in three lines, and what is still open. Written from the engine's numbers by template, no language model. */
function whyOf(r: Request, d: Design) {
  const s = d.similar, why: string[] = [];
  why.push(d.pv.locked ? `Solar is fixed by you at ${d.pv.modules} modules.` : d.pv.capped ? `The roof limits solar to ${d.pv.modules} modules; the engine wanted more.` : `${d.energy.existing_kwp ? `Solar sized for the ${Math.max(0, d.energy.total_mwh - (d.energy.existing_mwh ?? 0)).toFixed(1)} MWh a year the existing ${d.energy.existing_kwp} kWp leaves of ${d.energy.total_mwh.toFixed(1)}` : `Solar sized for ${d.energy.total_mwh.toFixed(1)} MWh a year`}.`); // what experts chose for similar homes is in the table above
  if (d.pv.max_modules) why.push(`${d.pv.modules} of ${d.pv.max_modules} modules that fit on the ${r.buildings.length ? "measured roof, best sun first" : `described roof (about ${Math.round(r.inputs.area_m2 ?? d.pv.max_modules * 2)} m² on the main side)`}. Makes about ${d.energy.production_mwh.toFixed(1)} MWh a year.`);
  why.push(d.battery.locked ? (d.battery.kwh ? `Battery set by you at ${d.battery.kwh} kWh.` : "No battery, your choice.") : d.battery.kwh ? `${d.battery.kwh} kWh battery: ${s.battery_rate}% of similar homes bought one${d.battery.unsure ? ", but this call is open" : ""}.` : r.inputs.has_storage ? `The home already has a battery${r.existing.battery_kwh ? ` of ${r.existing.battery_kwh} kWh` : ""}, so none is added; the new system charges it too.` : `No battery proposed, though ${s.battery_rate}% of similar homes bought one.`);
  if (r.inputs.goal) why.push(`The customer puts ${label(GOAL, r.inputs.goal).toLowerCase()} first; the engine leans on it.`);
  return why;
}

/** Why a fact is assumed, and what it moves: the same words in the confirm card wherever it shows. */
const factWhy = (r: Request, k: string) => k === "demand_kwh" && r.inputs.demand_source && r.inputs.demand_source !== "bill" && r.inputs.demand_source !== "unknown" ? "Not from a bill. " : k === "heat_kwh" && r.inputs.gas_eur ? `Worked out from €${Math.round(r.inputs.gas_eur).toLocaleString("en")} of gas a year at ${GAS_CT} ct per kWh all in. ` : "Assumed: nobody gave this. ";
const factWhat = (k: string) => k === "demand_kwh" ? "Solar and battery follow it." : k === "heat_kwh" ? "It sizes the heat pump." : k === "price_ct_kwh" ? "It sets the saving." : k === "living_m2" ? "Estimated from the 3D model; the heat estimate, and so the heat pump, follows it." : k === "built" ? "The customer did not say; the census's most common period nearby stands in for the heat estimate." : "It changes the design.";
/** Facts a planner can correct right in the card: a number. Others open the Home tab, where their own control is. */
const EDITS: Record<string, { step: number; unit: string }> = { demand_kwh: { step: 100, unit: "kWh a year" }, price_ct_kwh: { step: 0.5, unit: "ct per kWh" }, heat_kwh: { step: 500, unit: "kWh a year" }, ev_km: { step: 1000, unit: "km a year" }, living_m2: { step: 5, unit: "m²" } };

/** Before sending: every assumed fact the design uses, where the planner lands. Confirm it as it is, or correct it in place;
 *  a corrected value is the planner's, so it counts as confirmed, and the design follows. Sending waits until none is left. */
function ConfirmCard({ r, d, confirm, confirmFacts, setI, more }: { r: Request; d: Design; confirm: string[]; confirmFacts: (keys: string[]) => void; setI: (c: Partial<Inputs>, by?: Source, label?: string) => void; more: () => void }) {
  const [editing, setEditing] = useState<string | null>(null), [val, setVal] = useState("");
  if (!confirm.length) return <p className="confirmdone">✓ Every fact the design uses is from the customer or confirmed by you.</p>;
  const save = (k: string) => {
    const v = Number(val);
    if (!Number.isFinite(v) || v <= 0) return;
    setI((k === "demand_kwh" ? { demand_kwh: v, demand_source: "bill" } : { [k]: v }) as Partial<Inputs>, "planner", `${FACT[k]} set to ${v.toLocaleString("en")} ${EDITS[k].unit}`);
    setEditing(null);
  };
  return <section className="confirmcard" aria-label="Before sending">
    <header><div><h3>Before sending · {confirm.length} {confirm.length === 1 ? "fact" : "facts"} to confirm</h3><small>The customer did not give {confirm.length === 1 ? "this" : "these"}. Confirm, or correct the value: the design follows.</small></div>
      {confirm.length > 1 && <Button variant="solid" onClick={() => confirmFacts(confirm)}>Confirm all</Button>}</header>
    <ul className="tasks">{confirm.map((k) => <li key={k} className="confirm">
      <div><b>{FACT[k]}: {fmt(r, k, d)}</b><small>{factWhy(r, k)}{factWhat(k)}</small>
        {editing === k && <form className="factedit" onSubmit={(e) => { e.preventDefault(); save(k); }}>
          <Input type="number" aria-label={FACT[k]} autoFocus step={EDITS[k].step} value={val} onChange={(e) => setVal(e.target.value)} /><span>{EDITS[k].unit}</span>
          <Button type="submit" variant="solid">Save</Button><Button variant="plain" onClick={() => setEditing(null)}>Cancel</Button>
        </form>}
      </div>
      {editing !== k && <><Button onClick={() => confirmFacts([k])}>Confirm</Button>
        <Button variant="plain" onClick={() => { if (EDITS[k]) { setEditing(k); setVal(String((r.inputs as unknown as Record<string, unknown>)[k] ?? "")); } else more(); }}>Edit</Button></>}
    </li>)}</ul>
  </section>;
}

/** What is still open. The system itself is in the tiles above, so it is not said again here. */
function Brief({ points, site, open }: { points: number; site: number; open: () => void }) {
  const items = [points && `${points} review ${points === 1 ? "point" : "points"}`, site && `${site} site ${site === 1 ? "check" : "checks"} before installing`].filter(Boolean);
  if (!items.length) return null;
  return <section className="brief"><Button variant="plain" onClick={open}>Open: {items.join(" · ")} →</Button></section>;
}

const roofWords = (n: RoofNumbers) => `${n.m2 ? `about ${n.m2} m² of roof` : "roof size not known"}, ${n.facing === "flat" ? "flat" : n.facing === "unknown" ? `direction not known, ${n.tilt}° steep` : `facing ${n.facing}, ${n.tilt}° steep`}`;
/** How the roof numbers came: the customer's own words, or rounded from the 3D home they kept. */
const roofOrigin = (n: RoofNumbers) => (n.told ? "as the customer described it" : "rounded so it points to no address");
const addressOf = (r: Request) => (r.buildings.length ? null : r.label !== "Home not shared" ? r.label : null);

/** Where the 3D home would stand: the homeowner kept it, so the desk says so and shows what came instead. */
function NoHomeStage({ r }: { r: Request }) {
  const address = addressOf(r);
  return <div className="nohome-stage"><div><b>{address ? "No 3D home" : "Home not shared"}</b><p>{address ? `The customer gave the address ${address} but no building on the map. ` : ""}{r.roofNumbers ? `The roof: ${roofWords(r.roofNumbers)}, ${roofOrigin(r.roofNumbers)}.` : address ? "No roof was described." : "The customer kept the address, the building and the roof to themselves."} The design runs from their answers.</p></div></div>;
}
function NoHomeRoof({ r }: { r: Request }) {
  return r.roofNumbers
    ? <><dl className="nohome-roof"><div><dt>Area</dt><dd>{r.roofNumbers.m2 ? `~${r.roofNumbers.m2} m²` : "not known"}</dd></div><div><dt>Facing</dt><dd>{r.roofNumbers.facing}</dd></div><div><dt>Tilt</dt><dd>{r.roofNumbers.facing === "flat" ? "flat" : `~${r.roofNumbers.tilt}°`}</dd></div></dl>
      <p className="small muted">{r.roofNumbers.told ? "As the customer described it." : "Rounded by the customer's page."} {r.roofNumbers.m2 ? (r.roofNumbers.facing === "flat" ? "The area limits the solar size." : `Half of it, about ${Math.round(r.roofNumbers.m2 / 2)} m² on the main side, limits the solar size.`) : "No size was given, so nothing limits the solar size yet."} {r.roofNumbers.facing === "unknown" ? "The direction is not known, so the yield is a typical German 950 kWh per kWp" : "The yield is PVGIS's for this direction and slope in Munich, without shade,"} until the roof is confirmed.</p></>
    : <p className="small muted">The customer shared no roof. The solar size follows the household's needs alone, with no roof limit and a typical yield.</p>;
}

function checkList(r: Request, d: Design, monument: Monument | null, heatPlan: HeatPlan | null, shade: Shade | null, spot?: Place | null) {
  const list: SiteCheck[] = [];
  const dist = r.inputs.heat_dist;
  if (d.heatpump.included) list.push({ id: "flow", title: "Check radiators and flow temperature", why:
    dist === "floor" ? "The customer has underfloor heating, which usually suits a heat pump. Confirm the flow temperature it needs in winter."
    : dist === "radiators" ? "The customer heats with radiators. Check the flow temperature they need in winter; some may have to be larger."
    : dist === "both" ? "The customer has underfloor heating and radiators. The radiators set the flow temperature: check them."
    : "The customer did not say how the rooms are heated. Usually needs a site visit." });
  const home = r.buildings.length > 0;
  if (!home) list.unshift({ id: "noroof", title: r.roofNumbers ? (r.roofNumbers.told ? "Roof only described: confirm size and direction" : "Roof not shared: confirm size and direction") : "Home not shared: ask for the roof", why: r.roofNumbers
    ? `${r.roofNumbers.told ? "The customer described the roof" : "The customer kept the home and sent only rounded roof numbers"}: ${roofWords(r.roofNumbers)}. The design takes ${!r.roofNumbers.m2 ? "no area limit" : r.roofNumbers.facing === "flat" ? "the area as its limit" : `half the area, the main side, as its limit`} and ${r.roofNumbers.facing === "unknown" ? "a typical yield, as the direction is not known" : "PVGIS's yield for that direction and slope, without shade"}. Confirm size, direction and shade with them${addressOf(r) ? "" : ", or ask for the address"}.`
    : addressOf(r) ? "The customer gave the address but no building and no roof. The design has no roof limit and a typical yield. Ask for the roof's size and direction." : "The customer kept the home and the roof to themselves. The design has no roof limit and a typical yield. Ask for the roof's size and direction, or the address." });
  const blind = roofOf(r.buildings, r.installed).filter((x) => x.s.kwh_per_kwp == null).length;
  if (blind) list.unshift({ id: "sun", title: `Sun data is missing for ${blind} ${blind === 1 ? "surface" : "surfaces"}`, why: "PVGIS did not answer. A typical yield stands in, so production is less certain. Reopen the request to try again." });
  if (home) list.push(shadeCheck(shade));
  const seen = (r.obstacles ?? []).filter((o) => o.on);
  if (home) list.push({ id: "roof", title: "Check the roof for obstacles", why: r.obstacles
    ? `${seen.length ? `${seen.length} found on the aerial photo and kept clear (${[...new Set(seen.map((o) => KIND[o.kind].toLowerCase()))].join(", ")}). ` : "The aerial photo showed nothing on the roof. "}A photo misses what is small or hidden: check on site.`
    : "Roof windows, chimneys and dormers are not in the measured model. Let the photo check in Roof look for them, or look at the photo yourself." });
  list.push({ id: "state", title: "Check the roof's condition", why: "Age and load-bearing are not in our data." });
  const i = r.inputs;
  list.push(i.owner === "shared" ? { id: "who", title: "Owners' association must agree", why: "The customer shares the home with other owners. Solar on a shared roof needs their decision first." }
    : i.owner === "tenant" ? { id: "who", title: "The landlord must agree", why: "The customer rents the home. Talk to the owner before planning further." }
    : i.owner === "sole" ? { id: "who", title: "Confirm who signs", why: "The customer says they or their family own the home alone." }
    : { id: "who", title: "Who decides, and who owns the home?", why: "The customer did not say." });
  if (i.solar_thermal) list.push({ id: "thermal", title: "Hot water collectors on the roof", why: "The customer has solar collectors for hot water. Their area is left out; check where they sit and whether they stay." + (i.has_solar ? " The marked area also holds solar panels, so a size from the area is too high." : "") });
  if (i.backup) list.push({ id: "backup", title: "Backup power wanted", why: "Pick an inverter and battery that can run the home in an outage, with a backup box. About 1 in 7 past projects had one." });
  if (home) {
    list.push(monumentCheck(monument));
    if (r.inputs.heating !== "Heatpump") list.push(heatPlanCheck(heatPlan, r.inputs.heating, d.heatpump.included));
  } else if (spot) {
    list.push({ id: "place", title: "Check trees that shade the roof", why: `The address was found on the map (${spot.label}), but trees are put on the roof's sun through the 3D home, which was not picked. Look at the photo of ${addressOf(r)}.` });
    list.push(monumentCheck(monument));
    if (r.inputs.heating !== "Heatpump") list.push(heatPlanCheck(heatPlan, r.inputs.heating, d.heatpump.included));
  } else list.push({ id: "place", title: spot === undefined && addressOf(r) ? "Finding the address…" : "Trees, monument and heat plan need the address", why: addressOf(r) ? (spot === null ? `The address ${addressOf(r)} was not found in the region, so trees, monument protection and Munich's heat plan could not be looked up. Check them there yourself.` : `Looking up ${addressOf(r)} on the map.`) : "Shade from trees, monument protection and Munich's heat plan are looked up from the home. Check them once the customer shares the address." });
  list.push({ id: "grid", title: "Check the grid connection and meter cabinet", why: r.meterPhoto ? "The customer sent a photo of the meter cabinet, below. The grid connection is not in our data." : "Not in our data. No photo of the meter cabinet was sent." });
  // KfW 458 speed bonus (secondary sources, November 2026): oil, coal and electric storage heating at any age, gas once 20 years
  // in use, for owners living in the home. Its rate falls every half year from July 2026, so no figure is shown.
  const age = r.inputs.boiler_age, heat = r.inputs.heating;
  const speed = heat === "Oil" || heat === "Electric" ? "The speed bonus can apply to replacing this heating at any age."
    : heat === "Gas" && age === "over20" ? "The customer says the gas boiler is over 20 years old, so the speed bonus can apply."
    : heat === "Gas" && age ? "The customer says the gas boiler is under 20 years old: no speed bonus until it is."
    : heat === "Gas" ? "The speed bonus needs a gas boiler 20 years in use; ask for the year on its type plate." : "";
  list.push({ id: "grants", title: "Check grants", why: (speed ? `${speed} Only for owners living in the home; its rate falls every half year, check KfW 458. ` : "") + "Other grants depend on the customer." });
  list.push(d.pv.kwp > 7
    ? { id: "meter", title: "Order the smart meter and control box", why: "Required above 7 kWp (about €100 a year, counted in the Cost tab). Until they are fitted, the system may feed at most 60% of its power to the grid." }
    : { id: "meter", title: "Smart meter and grid feed limit", why: "Up to 7 kWp no smart meter is required, but without one the system may feed at most 60% of its power to the grid for good. The Cost tab counts what that loses." });
  return list;
}

/** Trees from Bavaria's tree map on the roof's sun, worded as a check. Their loss is already in the yield, the design and the energy check. */
function shadeCheck(t: Shade | null): SiteCheck {
  if (!t) return { id: "trees", title: "Check trees that shade the roof", why: "Putting trees from Bavaria's tree map on the roof's sun…" };
  const m = (v: number | null) => (v == null ? "" : `${Math.round(v)} m`);
  const side = (name: string) => name.toLowerCase().replace(/^roof, /, "").replace(/ side$/, "");
  const which = t.surfaces.map((s) => `${side(s.name)} ${Math.round(s.lost * 100)}%`).join(", ");
  const trees = `${t.trees} ${t.trees === 1 ? "tree" : "trees"} up to ${m(t.tallest)}, the closest ${m(t.nearest)} away (Bavaria's tree map)`;
  const after = "Already in the yield. Ask whether the trees stay: without them the roof gets more.";
  if (t.status === "much") return { id: "trees", title: "Trees shade the roof", why: `${trees}. Sun lost a year: ${which}. ${after}` };
  if (t.status === "some") return { id: "trees", title: "Trees take some of the roof's sun", why: `${trees}. Sun lost a year: ${which}. ${after}` };
  if (t.status === "none") return { id: "trees", info: true, title: "No tree takes the roof's sun", why: "No tree on Bavaria's tree map (2024) takes more than a trace of the roof's sun. Trees under 5.5 m and newer ones are not on it." };
  return { id: "trees", title: "Check trees that shade the roof", why: "Bavaria's tree map could not be loaded, so the roof's sun leaves trees out. Look for trees on the photo." };
}

/** What Munich's heat plan says at the home, worded as a check. Where a heat network is coming, a heat pump may be the wrong offer. */
function heatPlanCheck(p: HeatPlan | null, heating: string | null, heatPump: boolean): SiteCheck {
  const more = p?.details.length ? `. The plan notes: ${p.details.join("; ")}` : "";
  if (!p) return { id: "heatplan", title: "Check the city's heat plan", why: "Asking Munich's heat plan map…" };
  if (p.area === "network") return { id: "heatplan", title: "Heat network area in the city's heat plan", why: `The city's heat plan puts this home in a heat network area${more}.` +
    (heating === "District" ? " The home already has district heating." : heatPump ? " The design has a heat pump: compare it with a district heating connection before offering it." : " If a heat pump comes up, compare it with a district heating connection first.") };
  if (p.area === "own") return { id: "heatplan", info: true, title: "Heat plan: homes here heat on their own", why: `The city's heat plan expects homes here to have their own heating, mostly heat pumps, and plans no heat network${more}.` };
  if (p.area === "other") return { id: "heatplan", title: "Check the city's heat plan", why: /prüf/i.test(p.label ?? "") ? `The city's heat plan has not decided this area yet (Prüfgebiet)${more}. A heat network may still come: ask the city or SWM before offering a heat pump.` : `The city's heat plan marks this home as: ${p.label}${more}.` };
  if (p.area === "none") return { id: "heatplan", title: "Check the city's heat plan", why: "No heat plan area found at this home. The plan covers the city of Munich only." };
  return { id: "heatplan", title: "Check the city's heat plan", why: "Munich's heat plan map did not answer. Look the address up in the Geoportal München." };
}

/** What the Bavarian monument map says, worded as a check. Never a ruling: the lower monument authority decides. */
function monumentCheck(m: Monument | null): SiteCheck {
  const named = (h: { name: string | null; address: string | null; id: string | null }) => [h.name, h.address].filter(Boolean).join(", ") + (h.id ? ` (${h.id})` : "");
  const listed = m?.here.filter((h) => h.kind === "listed") ?? [], ensemble = m?.here.filter((h) => h.kind === "ensemble") ?? [];
  const authority = "Ask the lower monument authority before planning further; panels usually need a permit and may have to stay out of sight.";
  if (!m) return { id: "monument", title: "Check monument status", why: "Asking the Bavarian monument map…" };
  if (m.status === "listed") return { id: "monument", title: "Listed building: permit needed", why: `The Bavarian monument list has this building: ${listed.map(named).join("; ")}.` + (ensemble.length ? ` It also lies in the ensemble ${ensemble.map(named).join("; ")}.` : "") + ` ${authority}` };
  if (m.status === "ensemble") return { id: "monument", title: "In a protected ensemble: permit likely", why: `The home lies in the ensemble ${ensemble.map(named).join("; ")}. Solar visible from the street usually needs a permit. ${authority}` };
  if (m.status === "near") return { id: "monument", title: "Listed building next door", why: `Within about 20 m: ${m.near.map(named).join("; ")}. Its setting can be protected, so panels in view of it may need a permit. Ask the lower monument authority.` };
  if (m.status === "none") return { id: "monument", info: true, title: "No monument entry here", why: "No entry in the Bavarian monument list at this home or next to it. A hint, not a ruling: the lower monument authority decides." };
  return { id: "monument", title: "Check monument status", why: "The Bavarian monument map did not answer. Look the address up in the Bayerischer Denkmal-Atlas." };
}

function DesignTab({ d, first, r, setO, apply, lit, scores, review, energy }: { d: Design; first: Design | null; r: Request; setO: (c: Overrides, label?: string) => void; apply: (label: string, x: { inputs: Partial<Inputs>; overrides: Overrides }) => void; lit: string[]; scores: Scores | null; review: React.ReactNode; energy: React.ReactNode }) {
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
  const changed = first && summary(first, r) !== summary(d, r);
  const why = whyOf(r, d);
  return <>
    {changed && <p className="delta"><span>AI draft</span> {summary(first, r)}<br /><span>Now</span> {summary(d, r)}</p>}
    {d.review.filter((n) => n.level === "warn").map((n) => <p key={n.code} className="flag">{n.text}</p>)}
    <section className="syscard" aria-label="The system">
      <header><h3>The system</h3><small>Auto follows the engine; your choice stays until you set it back.</small></header>
      <table className="grid"><thead><tr><th /><th>Proposal</th><th>Similar homes</th><th>Your decision</th></tr></thead><tbody>
      <tr><th scope="row">Solar</th><td>{d.pv.modules} modules<small>{kwp.toFixed(1)} kWp{d.pv.capped ? " · roof limit" : ""}</small></td><td>{s.kwp_low}–{s.kwp_high} kWp<small>{s.n} homes</small></td>
        <td><div className="lock"><Slider min={Math.min(4, d.pv.modules)} max={Math.max(d.pv.max_modules ?? 40, d.pv.modules + 10, 4)} value={o.modules ?? d.pv.modules} onChange={(e) => setO({ modules: Number(e.target.value) })} /><Button disabled={o.modules == null} onClick={() => setO({ modules: null })}>Auto</Button></div></td></tr>
      <tr><th scope="row">Battery</th><td>{r.inputs.has_storage ? "Already there" : d.battery.kwh ? `${d.battery.kwh} kWh` : "None"}{!r.inputs.has_storage && <small>{d.battery.locked ? `your choice · engine ${d.battery.probability}% for one` : `${d.battery.probability}% likely`}</small>}</td><td>{s.battery_rate}% have one<small>often {s.battery_common.join(", ")} kWh</small></td>
        <td><Select aria-label="Battery" value={o.battery_kwh == null ? "auto" : String(o.battery_kwh)} onChange={(e) => setO({ battery_kwh: e.target.value === "auto" ? null : Number(e.target.value) })}><option value="auto">Auto</option><option value="0">None</option>{[...d.battery.choices, ...(o.battery_kwh && !d.battery.choices.includes(o.battery_kwh) ? [o.battery_kwh] : [])].map((c) => <option key={c} value={c}>{c} kWh</option>)}</Select></td></tr>
      <tr><th scope="row">Wallbox</th><td>{d.wallbox.included ? "Included" : "None"}</td><td>{s.wallbox_rate}% have one</td>
        <td><Segmented wide label="Wallbox" value={three(o.wallbox)} onChange={(v) => setO({ wallbox: from3(v) })} options={[{ value: "auto", label: "Auto" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></td></tr>
      <tr><th scope="row">Heat pump</th><td>{d.heatpump.included ? `${d.heatpump.kw} kW` : "None"}<small>{hpWhy(r, d, o)}</small></td><td>Too few sold<small>to compare</small></td>
        <td><Segmented wide label="Heat pump" value={three(o.heatpump)} onChange={(v) => setO({ heatpump: from3(v) })} options={[{ value: "auto", label: "Auto" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></td></tr>
    </tbody></table>
      <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask(); }}>
      <label htmlFor="askbox-text">Something changed? Say it in a sentence; the engine sizes again and the card says what moved.</label>
      <Input id="askbox-text" placeholder="e.g. they are buying an electric car" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit">Apply</Button>
    </form>
      {said && <p className="small muted">{said}</p>}
    </section>
    <Options d={d} pick={(a) => setO(a.overrides, `Option: ${a.title.toLowerCase()}`)} />
    <h3 className="desk-sub">Details<small>Open what you want to check; nothing here needs doing.</small></h3>
    {!r.inputs.has_storage && curveOf(d).length > 1 && <Fold title="Battery sizes" summary="Own power and money for each size the installer sells; click one to use it">
      <BatteryCurve d={d} pick={(kwh) => setO({ battery_kwh: kwh })} /></Fold>}
    <Fold title="Why this design" summary={why[0]}>
      <ul className="why">{why.map((w) => <li key={w}>{w}</li>)}</ul>
      <h3>How the engine decided</h3>
      <Trace steps={d.trace} sources={r.sources} lit={lit} />
      {d.review.filter((n) => n.level === "note").map((n) => <p key={n.code} className="small muted">{n.text}</p>)}
      {engine && <p className="small muted trust">How far to trust a first draft: on {Math.round(engine.n)} past projects at this installer, it landed within 20% of the expert's size {Math.round(engine.kwp_within20 * 100)}% of the time. That is why you decide.</p>}
      <small className="muted">Written from the engine's numbers by template, not by a language model.</small>
    </Fold>
    {review}
    <Fold title="What past projects support" summary="Where this draft sits among similar homes, and what would narrow the range">
      <EvidenceCard d={d} plain onForget={() => setO({}, "Learned offers forgotten")} />
    </Fold>
    {energy}
    <Validate r={r} d={d} />
  </>;
}

function RoofTab({ r, roof, d, off, panels, toggle, face, setFace, view, setView }: { r: Request; roof: Spot[]; d: Design; off: string[]; panels: Record<string, number>; toggle: (k: string) => void; face: Face | null; setFace: (f: Face | null) => void; view: View; setView: (v: View) => void }) {
  const fits = roof.filter((x) => !off.includes(x.key)).reduce((a, x) => a + x.fits, 0);
  return <>
    <p className="small muted">The map's top left shows the photo, the year's sun or one hour's, and the trees.</p>
    <table className="grid surfaces"><thead><tr><th /><th>Facing</th><th>Tilt</th><th>Area</th><th>Shade</th><th>kWh/kWp</th>{r.priority && Object.keys(r.priority).length > 0 && <th>Marked</th>}<th>Fits</th><th>Placed</th></tr></thead><tbody>
      {roof.map((x) => { const me = { building: x.b.id, poly: x.poly }; return <tr key={x.key} className={face?.building === me.building && face.poly === x.poly ? "on" : ""} onMouseEnter={() => setFace(me)} onMouseLeave={() => setFace(null)}>
        <td><Check checked={!off.includes(x.key)} onChange={() => toggle(x.key)}>{""}</Check></td><td>{facing(x.s)}</td><td>{x.s.tilt}°</td><td>{Math.round(x.s.m2)} m²</td><td>{x.s.kwh_per_kwp == null ? "?" : `${Math.round(x.shade * 100)}%`}</td><td>{x.s.kwh_per_kwp == null ? `~${x.yield_}` : x.yield_}</td>{r.priority && Object.keys(r.priority).length > 0 && <td>{x.inside}</td>}<td>{x.fits}</td><td><b>{panels[x.key] ?? 0}</b></td>
      </tr>; })}
    </tbody></table>
    <p className="small muted">{d.pv.modules} of {fits} modules used. Modules fill the best-yielding surfaces first, 40 cm from every edge. Click a roof on the model to take it out. Obstacles are not in the measured model, so look at the photo before you trust "Fits".</p>
    {r.installed.length > 0 && <p className="small muted">{r.installed.length} {r.installed.length === 1 ? "surface already carries" : "surfaces already carry"} panels and stay out of this design.</p>}
    {r.walls.length > 0 && <p className="flag">The customer asked about {r.walls.length} {r.walls.length === 1 ? "wall" : "walls"}. Accept or decline this with them: walls are not in the design.</p>}
  </>;
}

/** A fact with its source. A button group gets no <label> around it: a label would name every button after the
 * whole question, and a click on the question would press the first button. The group carries its own name. */
// Site checks by what they are about, in the order a planner works through them.
const CHECK_GROUPS: [string, string[]][] = [
  ["Roof and site", ["trees", "place", "sun", "roof", "state", "noroof", "monument", "thermal"]],
  ["Grid and electrics", ["grid", "meter", "backup"]],
  ["Heating", ["flow", "heatplan"]],
  ["Customer and paperwork", ["who", "grants"]],
];
type SiteCheck = { id: string; title: string; why: string; info?: boolean }; // info: found for the planner, nothing to do on site

/** Before sending, the facts to confirm; before installing, the site checks by topic; both with how far along they are. */
function Checks({ r, d, confirm, checks, done, setDone, warns, confirmFacts, change }: { r: Request; d: Design; confirm: string[]; checks: SiteCheck[]; done: string[]; setDone: (x: string[]) => void;
  warns: { code: string; text: string }[]; confirmFacts: (keys: string[]) => void; change: () => void }) {
  const tasks = checks.filter((c) => !c.info), found = checks.filter((c) => c.info);
  const ticked = tasks.filter((c) => done.includes(c.id)).length;
  const known = new Set(CHECK_GROUPS.flatMap(([, ids]) => ids));
  const groups: [string, SiteCheck[]][] = [...CHECK_GROUPS.map(([t, ids]) => [t, tasks.filter((c) => ids.includes(c.id))] as [string, SiteCheck[]]), ["Other", tasks.filter((c) => !known.has(c.id))] as [string, SiteCheck[]]].filter(([, l]) => l.length);
  return <>
    <div className="progress">
      <div className={confirm.length ? "todo" : "ok"}><span>Before sending</span><b>{confirm.length ? `${confirm.length} ${confirm.length === 1 ? "fact" : "facts"} to confirm` : "Every fact confirmed"}</b></div>
      <div className={ticked === tasks.length ? "ok" : ""}><span>Before installing</span><b>{ticked} of {tasks.length} site checks done</b><i><em style={{ width: `${tasks.length ? (ticked / tasks.length) * 100 : 100}%` }} /></i></div>
    </div>
    {confirm.length > 0 && <Button variant="plain" className="tofacts" onClick={change}>Confirm the {confirm.length} {confirm.length === 1 ? "fact" : "facts"} first, in Overview →</Button>}
    {warns.length > 0 && <><h3>Points from the review</h3>{warns.map((n) => <p key={n.code} className="flag">{n.text}</p>)}</>}
    <h3>To check on site</h3>
    <p className="checks-rule">Tick what you have checked. <b>Anything not ticked prints on the offer as a condition.</b></p>
    {groups.map(([title, list]) => <section key={title} className="checkgroup">
      <h4>{title}<small>{list.filter((c) => done.includes(c.id)).length} of {list.length}</small></h4>
      <ul className="tasks">{list.map((c) => <li key={c.id} className={done.includes(c.id) ? "done" : undefined}><Check checked={done.includes(c.id)} onChange={(v) => setDone(v ? [...done, c.id] : done.filter((x) => x !== c.id))}><b>{c.title}</b><small>{c.why}</small></Check></li>)}</ul>
    </section>)}
    {found.length > 0 && <section className="found" aria-label="Found for you">
      <h4>Found for you<small>nothing to do</small></h4>
      <ul>{found.map((c) => <li key={c.id}><b>{c.title}</b><small>{c.why}</small></li>)}</ul>
    </section>}
    {r.meterPhoto && <figure className="cabinet"><img src={r.meterPhoto} alt="The customer's meter cabinet" /><figcaption className="small muted">Meter cabinet, photo from the customer.</figcaption></figure>}
  </>;
}

function Tagged({ label, source, children }: { label: string; source?: Source; children: React.ReactNode }) {
  const group = isValidElement(children) && children.type === Segmented;
  return <div className={`fact${source ? ` is-${source}` : ""}`}>{group ? <div><span>{label}</span>{children}</div> : <label><span>{label}</span>{children}</label>}<em className={source}>{source ? SOURCE[source] : ""}</em></div>;
}
/** Where an answer came from: the request's own record, else the homeowner when they gave it. */
const sourceOf = (r: Request, k: string): Source | undefined => {
  if (r.sources[k]) return r.sources[k];
  if (k === "living_m2" && r.inputs.living_from_model) return "assumed";
  if (k === "built" && !r.inputs.built && r.inputs.area_built) return "assumed";
  const v = (r.inputs as unknown as Record<string, unknown>)[k];
  return v == null || (Array.isArray(v) && !v.length) ? undefined : r.from === "Homeowner" ? "customer" : undefined;
};

function Facts({ r, d, setI }: { r: Request; d?: Design; setI: (c: Partial<Inputs>) => void }) {
  const i = r.inputs, s = r.sources;
  const yn = (k: keyof Inputs, v: boolean | null | undefined) => <Segmented wide label={FACT[k]} value={v == null ? "" : v ? "yes" : "no"} onChange={(x) => setI({ [k]: x === "" ? null : x === "yes" } as Partial<Inputs>)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "", label: "Not given" }]} />;
  const num = (k: keyof Inputs, step: number) => <Input type="number" step={step} value={(i[k] as number | null | undefined) ?? ""} onChange={(e) => setI({ [k]: e.target.value ? Number(e.target.value) : null } as Partial<Inputs>)} />;
  const pick = (k: keyof Inputs, list: [string, string][]) => <Select value={(i[k] as string | null | undefined) ?? ""} onChange={(e) => setI({ [k]: e.target.value || null } as Partial<Inputs>)}>{list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
  const stand = d ? `${(d.energy.base_mwh * 1000).toLocaleString("en")} stands in` : "4,000 stands in";
  const more = ["home_day", "ev_kwh_month", "ev_charge_home", "ev_day", "has_wallbox", "boiler_age", "heat_dist", "hp_kwh", "living_m2", "cert_kwh_m2", "built", "goal", "monthly_eur"];
  const given = more.filter((k) => sourceOf(r, k) && sourceOf(r, k) !== "assumed").length, guessed = more.filter((k) => sourceOf(r, k) === "assumed").length;
  const all = Object.values(s), count = (x: Source) => all.filter((v) => v === x).length;
  return <>
  <div className="facttally" aria-label="Where the facts come from">
    <span className="is-assumed"><b>{count("assumed")}</b> assumed</span><span className="is-customer"><b>{count("customer")}</b> from the customer</span><span className="is-planner"><b>{count("planner")}</b> confirmed by you</span>
  </div>
  <div className="facts">
    <h3 className="span">Energy</h3>
    <Tagged label="Yearly electricity (kWh)" source={s.demand_kwh}><Input type="number" step={100} placeholder={stand} value={i.demand_kwh ?? ""} onChange={(e) => setI({ demand_kwh: e.target.value ? Number(e.target.value) : null, demand_source: e.target.value ? "bill" : i.demand_source })} /></Tagged>
    <Tagged label="Price (ct per kWh)" source={s.price_ct_kwh}><Input type="number" step={0.5} value={i.price_ct_kwh} onChange={(e) => setI({ price_ct_kwh: Number(e.target.value) })} /></Tagged>
    <Tagged label="Heating" source={s.heating}><Select value={i.heating ?? ""} onChange={(e) => setI({ heating: e.target.value || null })}>{HEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Tagged>
    <Tagged label="Yearly heat (kWh)" source={s.heat_kwh}><Input type="number" step={500} value={i.heat_kwh ?? ""} onChange={(e) => setI({ heat_kwh: e.target.value ? Number(e.target.value) : null })} /></Tagged>
    <h3 className="span">Car and what is already there</h3>
    <Tagged label="Electric car" source={s.ev}><Segmented wide label="Electric car" value={i.ev ? "yes" : "no"} onChange={(v) => setI({ ev: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    <Tagged label="Driving (km a year)" source={s.ev_km}><Input type="number" step={1000} value={i.ev_km} onChange={(e) => setI({ ev_km: Number(e.target.value) })} /></Tagged>
    <Tagged label="Existing solar" source={s.has_solar}><Segmented wide label="Existing solar" value={i.has_solar ? "yes" : "no"} onChange={(v) => setI({ has_solar: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    <Tagged label="Existing battery" source={s.has_storage}><Segmented wide label="Existing battery" value={i.has_storage ? "yes" : "no"} onChange={(v) => setI({ has_storage: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Tagged>
    {(i.has_solar || i.has_storage) && (r.existing.kwp || r.existing.m2 || r.existing.year || r.existing.battery_kwh) && <p className="small muted span">On the building: {[r.existing.kwp ? `${r.existing.kwp} kWp` : r.existing.m2 && `${r.existing.m2} m² of panels ${r.existing.photo ? "seen on the aerial photo" : "marked"}, size estimated from it`, r.existing.year && `from ${r.existing.year}`, r.existing.battery_kwh && `${r.existing.battery_kwh} kWh battery`].filter(Boolean).join(", ")}. The engine sizes the new system for the need the old one leaves.</p>}
    <Tagged label="Catalog"><Select value={i.installer} onChange={(e) => setI({ installer: e.target.value })}>{INSTALLERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Tagged>
    {((i.demand_source && i.demand_source !== "bill") || !!i.big_users?.length) && <p className="small muted span">Yearly use {i.demand_source ? USE_FROM[i.demand_source] ?? i.demand_source : "not given"}{i.monthly_eur ? ` (€${i.monthly_eur} a month)` : ""}.{i.big_users?.length ? ` Big users: ${fmt(r, "big_users", d as Design)}${i.demand_source === "bill" ? ", already in the bill." : ", added on top by the engine."}` : ""}{i.demand_source !== "bill" ? " A bill would be better." : ""}</p>}
  </div>
  <Fold title="More from the homeowner" summary={`${given} given${guessed ? `, ${guessed} assumed` : ""}: the day at home, heating details, the home's age and the customer's priority`}>
  <div className="facts">
    <Tagged label="Someone home in the day" source={sourceOf(r, "home_day")}>{pick("home_day", HOME_DAY)}</Tagged>
    {i.ev && <>
      <Tagged label="Car charged at home (kWh a month)" source={sourceOf(r, "ev_kwh_month")}>{num("ev_kwh_month", 10)}</Tagged>
      <Tagged label="Charging at home" source={sourceOf(r, "ev_charge_home")}>{pick("ev_charge_home", HOME_SHARE)}</Tagged>
      <Tagged label="Car charges in daytime" source={sourceOf(r, "ev_day")}>{yn("ev_day", i.ev_day)}</Tagged>
      <Tagged label="Wallbox already there" source={sourceOf(r, "has_wallbox")}>{yn("has_wallbox", i.has_wallbox)}</Tagged>
    </>}
    {["Gas", "Oil", "OtherNonRenewable"].includes(i.heating ?? "") && <Tagged label="Boiler age" source={sourceOf(r, "boiler_age")}>{pick("boiler_age", BOILER_AGE)}</Tagged>}
    {i.heating !== "Heatpump" && i.heating !== "District" && <Tagged label="Heats through" source={sourceOf(r, "heat_dist")}>{pick("heat_dist", HEAT_DIST)}</Tagged>}
    {i.heating === "Heatpump" && <Tagged label="Heat pump use now (kWh a year)" source={sourceOf(r, "hp_kwh")}>{num("hp_kwh", 500)}</Tagged>}
    <Tagged label={i.living_from_model && !s.living_m2 ? "Living area (m², from the 3D model)" : "Living area (m²)"} source={sourceOf(r, "living_m2")}><Input type="number" step={5} value={i.living_m2 ?? ""} onChange={(e) => setI({ living_m2: e.target.value ? Number(e.target.value) : null, living_from_model: false })} /></Tagged>
    <Tagged label="Energy certificate (kWh per m² a year)" source={sourceOf(r, "cert_kwh_m2")}>{num("cert_kwh_m2", 5)}</Tagged>
    <Tagged label="Built" source={sourceOf(r, "built")}>{pick("built", BUILT)}</Tagged>
    {!i.built && i.area_built && <p className="small muted span">Most common nearby, 2022 census: {label(BUILT, i.area_built)}, {Math.round(Number(i.area_built_share ?? 0) * 100)}% of homes. The engine uses it for the heat estimate until the customer says.</p>}
    <Tagged label="Customer's priority" source={sourceOf(r, "goal")}>{pick("goal", GOAL)}</Tagged>
    {i.demand_source === "payment" && <Tagged label="Monthly payment (€)" source={sourceOf(r, "monthly_eur")}>{num("monthly_eur", 5)}</Tagged>}
  </div>
  </Fold>
  </>;
}

function Energy({ d, inputs, measured }: { d: Design; inputs: Inputs; measured: boolean }) {
  const e = d.energy, top = Math.max(e.total_mwh, e.production_mwh, 0.1);
  const row = (label: string, v: number, strong?: boolean) => <div className={`bar${strong ? " strong" : ""}`} key={label}><span>{label}</span><i><b style={{ width: `${(v / top) * 100}%` }} /></i><em>{v.toFixed(1)} MWh</em></div>;
  return <>
    <h3>Need against production, a year</h3>
    {row("House", e.base_mwh)}{e.ev_mwh > 0 && row("Car", e.ev_mwh)}{e.hp_mwh > 0 && row("Heat pump", e.hp_mwh)}{row("Total need", e.total_mwh, true)}{row("Production", e.production_mwh, true)}
    <dl className="rows">
      <div><dt>Share of need met by own power</dt><dd>{e.self_sufficiency_pct}%</dd></div>
      <div><dt>Share of production used at home</dt><dd>{e.self_use_pct}%</dd></div>
      <div><dt>Electricity saving a year at {inputs.price_ct_kwh} ct</dt><dd>€{e.saving_eur.toLocaleString("en")}</dd></div>
    </dl>
    <p className="small muted">Estimates: real weather years for Munich, this roof's directions, an assumed household day, battery losses. Checked against HTW Berlin reference values (scripts/check_energy.py).{d.heatpump.included ? " The saving counts electricity only, not the fuel no longer bought." : ""}</p>
    <p className="small muted">Production uses {measured ? "this roof's measured sun and shade" : inputs.roof_azimuth != null ? "PVGIS's yield for the roof's direction and slope, without shade, since the home was not shared" : "a typical German yield of 950 kWh per kWp, since the home was not shared"}. The electricity saving counts own power and the full feed-in tariff; the Cost tab counts the rest (price, grants, upkeep, smart meter, hours with negative prices, fuel) and the payback.</p>
  </>;
}

/** What the customer asked about their offer, with the engine's numbers they saw; the planner tries it or closes it. */
function AskCard({ x, tried, done }: { x: Ask; tried: () => void; done: () => void }) {
  const eur = (v: number) => `€${v.toLocaleString("en")}`;
  return <section className="askcard" aria-label="Question from the customer">
    <header><b>The customer asks about {describeChange(x.change)}</b><small>{new Date(x.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small></header>
    <p className="small">They saw {x.own}% own power (offer {x.offerOwn}%) and {eur(x.saving)} saved a year (offer {eur(x.offerSaving)}).</p>
    {x.note && <blockquote>{x.note}</blockquote>}
    <div className="ask-row"><Button variant="solid" onClick={tried}>Try it in the design</Button><button type="button" className="textlink" onClick={done}>Mark answered</button></div>
    <p className="small muted">Sending an updated offer answers it.</p>
  </section>;
}
