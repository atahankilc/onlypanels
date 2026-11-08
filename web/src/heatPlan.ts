// Munich's heat plan at a home, for the planner's check, asked by the page itself from the city's map server (Geoportal München,
// layers of the municipal heat plan; it allows browser calls). No point passes through our server.
// The heat plan says how the city expects an area to be heated: from a heat network, or by each building on its own (mostly heat
// pumps). Where a network is coming, a heat pump may be the wrong offer. A hint for the planner, not a ruling; the plan covers the
// city of Munich only.
import type { Selected } from "./api";

const WMS = "https://geoportal.muenchen.de/geoserver/ows";
const WINDOW = 0.0002; // degrees each side of the point; with 81 pixels one pixel is about 30 cm

/** The official area type under the Heat Planning Act (WPG). */
const AREA = "rku:wpg_eignung";
/** What the plan adds on top, worded for the planner. */
const DETAILS: [string, string][] = [
  ["rku:wp_ueberlagernd_fernwaermeverdichtung", "district heating is there to connect to"],
  ["rku:wp_ueberlagernd_fernwaermeverdichtung_dampf", "a steam district heating network is there"],
  ["rku:wp_ueberlagernd_fernwaermeerweiterung", "district heating is being built from 2025"],
  ["rku:wp_ueberlagernd_fernwaermeerweiterung_27", "district heating is planned from 2027"],
  ["rku:wp_ueberlagernd_waermenetzuntersuchung", "a heat network is being studied"],
  ["rku:wp_ueberlagernd_luftwaermepumpe", "an air-source heat pump suits the area"],
  ["rku:wp_ueberlagernd_grundwasserwaermepumpe", "a groundwater heat pump is possible"],
  ["rku:wp_ueberlagernd_erdwaermekollektor", "a ground collector is possible"],
  ["rku:wp_ueberlagernd_sanierung", "a heat pump after renovation"],
];

export type HeatPlan = { area: "network" | "own" | "other" | "none" | "unknown"; label: string | null; details: string[] };
const ORDER: HeatPlan["area"][] = ["network", "other", "own", "unknown", "none"];

/** The features of one layer at one point. Throws when the server does not answer. */
async function ask(lat: number, lon: number, layer: string): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", LAYERS: layer, QUERY_LAYERS: layer, SRS: "EPSG:4326",
    BBOX: [lon - WINDOW, lat - WINDOW, lon + WINDOW, lat + WINDOW].join(","), WIDTH: "81", HEIGHT: "81", X: "40", Y: "40",
    INFO_FORMAT: "application/json", FEATURE_COUNT: "5",
  });
  const r = await fetch(`${WMS}?${q}`);
  if (!r.ok) throw new Error(`heat plan map ${r.status}`);
  const body = await r.json();
  return (body.features ?? []).map((f: { properties?: Record<string, unknown> }) => f.properties ?? {});
}

async function at(lat: number, lon: number): Promise<HeatPlan> {
  try {
    // A detail layer that fails only loses its sentence; the area type must answer.
    const [area, ...details] = await Promise.all([ask(lat, lon, AREA), ...DETAILS.map(([layer]) => ask(lat, lon, layer).catch(() => []))]);
    const label = (area[0]?.wpg_typ as string | undefined) ?? null;
    const kind: HeatPlan["area"] = !label ? "none" : /w(ä|ae)rmenetz/i.test(label) ? "network" : /dezentral/i.test(label) ? "own" : "other";
    return { area: kind, label, details: DETAILS.filter((_, k) => details[k].length).map(([, text]) => text) };
  } catch {
    return { area: "unknown", label: null, details: [] };
  }
}

/** Every part of a home asked at its middle point; a network area wins over the rest. */
export async function heatPlanOf(buildings: Selected[]): Promise<HeatPlan> {
  const all = await Promise.all(buildings.map((b) => at(b.origin[1], b.origin[0])));
  const area = ORDER.find((a) => all.some((p) => p.area === a)) ?? "unknown";
  const main = all.find((p) => p.area === area);
  return { area, label: main?.label ?? null, details: [...new Set(all.flatMap((p) => p.details))] };
}
