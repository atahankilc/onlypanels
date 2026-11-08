// Monument status for the planner's check, asked by the page itself from the Bavarian monument office's public map service
// (BLfD Denkmal-Daten, updated daily; it allows browser calls). No point passes through our server.
// A hint, never a ruling: a listed building or an ensemble needs a permit for solar in Bavaria, works close to a listed building can
// need one too, and only the lower monument authority decides. No entry does not mean no permit is needed.
import { Selected } from "./api";

const WMS = "https://geoservices.bayern.de/od/wms/gdi/v1/denkmal";
const NEAR_M = 20; // listed buildings this close count as neighbours whose setting may be protected
const WINDOW = 0.0002; // degrees each side of the point; with 81 pixels one pixel is about 30 cm, so a hit means the point itself

export type MonumentHit = { kind: "listed" | "ensemble"; id: string | null; name: string | null; address: string | null };
export type Monument = { status: "listed" | "ensemble" | "near" | "none" | "unknown"; here: MonumentHit[]; near: MonumentHit[] };
const ORDER: Monument["status"][] = ["listed", "ensemble", "near", "unknown", "none"];

/** Every feature of the given layers at one point. Throws when the service does not answer. */
async function ask(lat: number, lon: number, layers: string): Promise<MonumentHit[]> {
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", LAYERS: layers, QUERY_LAYERS: layers, SRS: "EPSG:4326",
    BBOX: [lon - WINDOW, lat - WINDOW, lon + WINDOW, lat + WINDOW].join(","), WIDTH: "81", HEIGHT: "81", X: "40", Y: "40",
    INFO_FORMAT: "application/vnd.ogc.gml", FEATURE_COUNT: "10",
  });
  const r = await fetch(`${WMS}?${q}`);
  if (!r.ok) throw new Error(`monument map ${r.status}`);
  const doc = new DOMParser().parseFromString(await r.text(), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("monument map gave no XML");
  const hits: MonumentHit[] = [];
  for (const layer of Array.from(doc.documentElement.children)) {
    const kind = layer.tagName.startsWith("bauensemble") ? "ensemble" : "listed";
    for (const f of Array.from(layer.children).filter((c) => c.tagName.endsWith("_feature"))) {
      const text = (tag: string) => f.getElementsByTagName(tag)[0]?.textContent?.trim() || null;
      hits.push({ kind, id: text("aktennummer"), name: text("tradobjbez") ?? text("bezeichnung") ?? text("funktion"), address: text("adresse") });
    }
  }
  return hits;
}

/** What is listed at one point (a building, an ensemble) and which listed buildings stand within about 20 m. */
async function around(lat: number, lon: number): Promise<Monument> {
  const dlat = NEAR_M / 111320, dlon = NEAR_M / (111320 * Math.cos((lat * Math.PI) / 180));
  try {
    const [here, ...ring] = await Promise.all([ask(lat, lon, "einzeldenkmalO,bauensembleO"),
      ...[[dlat, 0], [-dlat, 0], [0, dlon], [0, -dlon]].map(([a, b]) => ask(lat + a, lon + b, "einzeldenkmalO"))]);
    const listed = here.filter((h) => h.kind === "listed"), ensemble = here.filter((h) => h.kind === "ensemble");
    const seen = new Set(listed.map((h) => h.id));
    const near = [...new Map(ring.flat().filter((h) => !seen.has(h.id)).map((h) => [h.id, h])).values()];
    return { status: listed.length ? "listed" : ensemble.length ? "ensemble" : near.length ? "near" : "none", here: [...listed, ...ensemble], near };
  } catch {
    return { status: "unknown", here: [], near: [] };
  }
}

/** Every part of a home asked at its middle point; the strongest status wins. */
export async function monumentOf(buildings: Selected[]): Promise<Monument> {
  const all = await Promise.all(buildings.map((b) => around(b.origin[1], b.origin[0])));
  const unique = (hits: MonumentHit[]) => [...new Map(hits.map((h) => [h.id ?? h.name, h])).values()];
  return { status: ORDER.find((s) => all.some((m) => m.status === s)) ?? "unknown", here: unique(all.flatMap((m) => m.here)), near: unique(all.flatMap((m) => m.near)) };
}
