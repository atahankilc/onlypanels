// The planner's side: one request, each fact with where it came from, and the calls to the engine.
import { Answers, Choice, Place, Selected, SunSurface, chosenKeys, installedKeys, modelM2, measured, meanSun, placeAt, polyOf, sunOf, surfaceKey } from "./api";
import { P2, P3, toLocal } from "./geometry";
import { fit } from "./panels";

export type Inputs = { installer: string; demand_kwh: number | null; price_ct_kwh: number; heating: string | null; heat_kwh: number | null; hp_kwh?: number | null; has_solar: boolean; has_storage: boolean; ev: boolean; ev_km: number; ev_kwh_month?: number | null; ev_charge_home?: string | null; ev_day?: boolean | null; has_wallbox?: boolean | null;
  demand_source?: string | null; monthly_eur?: number | null; big_users?: string[]; living_m2?: number | null; living_from_model?: boolean; area_built?: string | null; area_built_share?: number | null; cert_kwh_m2?: number | null; built?: string | null; trees?: boolean | null; roof_renovation?: string | null; goal?: string | null;
  solar_thermal?: boolean; owner?: string | null; backup?: boolean | null; home_day?: string | null };
export type Overrides = { modules?: number | null; battery_kwh?: number | null; wallbox?: boolean | null; heatpump?: boolean | null };
/** One step of the engine's own decision, in order. Input keys match the request's facts, so their source can be shown. */
export type TraceStep = { id: string; title: string; kind: "measured" | "learned" | "rule" | "physics" | "input"; by?: "engine" | "planner"; inputs: { key: string | null; label: string; value: string }[]; how: string; result: string; context?: string };
export type Note = { code: string; level: "warn" | "note"; on: string; text: string };
export type Design = {
  pv: { modules: number; kwp: number; max_modules: number | null; placed: number[] | null; capped: boolean; locked: boolean };
  battery: { kwh: number; probability: number; choices: number[]; unsure: boolean; locked: boolean };
  wallbox: { included: boolean; locked: boolean }; heatpump: { included: boolean; kw: number; blocked: boolean; locked: boolean };
  trace: TraceStep[]; review: Note[];
  energy: { base_mwh: number; ev_mwh: number; hp_mwh: number; total_mwh: number; production_mwh: number; self_sufficiency_pct: number; self_use_pct: number; saving_eur: number };
  similar: { n: number; kwp_low: number; kwp_high: number; battery_rate: number; battery_common: number[]; wallbox_rate: number; battery_low: number | null; battery_high: number | null; learned_from: number };
  reasons: ({ code: string } & Record<string, unknown>)[]; warnings: ({ code: string } & Record<string, unknown>)[]; assumed: string[];
};
export type Source = "customer" | "assumed" | "planner";
export type Request = {
  checked?: string[]; // site checks the planner has ticked
  ref?: string; // the reference the homeowner was shown after sending, so a call can find the request
  id: string; label: string; from: string; buildings: Selected[]; inputs: Inputs; sources: Record<string, Source>; overrides: Overrides;
  off: string[]; installed: string[]; walls: string[]; existing: Existing; status: "draft" | "sent";
  opened?: boolean; offer?: Offer; // opened by a planner, and what the sent offer holds: both go back to the homeowner
};
/** What the homeowner sees once the planner sends the offer: the system and the engine's estimate, nothing else. */
export type Offer = { kwp: number; modules: number; battery_kwh: number; wallbox: boolean; heatpump_kw: number; production_mwh: number; self_sufficiency_pct: number; saving_eur: number };
export const offerOf = (d: Design): Offer => ({ kwp: d.pv.kwp, modules: d.pv.modules, battery_kwh: d.battery.kwh, wallbox: d.wallbox.included, heatpump_kw: d.heatpump.included ? d.heatpump.kw : 0,
  production_mwh: d.energy.production_mwh, self_sufficiency_pct: d.energy.self_sufficiency_pct, saving_eur: d.energy.saving_eur });
