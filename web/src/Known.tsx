// Under each question: what we know so far, what stands in for an answer left open, and what the installer does with it later.
// Every line follows the engine and the planner's checks as they are (docs/assumptions.md): nothing here is a design result.
import { ReactNode } from "react";
import { Answers, GAS_CT, PRICE_CT, SunSurface } from "./api";
import { BANDS, BASE_FEE_EUR_YEAR, BIG_USERS, BIG_USERS_KWH, BUILT, BY_PEOPLE, EV_KWH_PER_KM, FEED_IN_YEARS, FOSSIL, HEATING, HEAT_KWH_PER_M2, HOME_SHARE, KWH_PER_LITRE_OIL, KWP_PER_M2, REPLACEABLE, SIZE, TYPICAL_HEAT_KWH, TYPICAL_KM, TYPICAL_USE_KWH } from "./questions";
import { TOLD_M2, TOLD_TILT } from "./share";
import type { Stage } from "./Review";

/** One line. `from` names where a known value came from: the homeowner, a map, a census, or our own arithmetic. */
export type Line = { t: ReactNode; from?: string };
export type Facts = { known: Line[]; assumed: Line[]; later: Line[] };
/** What the page knows besides the answers. */
export type Ctx = { mapped: boolean; roofs: SunSurface[]; m2: number; drawn: boolean; panelM2: number; modelM2: number | null };

const YOU = "You", MATH = "Worked out";
const k = (v: number) => Math.round(v).toLocaleString("en");
const r100 = (v: number) => k(Math.round(v / 100) * 100);
const label = (list: readonly (readonly string[])[], v: string | null | undefined) => list.find((x) => x[0] === v)?.[1] ?? "";
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The heat a year the engine takes from the house when no gas or oil figure is given, and what it rests on. Same order as design.py. */
export function heatFromHouse(a: Answers, modelM2: number | null): { kwh: number; from: string } | null {
  const m2 = a.living_m2 ?? modelM2;
  if (!m2) return null;
  if (a.cert_kwh_m2) return { kwh: m2 * a.cert_kwh_m2, from: "your energy certificate" };
  const built = a.built ?? a.area?.built;
  if (built && HEAT_KWH_PER_M2[built]) return { kwh: m2 * HEAT_KWH_PER_M2[built], from: `${a.built ? "a house" : "the usual house nearby"} built ${lower(label(BUILT, built))}` };
  return null;
}

