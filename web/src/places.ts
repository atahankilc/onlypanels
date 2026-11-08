// Addresses and the area around a home, worked out in the browser. Nothing here goes through our own server:
// the typed text and a clicked point go to Photon (komoot, Germany, OpenStreetMap data), so every service stays in the EU,
// and the census is a static file of public aggregates the page reads whole, so nobody learns which cell was looked up.
import { REGION } from "./region";

export type Place = { label: string; lat: number; lon: number };
/** The 2022 census around a point: the most common build period and heating, with their shares. Empty where there is no data. */
export type Area = { built?: string | null; built_share?: number; buildings?: number; heating?: string | null; heating_share?: number; heated?: number; metres?: number };

const PHOTON = "https://photon.komoot.io/"; // made for search-as-you-type, and in the EU
const { west, south, east, north } = REGION;
const inRegion = (p: Place) => p.lon >= west && p.lon <= east && p.lat >= south && p.lat <= north;

const json = <T,>(url: string, ms: number): Promise<T> => {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), ms);
  return fetch(url, { signal: stop.signal }).then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<T>; }).finally(() => clearTimeout(timer));
};
const joined = (...xs: (string | undefined | null)[]) => xs.filter(Boolean).join(" ");

type PhotonFeature = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } };
const fromPhoton = ({ properties: p, geometry }: PhotonFeature): Place => {
  const street = joined(p.street, p.housenumber), town = joined(p.postcode, p.city ?? p.county);
  const label = [p.name, street !== p.name ? street : null, town].filter(Boolean).join(", ");
  return { label, lat: geometry.coordinates[1], lon: geometry.coordinates[0] };
};

/** Places for a partly typed address, inside the region. */
export async function searchPlace(text: string): Promise<Place[]> {
  const p = new URLSearchParams({ q: text.trim(), limit: "6", bbox: [west, south, east, north].join(",") });
  const places = (await json<{ features: PhotonFeature[] }>(`${PHOTON}api/?${p}`, 6000)).features.map(fromPhoton);
  return [...new Map(places.filter(inRegion).map((x) => [x.label, x])).values()];
}

// Photon turns away a burst (503), as when the demo's homes load together: one question at a time, twice more if refused.
let line: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
function queued<T>(ask: () => Promise<T>): Promise<T> {
  const run = line.then(async () => {
    for (let tries = 0; ; tries++) {
      try { return await ask(); } catch (e) { if (tries >= 2) throw e; await pause(600 * (tries + 1)); }
    }
  });
  line = run.catch(() => undefined);
  return run;
}

const reverseSeen = new Map<string, Promise<Place>>();
/** The address at a clicked point. Remembered, so a second click on the same home asks nobody. */
export function placeAt(lat: number, lon: number): Promise<Place> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (!reverseSeen.has(key)) {
    const p = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5), limit: "1" });
    const asked = queued(() => json<{ features: PhotonFeature[] }>(`${PHOTON}reverse?${p}`, 8000)).then(({ features: [f] }) => {
      if (!f) throw new Error("no address here");
      const { street, housenumber, postcode, city } = f.properties, label = [joined(street, housenumber), joined(postcode, city)].filter(Boolean).join(", ");
      return { ...fromPhoton(f), label: label || fromPhoton(f).label, lat, lon };
    });
    asked.catch(() => reverseSeen.delete(key));
    reverseSeen.set(key, asked);
  }
  return reverseSeen.get(key)!;
}

// --- Census 2022, 100 m grid (© Statistisches Bundesamt (Destatis), 2024, dl-de/by-2-0). Same rules as engine zensus.py.
const PERIOD: Record<string, string> = { Vor1919: "before1979", a1919bis1948: "before1979", a1949bis1978: "before1979", a1979bis1990: "1979to1990",
  a1991bis2000: "1991to2000", a2001bis2010: "2001to2010", a2011bis2019: "since2011", a2020undspaeter: "since2011" };
const HEATING: Record<string, string> = { Gas: "Gas", Heizoel: "Oil", Holz_Holzpellets: "OtherRenewable", Biomasse_Biogas: "OtherRenewable",
  Solar_Geothermie_Waermepumpen: "Heatpump", Fernwaerme: "District", Strom: "Electric" };
const REACHES = [1, 3]; // 3 × 3 cells first, 7 × 7 if that holds too few homes
const MIN_BUILDINGS = 5;
type Census = { built: string[]; heat: string[]; cells: Record<string, number[]> };
let census: Promise<Census | null> | null = null;
const loadCensus = () => (census ??= fetch("/zensus.json").then((r) => (r.ok ? (r.json() as Promise<Census>) : null)).catch(() => null));

/** WGS84 to ETRS89-LAEA (EPSG:3035), the census grid's own projection. Snyder's ellipsoidal formulas, GRS80. */
export function laea(lon: number, lat: number): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), e = Math.sqrt(e2), rad = Math.PI / 180;
  const q = (phi: number) => { const s = Math.sin(phi); return (1 - e2) * (s / (1 - e2 * s * s) - Math.log((1 - e * s) / (1 + e * s)) / (2 * e)); };
  const qp = q(Math.PI / 2), phi1 = 52 * rad, dl = (lon - 10) * rad;
  const b1 = Math.asin(q(phi1) / qp), b = Math.asin(q(lat * rad) / qp), rq = a * Math.sqrt(qp / 2);
  const d = (a * Math.cos(phi1)) / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2) / (rq * Math.cos(b1));
  const bb = rq * Math.sqrt(2 / (1 + Math.sin(b1) * Math.sin(b) + Math.cos(b1) * Math.cos(b) * Math.cos(dl)));
  return [4321000 + bb * d * Math.cos(b) * Math.sin(dl), 3210000 + (bb / d) * (Math.cos(b1) * Math.sin(b) - Math.sin(b1) * Math.cos(b) * Math.cos(dl))];
}

function within(c: Census, lon: number, lat: number, reach: number): Area {
  const [x, y] = laea(lon, lat), cx = Math.floor(x / 100) * 100, cy = Math.floor(y / 100) * 100, nb = c.built.length;
  const built: Record<string, number> = {}, heat: Record<string, number> = {};
  for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
    const row = c.cells[`E${cx + dx * 100}N${cy + dy * 100}`];
    if (!row) continue;
    c.built.forEach((name, i) => { built[PERIOD[name]] = (built[PERIOD[name]] ?? 0) + row[i]; });
    c.heat.forEach((name, i) => { const k = HEATING[name] ?? "Other"; heat[k] = (heat[k] ?? 0) + row[nb + i]; });
  }
  const top = (counts: Record<string, number>): [string | null, number, number] => {
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (!total) return [null, 0, 0];
    const best = Object.keys(counts).reduce((m, k) => (counts[k] > counts[m] ? k : m));
    return [best, Math.round((counts[best] / total) * 100) / 100, total];
  };
  const [b, bs, bn] = top(built), [h, hs, hn] = top(heat);
  return { built: b, built_share: bs, buildings: bn, heating: h, heating_share: hs, heated: hn, metres: (2 * reach + 1) * 100 };
}

/** What the 2022 census says about the homes around a point. Empty without the data. */
export async function areaAt(lat: number, lon: number): Promise<Area> {
  const c = await loadCensus();
  if (!c) return {};
  let found: Area = {};
  for (const reach of REACHES) {
    found = within(c, lon, lat, reach);
    if ((found.buildings ?? 0) >= MIN_BUILDINGS) break;
  }
  return found;
}