/** The homeowner's side of one request: what they sent, and how far the planner is. */
export type Progress = { opened: boolean; offer: Offer | null };
export type Mine = { ref: string; label: string; sentAt: number; handoff: Handoff } & Progress;
/** Solar already on the building: size and year as the customer gave them, else the area they marked and the sun it gets. */
export type Existing = { kwp: number | null; year: number | null; battery_kwh: number | null; m2?: number | null; kwh_per_kwp?: number | null };
export type Handoff = { buildings: Selected[]; answers: Answers; choice: Choice; ref?: string; seed?: { opened?: boolean; offer?: Offer | null } }; // seed: demo requests that arrive already opened or offered

const TYPICAL_KM = 11300;
/** The marked area with panels and the sun it gets: measured yield after shade, weighted by area. */
const existingArea = (buildings: Selected[], c: Choice) => {
  let m2 = 0, kwh = 0;
  for (const b of buildings) for (const s of b.sun?.surfaces ?? []) {
    const n = c.panels[surfaceKey(b, s)]?.length ?? 0;
    if (!n) continue;
    const area = (s.m2 * n) / Math.max(1, s.year.length), shade = s.kwh_m2 ? Math.max(0, 1 - meanSun(s) / s.kwh_m2) : 0;
    m2 += area; kwh += area * (s.kwh_per_kwp ?? 950) * (1 - shade);
  }
  return { m2: m2 ? Math.round(m2) : null, kwh_per_kwp: m2 ? Math.round(kwh / m2) : null };
};
const chosenOff = (buildings: Selected[], c: Choice) => {
  const on = new Set(chosenKeys(buildings, c)), taken = new Set(installedKeys(buildings, c));
  return buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "roof" && !on.has(surfaceKey(b, s)) && !taken.has(surfaceKey(b, s))).map((s) => surfaceKey(b, s)));
};
const source = (known: unknown): Source => (known === null || known === undefined ? "assumed" : "customer");

/** What the homeowner produced becomes the planner's starting point. Skipped answers arrive marked, nothing is asked twice. */
export function fromHomeowner(h: Handoff): Request {
  const { buildings, answers: a, choice } = h;
  const car = !!(a.ev || a.ev_planned);
  // Collectors for hot water take roof area but make no electricity: their area stays taken, but they are not an existing solar system.
  const thermal = !!a.has_solar && a.solar_kind === "thermal";
  return {
    id: h.ref ? `homeowner-${h.ref}` : "homeowner", ref: h.ref, label: buildings[0]?.label ?? "Home", from: "Homeowner", buildings, status: h.seed?.offer ? "sent" : "draft", opened: !!h.seed?.opened || !!h.seed?.offer, offer: h.seed?.offer ?? undefined,
    inputs: { installer: "2a8ba8e2", demand_kwh: a.demand_kwh, price_ct_kwh: a.price_ct_kwh, heating: a.heating, heat_kwh: a.heat_kwh, hp_kwh: a.heating === "Heatpump" ? a.hp_kwh : null, has_solar: !!a.has_solar && !thermal, has_storage: !!a.has_storage, ev: car, ev_km: a.ev_km ?? TYPICAL_KM * (a.ev_count ?? 1),
      ev_kwh_month: a.ev && !a.ev_planned ? a.ev_kwh_month : null, ev_charge_home: car ? a.ev_charge_home : null, ev_day: car ? a.ev_day : null, has_wallbox: car ? a.has_wallbox : null,
      demand_source: a.use_source === "exact" ? "bill" : a.use_source === "band" || a.use_source === "range" ? "range" : a.use_source, monthly_eur: a.use_source === "payment" ? a.monthly_eur : null,
      big_users: a.big_users, living_m2: a.living_m2 ?? modelM2(buildings), living_from_model: !a.living_m2 && !!modelM2(buildings), cert_kwh_m2: a.cert_kwh_m2, built: a.built, area_built: a.area?.built ?? null, area_built_share: a.area?.built_share ?? null, goal: a.goal,
      solar_thermal: !!a.has_solar && (a.solar_kind === "thermal" || a.solar_kind === "both"), owner: a.owner ?? null, backup: a.backup ?? null, home_day: a.home_day ?? null },
    sources: { demand_kwh: a.use_source === "exact" ? "customer" : "assumed", price_ct_kwh: a.price_known ? "customer" : "assumed", heating: source(a.heating), heat_kwh: source(a.heat_kwh), ev: source(a.ev), ev_km: car ? source(a.ev_km) : "customer", has_solar: source(a.has_solar), has_storage: source(a.has_storage) },
    overrides: a.wants_hp === false ? { heatpump: false } : a.wants_hp ? { heatpump: true } : {},
    // The planner still works by whole surface: a roof with nothing marked is out, a wall with anything marked is in.
    off: chosenOff(buildings, choice), installed: installedKeys(buildings, choice), walls: chosenKeys(buildings, choice).filter((k) => !k.includes("|roof")), existing: thermal ? { kwp: null, year: null, battery_kwh: a.battery_kwh } : { kwp: a.solar_kwp, year: a.solar_year, battery_kwh: a.battery_kwh, ...existingArea(buildings, choice) },
  };
}

