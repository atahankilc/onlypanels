import { P2, P3 } from "./geometry";

export type Place = { label: string; lat: number; lon: number };
export type Poly = { ring: P3[]; holes: P3[][] };
/** Bavaria's measured data comes in squares of 2 km. */
export type Square = { name: string; ring: P2[] };
/** Its surfaces, in metres around the building's origin. */
export type Real = { roofs: Poly[]; walls: Poly[] };
/** One surface of a building, sampled. `at` is lon, lat, height per sample; `seen` says which sun positions reach each one. */
export type SunSurface = { kind: "roof" | "wall"; index: number; m2: number; tilt: number; azimuth: number; kwh_m2: number | null; kwh_per_kwp: number | null; year: number[]; at: number[]; seen: string; cells: number[]; outline: P2[]; holes: P2[][]; n: P3 };
export type SunData = { around: { id: string; h: number; ring: P3[] }[]; step: number; suns: { month: number; hour: number; az: number; el: number; vector: P3 }[]; surfaces: SunSurface[]; sunny: boolean };
export type Selected = { id: string; square: string; label: string; origin: P2; real: Real | null; measuring: boolean; sun?: SunData | null };
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const surfaceKey = (b: { id: string }, s: SunSurface) => `${b.id}|${s.kind}${s.index}`;
export const meanSun = (s: SunSurface) => s.year.reduce((a, v) => a + v, 0) / s.year.length;
export const surfaceName = (s: SunSurface) => (s.kind === "roof" ? (s.tilt < 8 ? "Flat roof" : `Roof, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`) : `Wall, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`);
/** The solid each surface belongs to: roofs first, then walls. */
export const polyOf = (b: Selected, s: SunSurface) => (s.kind === "roof" ? s.index : (b.real?.roofs.length ?? 0) + s.index);

/** What the design engine needs from the household, named as it names them. Null is not answered yet. */
export type Answers = { demand_kwh: number | null; price_ct_kwh: number; has_solar: boolean; has_storage: boolean; heating: string | null; heat_kwh: number | null; ev: boolean | null; ev_km: number };
export const NO_ANSWERS: Answers = { demand_kwh: null, price_ct_kwh: 32, has_solar: false, has_storage: false, heating: null, heat_kwh: null, ev: null, ev_km: 15000 };
export type View = { layer: "photo" | "sun"; moment: { month: number; hour: number } | null };
/** Every roof starts chosen: we have no measure of what a surface yields once obstacles are known, so nothing is ruled out for the user. */
export const allRoofs = (buildings: Selected[]) => buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "roof").map((s) => surfaceKey(b, s)));

const get = <T,>(url: string): Promise<T> => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
export const searchPlace = (q: string) => get<Place[]>(`/api/site/search?q=${encodeURIComponent(q)}`);
export const placeAt = (lat: number, lon: number) => get<Place>(`/api/site/reverse?lat=${lat}&lon=${lon}`);
export const squaresIn = (west: number, south: number, east: number, north: number) => get<Square[]>(`/api/site/squares?west=${west}&south=${south}&east=${east}&north=${north}`);
/** The map's own worker fetches and reads this, so it costs the page nothing. Its worker needs a full address. */
export const homesUrl = (name: string) => `${location.origin}/api/site/homes/${name}`;
/** Lines ready for the GPU: an origin in two float64, then x, y, z in float32. Nothing to parse. */
export const squareEdges = (name: string) => fetch(`/api/site/edges/${name}`).then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
  .then((b) => ({ at: [...new Float64Array(b, 0, 2)] as P2, points: new Float32Array(b, 16) }));
export const sunOf = (square: string, id: string) => get<SunData>(`/api/site/sun/${square}/${encodeURIComponent(id)}`);
export const measured = (square: string, id: string) => get<{ roofs: { ring: P3[]; holes: P3[][] }[]; walls: { ring: P3[]; holes: P3[][] }[] }>(`/api/site/square/${square}/${encodeURIComponent(id)}`);
