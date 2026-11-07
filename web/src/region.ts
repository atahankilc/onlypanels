// The prototype covers Munich and its surroundings, all inside Bavaria. Keep in step with REGION in engine site.py.
import { P2 } from "./geometry";

export const REGION = { west: 11.2, south: 47.95, east: 11.95, north: 48.4 };
export const MUNICH: P2 = [11.5755, 48.1374];
export const inRegion = ([lng, lat]: P2) => lng >= REGION.west && lng <= REGION.east && lat >= REGION.south && lat <= REGION.north;

const { west: w, south: s, east: e, north: n } = REGION;
const edge: P2[] = [[w, s], [e, s], [e, n], [w, n], [w, s]];
export const REGION_EDGE = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: edge } };
/** Everything but the region, to dim it. */
export const REGION_OUTSIDE = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], [...edge].reverse()] } };
/** How far the view may move: past the line, so it can be seen. */
export const VIEW_LIMIT: [P2, P2] = [[w - 0.14, s - 0.1], [e + 0.14, n + 0.1]];