const post = <T,>(url: string, body: unknown): Promise<T> => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });

export type Spot = { b: Selected; s: SunSurface; key: string; poly: number; fits: number; yield_: number; shade: number };
/** The roof surfaces, best first: how many modules really fit, and what a kWp gives there after measured shade. */
export const roofOf = (buildings: Selected[], installed: string[]): Spot[] => buildings.flatMap((b) => {
  const polys = b.real ? [...b.real.roofs, ...b.real.walls] : [];
  return (b.sun?.surfaces ?? []).filter((s) => s.kind === "roof" && !installed.includes(surfaceKey(b, s))).map((s) => {
    const poly = polyOf(b, s), shade = s.kwh_m2 ? Math.max(0, 1 - meanSun(s) / s.kwh_m2) : 0;
    return { b, s, key: surfaceKey(b, s), poly, fits: polys[poly] ? fit(polys[poly], s.n).length : 0, yield_: Math.round((s.kwh_per_kwp ?? 950) * (1 - shade)), shade };
  });
}).sort((x, y) => y.yield_ - x.yield_);

export const design = (i: Inputs, o: Overrides, roof: Spot[], off: string[], ex?: Existing) => {
  const use = roof.filter((r) => r.fits > 0 && !off.includes(r.key));
  const existing = ex ? { existing_kwp: ex.kwp, existing_year: ex.year, existing_m2: ex.m2 ?? null, existing_kwh_per_kwp: ex.kwh_per_kwp ?? null, existing_battery_kwh: ex.battery_kwh } : {};
  return post<Design>("/api/design", { inputs: { ...i, ...existing, surfaces: use.map((r) => ({ max_modules: r.fits, kwh_per_kwp: r.yield_, tilt: r.s.tilt, azimuth: r.s.azimuth })) }, overrides: o })
    .then((d) => ({ d, panels: Object.fromEntries(use.map((r, k) => [r.key, Math.min(r.fits, d.pv.placed?.[k] ?? 0)])) as Record<string, number> }));
};
export const refine = (text: string) => post<{ inputs: Partial<Inputs>; overrides: Overrides; understood: ({ code: string } & Record<string, unknown>)[]; source: string }>("/api/refine", { text, mount: "roof" });

const short = (label: string) => label.split(", ").slice(0, 2).join(", ");
const here = (r: P3[], origin: P2) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
/** Every part of a home, ready for the model. */
export async function loadHome(square: string, home: string): Promise<Selected[]> {
  const parts: { id: string; at: P2 }[] = await fetch(`/api/site/home/${square}/${encodeURIComponent(home)}`).then((r) => r.json());
  return Promise.all(parts.map(async ({ id, at }) => {
    const [place, sun, m] = await Promise.all([placeAt(at[1], at[0]).catch(() => ({ label: "Building" } as Place)), sunOf(square, id), measured(square, id)]);
    const polys = (list: typeof m.roofs) => list.map((p) => ({ ring: here(p.ring, at), holes: p.holes.map((h) => here(h, at)) }));
    return { id, home, square, origin: at, label: short(place.label), sun, real: { roofs: polys(m.roofs), walls: polys(m.walls) }, measuring: false } as Selected;
  }));
}
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const facing = (s: SunSurface) => (s.tilt < 8 ? "flat" : COMPASS[Math.round(s.azimuth / 45) % 8]);
/** Looks at the best roof from a little to the side, so two faces show. */
export const turnTo = (roof: Spot[]) => { const best = roof.find((r) => r.s.tilt >= 8); return best ? ((best.s.azimuth - 180 + 24 + 540) % 360) - 180 : 0; };
