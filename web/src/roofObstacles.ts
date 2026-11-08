// Things on the roof the 3D model lacks, found on the public aerial photo by a vision model and confirmed by the planner.
// Only the public roof outlines go out; the cells under a confirmed obstacle hold no module.
import type { Selected } from "./api";
import { P2, toLngLat } from "./geometry";

export type ObstacleKind = "chimney" | "skylight" | "vent" | "dormer" | "antenna" | "solar" | "terrace" | "other";
/** One thing on the roof: its outline as lon/lat, how sure the model was, a few words, and whether the planner keeps it. */
export type Obstacle = { kind: ObstacleKind; ring: P2[]; sure: "high" | "medium" | "low"; note: string; on: boolean };
export type Look = { obstacles: Obstacle[]; source: string; reason?: string };

export const KIND: Record<ObstacleKind, string> = { chimney: "Chimney", skylight: "Roof window", vent: "Vent", dormer: "Dormer", antenna: "Antenna or dish", solar: "Solar collectors", terrace: "Terrace or railing", other: "Something else" };
const CLEAR_M = 0.3; // modules keep this far from an obstacle

/** Asks the engine's server to look at this home's roofs on the photo. A low-confidence find starts switched off. */
export async function findObstacles(buildings: Selected[]): Promise<Look> {
  const roofs = buildings.flatMap((b) => (b.real?.roofs ?? []).map((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]]))));
  const res = await fetch("/api/obstacles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roofs }) });
  if (!res.ok) throw new Error();
  const found = (await res.json()) as { obstacles: Omit<Obstacle, "on">[]; source: string; reason?: string };
  return { ...found, obstacles: found.obstacles.map((o) => ({ ...o, on: o.sure !== "low" })) };
}

/** The roof cells under the obstacles the planner keeps, per surface, a little wider so modules keep clear of them. */
export function blockedOf(buildings: Selected[], obstacles: Obstacle[] | undefined): Record<string, number[]> {
  const on = (obstacles ?? []).filter((o) => o.on);
  if (!on.length) return {};
  const boxes = on.map((o) => {
    const lat = o.ring[0][1], dLon = CLEAR_M / (111320 * Math.cos((lat * Math.PI) / 180)), dLat = CLEAR_M / 111320;
    return [Math.min(...o.ring.map((p) => p[0])) - dLon, Math.max(...o.ring.map((p) => p[0])) + dLon, Math.min(...o.ring.map((p) => p[1])) - dLat, Math.max(...o.ring.map((p) => p[1])) + dLat];
  });
  const out: Record<string, number[]> = {};
  for (const b of buildings) for (const s of b.sun?.surfaces ?? []) {
    if (s.kind !== "roof") continue;
    const hit: number[] = [];
    for (let n = 0; n < s.year.length; n++) {
      const lon = s.at[n * 3], lat = s.at[n * 3 + 1];
      if (boxes.some(([w, e, so, no]) => lon >= w && lon <= e && lat >= so && lat <= no)) hit.push(n);
    }
    if (hit.length) out[`${b.id}|${s.kind}${s.index}`] = hit;
  }
  return out;
}

/** Old panels and confirmed obstacles together: every cell where no new module may go. */
export const mergeCells = (a?: Record<string, number[]>, b?: Record<string, number[]>) => {
  const out: Record<string, number[]> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = [...new Set([...(out[k] ?? []), ...v])];
  return out;
};
