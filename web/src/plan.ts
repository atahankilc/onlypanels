// The planner's side: one request, each fact with where it came from, and the calls to the engine.
import { Answers, Choice, Place, Selected, SunSurface, measured, meanSun, placeAt, polyOf, sunOf, surfaceKey } from "./api";
import { P2, P3, toLocal } from "./geometry";
import { fit } from "./panels";

export type Inputs = { installer: string; demand_kwh: number | null; price_ct_kwh: number; heating: string | null; heat_kwh: number | null; has_solar: boolean; has_storage: boolean; ev: boolean; ev_km: number };
export type Overrides = { modules?: number | null; battery_kwh?: number | null; wallbox?: boolean | null; heatpump?: boolean | null };
export type Design = {
  pv: { modules: number; kwp: number; max_modules: number | null; placed: number[] | null; capped: boolean };
  battery: { kwh: number; probability: number; choices: number[]; unsure: boolean };
  wallbox: { included: boolean }; heatpump: { included: boolean; kw: number; blocked: boolean };
  energy: { base_mwh: number; ev_mwh: number; hp_mwh: number; total_mwh: number; production_mwh: number; self_sufficiency_pct: number; self_use_pct: number; saving_eur: number };
  similar: { n: number; kwp_low: number; kwp_high: number; battery_rate: number; battery_common: number[]; wallbox_rate: number };
  reasons: ({ code: string } & Record<string, unknown>)[]; warnings: ({ code: string } & Record<string, unknown>)[]; assumed: string[];
};
export type Source = "customer" | "assumed" | "planner";
export type Request = {
  id: string; label: string; from: string; buildings: Selected[]; inputs: Inputs; sources: Record<string, Source>; overrides: Overrides;
  off: string[]; installed: string[]; walls: string[]; existing: { kwp: number | null; year: number | null; battery_kwh: number | null }; status: "draft" | "sent";
};
export type Handoff = { buildings: Selected[]; answers: Answers; choice: Choice };

const TYPICAL_KM = 11300;
const source = (known: unknown): Source => (known === null || known === undefined ? "assumed" : "customer");

/** What the homeowner produced becomes the planner's starting point. Skipped answers arrive marked, nothing is asked twice. */
export function fromHomeowner({ buildings, answers: a, choice }: Handoff): Request {
  const car = !!(a.ev || a.ev_planned);
  return {
    id: "homeowner", label: buildings[0]?.label ?? "Home", from: "Homeowner", buildings, status: "draft",
    inputs: { installer: "2a8ba8e2", demand_kwh: a.demand_kwh, price_ct_kwh: a.price_ct_kwh, heating: a.heating, heat_kwh: a.heat_kwh, has_solar: !!a.has_solar, has_storage: !!a.has_storage, ev: car, ev_km: a.ev_km ?? TYPICAL_KM },
    sources: { demand_kwh: a.use_source === "exact" ? "customer" : "assumed", price_ct_kwh: "assumed", heating: source(a.heating), heat_kwh: source(a.heat_kwh), ev: source(a.ev), ev_km: car ? source(a.ev_km) : "customer", has_solar: source(a.has_solar), has_storage: source(a.has_storage) },
    overrides: a.wants_hp === false ? { heatpump: false } : a.wants_hp ? { heatpump: true } : {},
    off: choice.dropped, installed: choice.installed, walls: choice.added, existing: { kwp: a.solar_kwp, year: a.solar_year, battery_kwh: a.battery_kwh },
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

export const design = (i: Inputs, o: Overrides, roof: Spot[], off: string[]) => {
  const use = roof.filter((r) => r.fits > 0 && !off.includes(r.key));
  return post<Design>("/api/design", { inputs: { ...i, surfaces: use.map((r) => ({ max_modules: r.fits, kwh_per_kwp: r.yield_ })) }, overrides: o })
    .then((d) => ({ d, panels: Object.fromEntries(use.map((r, k) => [r.key, Math.min(r.fits, d.pv.placed?.[k] ?? 0)])) as Record<string, number> }));
};
export const refine = (text: string) => post<{ inputs: Partial<Inputs>; overrides: Overrides; understood: unknown[] }>("/api/refine", { text, mount: "roof" });

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
