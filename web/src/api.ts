import { P2, P3 } from "./geometry";

export type Place = { label: string; lat: number; lon: number };
export type Poly = { ring: P3[]; holes: P3[][] };
type MeasuredBuilding = { ground: Poly[]; roofs: Poly[]; walls: Poly[] };
export type RealAnswer = { main: MeasuredBuilding; near: MeasuredBuilding[] } | null;
/** Bavaria's measured model of a building, in metres around the home's origin. */
export type Real = { ground: P2[][]; roofs: Poly[]; walls: Poly[]; others: Poly[] };
export type Selected = { place: Place; origin: P2; homeIds: string[]; ring: P2[]; real: Real | null; measuring: boolean };

const get = <T,>(url: string): Promise<T> => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
export const searchPlace = (q: string) => get<Place[]>(`/api/site/search?q=${encodeURIComponent(q)}`);
export const placeAt = (lat: number, lon: number) => get<Place>(`/api/site/reverse?lat=${lat}&lon=${lon}`);
export const realBuilding = (lat: number, lon: number, reach: number) => get<RealAnswer>(`/api/site/real?lat=${lat}&lon=${lon}&reach=${reach}`);
