import { P2, P3 } from "./geometry";

export type Place = { label: string; lat: number; lon: number };
export type Poly = { ring: P3[]; holes: P3[][] };
/** Bavaria's measured data comes in squares of 2 km. */
export type Square = { name: string; ring: P2[] };
/** Its surfaces, in metres around the building's origin. */
export type Real = { roofs: Poly[]; walls: Poly[] };
/** One surface of a building, sampled. `at` is lon, lat, height per sample; `seen` says which sun positions reach each one. */
export type SunSurface = { kind: "roof" | "wall"; index: number; m2: number; tilt: number; azimuth: number; kwh_m2: number | null; kwh_per_kwp: number | null; year: number[]; at: number[]; seen: string; u: P3; v: P3; n: P3 };
export type SunData = { step: number; suns: { month: number; hour: number; az: number; el: number; vector: P3 }[]; surfaces: SunSurface[]; sunny: boolean };
export type Selected = { id: string; square: string; label: string; origin: P2; real: Real | null; measuring: boolean; sun?: SunData | null };
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const surfaceKey = (b: { id: string }, s: SunSurface) => `${b.id}|${s.kind}${s.index}`;
export const meanSun = (s: SunSurface) => s.year.reduce((a, v) => a + v, 0) / s.year.length;
export const surfaceArea = (b: Selected, s: SunSurface) => s.year.length * (b.sun?.step ?? 1) ** 2;
export const surfaceName = (s: SunSurface) => (s.kind === "roof" ? (s.tilt < 8 ? "Flat roof" : `Roof, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`) : `Wall, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`);
/** The solid each surface belongs to: roofs first, then walls. */
export const polyOf = (b: Selected, s: SunSurface) => (s.kind === "roof" ? s.index : (b.real?.roofs.length ?? 0) + s.index);

export type View = { layer: "photo" | "sun"; moment: { month: number; hour: number } | null };
const BEST_SHARE = 0.75; // the suggestion keeps roofs with at least this share of the best roof's sun
/** Our suggestion: the sunniest roofs. Walls only ever come from the user. */
export function suggested(buildings: Selected[]) {
  const roofs = buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "roof").map((s) => ({ key: surfaceKey(b, s), sun: meanSun(s) })));
  const best = Math.max(0, ...roofs.map((r) => r.sun));
  return roofs.filter((r) => r.sun >= best * BEST_SHARE).map((r) => r.key);
}

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