export function factsFor(stage: Stage, a: Answers, c: Ctx): Facts {
  const known: Line[] = [], assumed: Line[] = [], later: Line[] = [];
  const add = (list: Line[], t: ReactNode, from?: string) => list.push({ t, from });

  if (stage === "roof") {
    const total = c.roofs.reduce((s, x) => s + x.m2, 0);
    if (c.roofs.length) {
      add(known, <>Your roof from Bavaria's 3D model: <b>{c.roofs.length} {c.roofs.length === 1 ? "side" : "sides"}</b>, {k(total)} m²</>, "3D model");
    }
    if (c.drawn) add(known, <><b>{k(c.m2)} m²</b> marked: panels go there first</>, YOU);
    else add(assumed, "Nothing marked: the whole roof counts, sunniest sides first");
    add(later, "Works out the sun on each side, with shade from buildings and trees");  // no sun here before the planner adds trees (D116)
    add(later, "Looks for roof windows and chimneys on the aerial photo");
    add(later, "Checks monument rules for your building");
  }

  if (stage === "where") {
    if (a.address) add(known, <><b>{a.address}</b>, kept as text here: nothing looks it up</>, YOU);
    else add(assumed, "No address: your installer asks for it before a visit");
    add(later, "Looks it up for monument rules, Munich's heat plan and trees near the roof");
  }

  if (stage === "roofq") {
    const facing = a.roof_facing;
    if (facing === "flat") add(known, <>A <b>flat roof</b></>, YOU);
    else if (facing && facing !== "unsure") add(known, <>The larger side faces <b>{facing}</b></>, YOU);
    else add(assumed, "Direction not known: a typical German sun yield");
    if (facing !== "flat") {
      if (a.roof_slope === "gentle" || a.roof_slope === "steep") add(known, <>About <b>{TOLD_TILT[a.roof_slope]}°</b> steep</>, YOU);
      else add(assumed, <>A slope of about <b>{TOLD_TILT.unsure}°</b></>);
    }
    if (a.roof_size === "known" && a.roof_m2) add(known, <><b>{k(a.roof_m2)} m²</b> of roof</>, YOU);
    else if (a.roof_size && a.roof_size !== "known") add(known, <>About <b>{TOLD_M2[a.roof_size]} m²</b> of roof, usual for a {lower(label(SIZE, a.roof_size))} in Munich</>, "3D roofs");
    else add(assumed, "No size: no roof limit until your installer checks");
    add(later, "Confirms size, direction and shade with you, or from the address");
  }

  if (stage === "solar") {
    if (a.has_solar === null) add(assumed, "No solar on the roof yet");
    else if (!a.has_solar) add(known, "No solar yet: the whole roof is free", YOU);
    else {
      const thermal = a.solar_kind === "thermal";
      add(known, a.solar_kind ? <>Panels for <b>{a.solar_kind === "pv" ? "electricity" : thermal ? "hot water" : "electricity and hot water"}</b></> : "Solar is there", YOU);
      if (c.mapped) {
        if (c.panelM2 > 0) add(known, <><b>{k(c.panelM2)} m²</b> with panels, kept free for the new ones</>, YOU);
        else add(assumed, "Not marked: your installer asks where they sit");
      }
      if (!thermal) {
        if (a.solar_kwp) add(known, <>Size <b>{a.solar_kwp} kWp</b></>, YOU);
        else if (c.panelM2 > 0) add(assumed, <>About <b>{(c.panelM2 * KWP_PER_M2).toFixed(1)} kWp</b>, from the marked area at {KWP_PER_M2} kWp per m²</>);
        else add(assumed, "Size not known: your installer asks");
        if (a.solar_year) {
          const end = a.solar_year + FEED_IN_YEARS;
          add(known, end <= 2026 ? <>From {a.solar_year}: its fixed feed-in payment <b>has ended</b></> : <>From {a.solar_year}: its fixed feed-in payment ends in <b>{end}</b></>, MATH);
        } else add(assumed, "No year: no ageing of the old panels is counted");
        add(later, "Sees when the feed-in payment ends, and using its power yourself pays more");
      }
      add(later, "Checks with you whether the old panels stay");
    }
  }

  if (stage === "battery") {
    if (a.has_storage === null) add(assumed, "No battery there yet");
    else if (!a.has_storage) add(known, "No battery yet", YOU);
    else {
      add(known, "A battery is there: no second one is offered", YOU);
      if (a.battery_kwh) add(known, <>Size <b>{a.battery_kwh} kWh</b></>, YOU);
      else add(assumed, "Size not known: your installer asks");
    }
    add(later, "Sees what is already in the house beside the new system");
  }

  if (stage === "use") {
    const price = a.price_known ? a.price_ct_kwh : PRICE_CT;
    if (a.use_source === "exact" && a.demand_kwh) add(known, <><b>{k(a.demand_kwh)} kWh</b> a year</>, "Your bill");
    else if (a.use_source === "payment" && a.monthly_eur) {
      add(known, <><b>€{k(a.monthly_eur)}</b> a month</>, YOU);
      add(known, <>About <b>{r100(Math.max(0, a.monthly_eur * 12 - BASE_FEE_EUR_YEAR) / (price / 100))} kWh</b> a year: 12 payments, less a €{BASE_FEE_EUR_YEAR} fixed fee, at {price} ct</>, MATH);
    } else if ((a.use_source === "band" || a.use_source === "range") && a.demand_kwh) {
      const band = BANDS.find((x) => x[1] === a.demand_kwh && a.use_source === "band")?.[0];
      add(known, <>{band ? `${band} kWh` : "Your range"}: we use <b>{k(a.demand_kwh)} kWh</b>, the middle</>, YOU);
    } else if (a.use_source === "people" && a.demand_kwh) {
      const n = BY_PEOPLE.find((x) => x[1] === a.demand_kwh)?.[0];
      add(known, <>{n} {n === "1" ? "person" : "people"}: a typical <b>{k(a.demand_kwh)} kWh</b> a year</>, "Stromspiegel");
    } else add(assumed, <><b>{k(TYPICAL_USE_KWH)} kWh</b> a year, a typical German house</>);
    if (a.price_known) add(known, <>Price <b>{a.price_ct_kwh} ct</b> per kWh</>, YOU);
    else add(assumed, <>Price <b>{PRICE_CT} ct</b> per kWh, Munich's basic supply</>);
    if (a.home_day === "most") add(known, "Home in the day: more of your power is used while the sun shines", YOU);
    else if (a.home_day === "rarely") add(known, "Mostly out: more of your power is used in the evening", YOU);
    else if (a.home_day === "some") add(known, "Home now and then: a usual day", YOU);
    else add(assumed, "A usual day: someone home now and then");
    add(later, "Checks the use against your bill before the offer");
    add(later, "Works out hour by hour how much solar power you use yourself");
  }

  if (stage === "big") {
    const fromBill = a.use_source === "exact" && !!a.demand_kwh;
    for (const v of a.big_users) add(known, <>{label(BIG_USERS, v)}{fromBill ? "" : <>: about <b>+{k(BIG_USERS_KWH[v] ?? 0)} kWh</b> a year</>}</>, YOU);
    if (a.big_users.length && fromBill) add(known, "Already inside your bill's number, so nothing is added", MATH);
    if (!a.big_users.length) add(assumed, "None picked: nothing is added to your use");
    add(later, "Sees each one beside your use, so a high number has a reason");
  }

  if (stage === "house") {
    if (a.built) add(known, <>Built {lower(label(BUILT, a.built))}: about <b>{HEAT_KWH_PER_M2[a.built]} kWh</b> of heat per m² a year</>, YOU);
    else if (a.area?.built) add(assumed, <>Built {lower(label(BUILT, a.area.built))}, like {Math.round((a.area.built_share ?? 0) * 100)}% of homes nearby (Census 2022)</>);
    else add(assumed, "Build period not known");
    if (a.living_m2) add(known, <><b>{k(a.living_m2)} m²</b> to live in</>, YOU);
    else if (c.modelM2) add(assumed, <>About <b>{k(c.modelM2)} m²</b> to live in, from the 3D model's floors</>);
    else add(assumed, "Living area not known");
    if (a.cert_kwh_m2) add(known, <>Certificate: <b>{k(a.cert_kwh_m2)} kWh</b> per m², used instead of the build period</>, YOU);
    const heat = heatFromHouse(a, c.modelM2);
    if (heat) add(known, <>Heat your home needs: about <b>{r100(heat.kwh)} kWh</b> a year, from {heat.from}</>, MATH);
    if (a.owner === "sole") add(known, "You or your family own it, so you can sign", YOU);
    else if (a.owner === "shared") add(known, "Shared with other owners: they must agree first", YOU);
    else if (a.owner === "tenant") add(known, "Rented: the landlord must agree first", YOU);
    else add(assumed, "Who owns it: your installer asks");
    add(later, "Checks who must agree before planning further");
    add(later, "Sizes a heat pump from the heat need, if one is wanted");
  }

  if (stage === "heat") {
    const h = a.heating;
    if (a.area?.heating) add(known, <>Most homes nearby: <b>{lower(label(HEATING, a.area.heating))}</b></>, "Census 2022");
    if (!h) add(assumed, "Heating not known: no heat pump unless you ask for one");
    else add(known, <>Heated with <b>{lower(label(HEATING, h))}</b></>, YOU);
    if (h === "Heatpump") {
      if (a.hp_kwh) add(known, <>Its own meter: <b>{k(a.hp_kwh)} kWh</b> a year, for the new solar to cover too</>, YOU);
      else add(assumed, "Its power counts as part of your household use");
    }
    if (h === "District") add(known, "No heat pump with district heating");
    if (h && REPLACEABLE.includes(h)) {
      if (a.wants_hp === true) add(known, "A heat pump is wanted, sized from your heat use", YOU);
      else if (a.wants_hp === false) add(known, "No heat pump in the offer", YOU);
      else add(assumed, "A heat pump is left to your installer, as an option");
      if (h === "Oil" && a.oil_l) add(known, <>{k(a.oil_l)} litres: about <b>{r100(a.oil_l * KWH_PER_LITRE_OIL)} kWh</b> of heat, at {KWH_PER_LITRE_OIL} kWh a litre</>, MATH);
      else if (h === "Gas" && a.gas_eur && a.heat_kwh) add(known, <>€{k(a.gas_eur)} a year: about <b>{k(a.heat_kwh)} kWh</b> at {GAS_CT} ct, all in</>, MATH);
      else if (a.heat_kwh) add(known, <><b>{k(a.heat_kwh)} kWh</b> of heat a year</>, YOU);
      else {
        const house = heatFromHouse(a, c.modelM2);
        add(assumed, house ? <>About <b>{r100(house.kwh)} kWh</b> of heat a year, from {house.from}</> : <>A typical <b>{k(TYPICAL_HEAT_KWH)} kWh</b> of heat a year</>);
      }
      if (a.heat_dist === "floor") add(known, "Underfloor heating: suits a heat pump well", YOU);
      else if (a.heat_dist === "radiators") add(known, "Radiators: some may need to be larger", YOU);
      else if (a.heat_dist === "both") add(known, "Both: the radiators set the water temperature", YOU);
      else add(assumed, "Radiators unknown: usually checked on a visit");
      if (FOSSIL.includes(h)) {
        const age = a.boiler_age;
        if (h === "Oil") add(known, "Replacing oil heating can get a grant bonus at any age", "KfW 458");
        else if (h === "Gas" && age === "over20") add(known, <>Over 20 years: a <b>KfW speed bonus</b> can apply</>, "KfW 458");
        else if (h === "Gas" && age) add(known, "Under 20 years: no speed bonus yet", "KfW 458");
        else if (h === "Gas") add(assumed, "Boiler age not known: your installer asks for its type plate");
      }
      if (h === "Electric") add(known, "Replacing electric heating can get a grant bonus at any age", "KfW 458");
    }
    if (h !== "Heatpump") add(later, "Reads Munich's heat plan: is district heating coming to your street?");
    add(later, "Checks grants from your heating and its age");
    if (h && REPLACEABLE.includes(h)) add(later, "Checks the water temperature your rooms need for a heat pump");
  }

  if (stage === "car") {
    if (a.ev === null) add(assumed, "No electric car to plan for");
    else if (!a.ev) add(known, "No electric car: nothing added", YOU);
    else {
      add(known, a.ev_planned ? <>A car coming <b>{a.ev_when === "later" ? "later" : a.ev_when === "soon" ? "within a year" : "soon"}</b>: planned for now</> : "An electric car today", YOU);
      const cars = a.ev_count ?? 1;
      if (a.ev_count) add(known, <><b>{a.ev_count}</b> {a.ev_count === 1 ? "car" : "cars"}</>, YOU);
      else add(assumed, "One car");
      const share = HOME_SHARE[a.ev_charge_home ?? ""] ?? 1;
      if (!a.ev_planned && a.ev_kwh_month) add(known, <><b>{k(a.ev_kwh_month)} kWh</b> a month at home: {k(a.ev_kwh_month * 12)} kWh a year</>, YOU);
      else if (a.ev_km) add(known, <>{k(a.ev_km)} km a year: about <b>{r100(a.ev_km * EV_KWH_PER_KM * share)} kWh</b> charged at home</>, MATH);
      else add(assumed, <>{k(TYPICAL_KM * cars)} km a year: about <b>{r100(TYPICAL_KM * cars * EV_KWH_PER_KM * share)} kWh</b> charged at home, at {EV_KWH_PER_KM} kWh per km</>);
      add(later, "Compares with past homes like yours that added a wallbox");
    }
  }

  if (stage === "charge") {
    const where = a.ev_charge_home;
    if (where) add(known, <>{where === "most" ? "Mostly at home" : where === "half" ? "Half at home" : "Mostly elsewhere"}: <b>{Math.round(HOME_SHARE[where] * 100)}%</b> of the driving charged here</>, YOU);
    else add(assumed, "All the driving charged at home");
    if (a.ev_day === true) add(known, "Home in the day: the car can charge from the sun", YOU);
    else if (a.ev_day === false) add(known, "Charged in the evening", YOU);
    else add(assumed, "Charged in the evening");
    if (a.has_wallbox === true) add(known, "A wallbox is there: no new one is offered", YOU);
    else if (a.has_wallbox === false) add(known, "No wallbox yet: one can be part of the offer", YOU);
    else add(assumed, "A wallbox comes with the car in the offer");
    add(later, "Puts the car's charging into the hour-by-hour check");
  }

  if (stage === "goal") {
    if (a.goal === "cost") add(known, "Low cost first: a battery only when it clearly pays", YOU);
    else if (a.goal === "independence") add(known, "Independence first: a battery comes in more readily", YOU);
    else if (a.goal === "environment") add(known, "The environment first: more solar, as far as the roof allows", YOU);
    else add(assumed, "No priority: no lean either way");
    if (a.backup === true) add(known, "Backup power: parts that run the house in an outage", YOU);
    else if (a.backup === false) add(known, "No backup power needed", YOU);
    else add(assumed, "No backup power unless you ask");
    add(later, "Reads your priority before choosing between options");
  }

  if (stage === "send") {
    if (a.meter_photo) add(known, "A photo of your meter cabinet", YOU);
    else add(assumed, "No photo: the cabinet may need a look on a visit");
    add(later, "Sees from the photo whether the cabinet needs work, often without a visit");
  }

  return { known, assumed, later };
}

/** The card under a question. Groups with nothing in them stay away. */
export function Known({ facts, title = "What this page gives us" }: { facts: Facts; title?: string }) {
  const group = (cls: string, head: string, lines: Line[]) => lines.length > 0 && <div className={`known-group ${cls}`}>
    <h3>{head}</h3>
    <ul>{lines.map((l, i) => <li key={i}><span>{l.t}</span>{l.from && <em>{l.from}</em>}</li>)}</ul>
  </div>;
  return (
    <div className="known" role="group" aria-label={title}>
      {group("is-known", "We know", facts.known)}
      {group("is-assumed", "If left open", facts.assumed)}
      {group("is-later", "Later, your installer", facts.later)}
    </div>
  );
}
