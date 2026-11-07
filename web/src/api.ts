import { P2, P3 } from "./geometry";

export type Place = { label: string; lat: number; lon: number };
export type Poly = { ring: P3[]; holes: P3[][] };
/** A real building, as measured: the unit people select. */
export type Footprint = { id: string; height: number; polys: P2[][][] };
/** Its surfaces, in metres around the building's origin. */
export type Real = { roofs: Poly[]; walls: Poly[] };
export type Selected = { id: string; square: string; label: string; origin: P2; real: Real | null; measuring: boolean };

const get = <T,>(url: string): Promise<T> => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
export const searchPlace = (q: string) => get<Place[]>(`/api/site/search?q=${encodeURIComponent(q)}`);
export const placeAt = (lat: number, lon: number) => get<Place>(`/api/site/reverse?lat=${lat}&lon=${lon}`);
export const squaresIn = (west: number, south: number, east: number, north: number) => get<string[]>(`/api/site/squares?west=${west}&south=${south}&east=${east}&north=${north}`);
export const squareBuildings = (name: string) => get<Footprint[]>(`/api/site/square/${name}`);
export const measured = (square: string, id: string) => get<{ roofs: { ring: P3[]; holes: P3[][] }[]; walls: { ring: P3[]; holes: P3[][] }[] }>(`/api/site/square/${square}/${encodeURIComponent(id)}`);
