import { Face, P2 } from "./geometry";

export type Inputs = {
  installer: string; country: string; demand_kwh: number; price_ct_kwh: number; heating: string | null;
  heat_kwh: number | null; has_solar: boolean; has_storage: boolean; ev: boolean; ev_km: number;
  mount: string; area_m2: number | null; surfaces?: EngineSurface[] | null;
};
export type EngineSurface = { kind: string; max_modules: number; kwh_per_kwp: number | null };
export type Overrides = { modules?: number | null; battery_kwh?: number | null; wallbox?: boolean | null; heatpump?: boolean | null };
export type Note = { code: string } & Record<string, unknown>;
export type Design = {
  pv: { modules: number; kwp: number; max_modules: number | null; placed: number[] | null; locked: boolean; capped: boolean };
  battery: { kwh: number; locked: boolean; choices: number[]; unsure: boolean };
  wallbox: { included: boolean; locked: boolean };
  heatpump: { included: boolean; kw: number; locked: boolean; blocked: boolean };
  energy: {
    base_mwh: number; ev_mwh: number; hp_mwh: number; total_mwh: number; production_mwh: number;
    self_sufficiency_pct: number; self_use_pct: number; saving_eur: number;
  };
  similar: { n: number; kwp_low: number; kwp_high: number; battery_rate: number; battery_common: number[]; wallbox_rate: number };
  reasons: Note[]; warnings: Note[];
};
export type Refined = { inputs: Partial<Inputs>; overrides: Overrides; understood: Note[]; source: string };

export type Allowed = { battery: boolean; panels: boolean; wallbox: boolean; heatpump: boolean };
export type Status = "draft" | "sent" | "change";
export type Request = {
  id: string; title: string; from: "homeowner" | "planner"; inputs: Inputs; overrides: Overrides; status: Status;
  allowed?: Allowed; offer?: Overrides; change?: Overrides; site?: Site | null;
};

export type Place = { label: string; lat: number; lon: number; country: string; bavaria: boolean };
export type Sun = { kwh_per_kwp: number; sun_kwh_m2: number; monthly: number[] };
export type BuildingFacts = { roof: "flat" | "pitched" | null; shape: string | null; tilt: number | null; trees: number | null };
export type Building = { id: string; ring: P2[]; eave: number; roof: "flat" | "pitched"; tilt: number; flip: boolean; source: string; main: boolean };
export type SiteSurface = Face & { id: string; owner: string; kind: "roof" | "carport" | "ground"; name: string; wanted: boolean; sun: Sun | null };
export type Site = {
  place: Place; origin: P2; buildings: Building[]; surfaces: SiteSurface[]; noGarden: boolean;
  shade: string | null; trees: number | null; sorted: boolean;
};

export const START: Inputs = {
  installer: "2a8ba8e2", country: "Germany", demand_kwh: 4500, price_ct_kwh: 32, heating: null, heat_kwh: null,
  has_solar: false, has_storage: false, ev: false, ev_km: 15000, mount: "roof", area_m2: null,
};

const post = <T,>(url: string, body: unknown): Promise<T> =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); });

export const designFor = (inputs: Inputs, overrides: Overrides = {}) => post<Design>("/api/design", { inputs, overrides });
export const refine = (text: string, mount: string) => post<Refined>("/api/refine", { text, mount });

export const searchPlace = (q: string) => fetch(`/api/site/search?q=${encodeURIComponent(q)}`).then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Place[]>; });
export const sunFor = (lat: number, lon: number, surfaces: { tilt: number; azimuth: number }[]) => post<Sun[]>("/api/site/sun", { lat, lon, surfaces });
export const buildingFacts = (lat: number, lon: number) => fetch(`/api/site/building?lat=${lat}&lon=${lon}`).then((r) => r.json() as Promise<BuildingFacts>);

export const usedSurfaces = (site: Site) => site.surfaces.filter((s) => s.wanted && s.panels.length > 0);
/** What the engine needs from a site, in the homeowner's order. */
export const siteInputs = (site: Site): Partial<Inputs> => {
  const used = usedSurfaces(site);
  return {
    country: site.place.country, mount: used[0]?.kind ?? "roof", area_m2: Math.round(used.reduce((s, x) => s + x.m2, 0)) || null,
    surfaces: used.length ? used.map((s) => ({ kind: s.kind, max_modules: s.panels.length, kwh_per_kwp: s.sun?.kwh_per_kwp ?? null })) : null,
  };
};
