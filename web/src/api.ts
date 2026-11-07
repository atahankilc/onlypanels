import { P2, P3 } from "./geometry";

export type Place = { label: string; lat: number; lon: number };
export type Poly = { ring: P3[]; holes: P3[][] };
/** Bavaria's measured data comes in squares of 2 km. */
export type Square = { name: string; ring: P2[] };
/** Its surfaces, in metres around the building's origin. */
export type Real = { roofs: Poly[]; walls: Poly[] };
/** One surface of a building, sampled. `at` is lon, lat, height per sample; `seen` says which sun positions reach each one. */
export type SunSurface = { kind: "roof" | "wall"; index: number; m2: number; tilt: number; azimuth: number; kwh_m2: number | null; kwh_per_kwp: number | null; year: number[]; at: number[]; seen: string; cells: number[]; outline: P2[]; holes: P2[][]; n: P3 };
/** `solid` comes with a neighbour that shares a wall: its measured surfaces, lon, lat and height above its own floor. */
export type SunData = { around: { id: string; h: number; ring: P3[]; solid?: { roofs: Poly[]; walls: Poly[] } | null }[]; step: number; suns: { month: number; hour: number; az: number; el: number; vector: P3 }[]; surfaces: SunSurface[]; sunny: boolean };
export type Selected = { id: string; home: string; square: string; label: string; origin: P2; real: Real | null; measuring: boolean; sun?: SunData | null };
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const surfaceKey = (b: { id: string }, s: SunSurface) => `${b.id}|${s.kind}${s.index}`;
export const meanSun = (s: SunSurface) => s.year.reduce((a, v) => a + v, 0) / s.year.length;
export const surfaceName = (s: SunSurface) => (s.kind === "roof" ? (s.tilt < 8 ? "Flat roof" : `Roof, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`) : `Wall, ${COMPASS[Math.round(s.azimuth / 45) % 8]} side`);
/** The solid each surface belongs to: roofs first, then walls. */
export const polyOf = (b: Selected, s: SunSurface) => (s.kind === "roof" ? s.index : (b.real?.roofs.length ?? 0) + s.index);

/** What the design engine needs from the household, named as it names them. Null is not answered yet. */
export type Answers = { demand_kwh: number | null; price_ct_kwh: number; has_solar: boolean | null; solar_kwp: number | null; solar_year: number | null; has_storage: boolean | null; battery_kwh: number | null; heating: string | null; heat_kwh: number | null; wants_hp: boolean | null; ev: boolean | null; ev_planned: boolean; ev_km: number | null; use_source: "band" | "exact" | "people" | null };
export const NO_ANSWERS: Answers = { demand_kwh: null, price_ct_kwh: 32, has_solar: null, solar_kwp: null, solar_year: null, has_storage: null, battery_kwh: null, heating: null, heat_kwh: null, wants_hp: null, ev: null, ev_planned: false, ev_km: null, use_source: null };
export type View = { layer: "photo" | "sun"; moment: { month: number; hour: number } | null };
/** Every free roof starts wholly chosen, walls start free: we have no measure of what a surface yields once obstacles are known, so nothing is ruled out for the user.
 *  What the homeowner draws is kept per surface as the sample cells they marked; a surface not listed is as it started, so a building added later starts the same way.
 *  The marked area is the homeowner's priority, not a limit: the installer may use less or more. */
/** `panels` holds the cells that already carry panels, drawn the same way; they are never marked. */
export type Choice = { cells: Record<string, number[]>; panels: Record<string, number[]> };
export const NO_CHOICE: Choice = { cells: {}, panels: {} };
const allCells = (s: SunSurface) => s.year.map((_, n) => n);
/** The cells marked on one surface. */
export const cellsOf = (b: Selected, s: SunSurface, c: Choice) => {
  const key = surfaceKey(b, s);
  const taken = new Set(c.panels[key] ?? []), cells = c.cells[key] ?? (s.kind === "roof" ? allCells(s) : []);
  return taken.size ? cells.filter((n) => !taken.has(n)) : cells;
};
/** Every surface's cells that already carry panels. */
export const panelsOf = (buildings: Selected[], c: Choice) => Object.fromEntries(buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => [surfaceKey(b, s), c.panels[surfaceKey(b, s)] ?? []])));
/** The area that already carries panels, in m². */
export const panelsM2 = (buildings: Selected[], c: Choice) => buildings.reduce((sum, b) => sum + (b.sun?.surfaces ?? []).reduce((t, s) => t + (s.m2 * (c.panels[surfaceKey(b, s)]?.length ?? 0)) / Math.max(1, s.year.length), 0), 0);
/** For the planner, who works by whole surface: a surface at least half covered with panels counts as taken. */
export const installedKeys = (buildings: Selected[], c: Choice) => buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => (c.panels[surfaceKey(b, s)]?.length ?? 0) * 2 >= s.year.length).map((s) => surfaceKey(b, s)));
/** Every surface's marked cells, by surface. */
export const markedOf = (buildings: Selected[], c: Choice) => Object.fromEntries(buildings.flatMap((b) => (b.sun?.surfaces ?? []).map((s) => [surfaceKey(b, s), cellsOf(b, s, c)])));
export const chosenKeys = (buildings: Selected[], c: Choice) => buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => cellsOf(b, s, c).length > 0).map((s) => surfaceKey(b, s)));
/** The marked area in m². A surface's area is shared evenly over its cells. */
export const markedM2 = (buildings: Selected[], c: Choice) => buildings.reduce((sum, b) => sum + (b.sun?.surfaces ?? []).reduce((t, s) => t + (s.m2 * cellsOf(b, s, c).length) / Math.max(1, s.year.length), 0), 0);
/** Marks cells on, or takes them off: the homeowner's priority, or where panels already are. A cell with panels cannot be marked. */
export const paintChoice = (buildings: Selected[], c: Choice, cells: Record<string, number[]>, on: boolean, layer: "cells" | "panels" = "cells"): Choice => {
  const next = { ...c[layer] };
  for (const b of buildings) for (const s of b.sun?.surfaces ?? []) {
    const key = surfaceKey(b, s), change = cells[key];
    if (!change?.length) continue;
    const taken = new Set(c.panels[key] ?? []), set = new Set(layer === "panels" ? taken : cellsOf(b, s, c));
    change.forEach((n) => (on && (layer === "panels" || !taken.has(n)) ? set.add(n) : set.delete(n)));
    // Unmarked cells under panels stay as they were, so taking panels away gives the area back.
    if (layer === "cells") (c.cells[key] ?? (s.kind === "roof" ? allCells(s) : [])).forEach((n) => { if (taken.has(n)) set.add(n); });
    next[key] = [...set].sort((x, y) => x - y);
  }
  return { ...c, [layer]: next };
};

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
/** What the engine proposes, as ranges. */
export const homeParts = (square: string, home: string) => get<{ id: string; at: P2 }[]>(`/api/site/home/${square}/${encodeURIComponent(home)}`);
/** The chosen homes. A home can be several measured parts. */
export const homesIn = (list: Selected[]) => [...new Set(list.map((b) => b.home))].map((home) => ({ home, parts: list.filter((b) => b.home === home), label: list.find((b) => b.home === home)?.label ?? "Building" }));
export const measured = (square: string, id: string) => get<{ roofs: { ring: P3[]; holes: P3[][] }[]; walls: { ring: P3[]; holes: P3[][] }[] }>(`/api/site/square/${square}/${encodeURIComponent(id)}`);
