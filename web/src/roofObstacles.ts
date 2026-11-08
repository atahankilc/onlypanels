// Things on the roof the 3D model lacks, found on the public aerial photo by a vision model and confirmed by the planner.
// Only the public roof outlines go out; the cells under a confirmed obstacle hold no module.
import type { Selected } from "./api";
import { P2, toLngLat, toLocal } from "./geometry";

export type ObstacleKind = "chimney" | "skylight" | "vent" | "dormer" | "antenna" | "solar" | "terrace" | "other";
/** One thing on the roof: its outline as lon/lat, how sure the model was, a few words, and whether the planner keeps it. */
export type Obstacle = { kind: ObstacleKind; ring: P2[]; sure: "high" | "medium" | "low"; note: string; on: boolean };
export type Look = { obstacles: Obstacle[]; source: string; reason?: string };

export const KIND: Record<ObstacleKind, string> = { chimney: "Chimney", skylight: "Roof window", vent: "Vent", dormer: "Dormer", antenna: "Antenna or dish", solar: "Solar collectors", terrace: "Terrace or railing", other: "Something else" };
const CLEAR_M = 0.3; // modules keep this far from an obstacle
const within = (p: P2, ring: P2[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Asks the engine's server to look at this home's roofs on the photo. A low-confidence find starts switched off. */
export async function findObstacles(buildings: Selected[]): Promise<Look> {
  const roofs = buildings.flatMap((b) => (b.real?.roofs ?? []).map((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]]))));
  const res = await fetch("/api/obstacles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roofs }) });
  if (!res.ok) throw new Error();
  const found = (await res.json()) as { obstacles: Omit<Obstacle, "on">[]; source: string; reason?: string };
  return { ...found, obstacles: found.obstacles.map((o) => ({ ...o, on: o.sure !== "low" })) };
}

/** The roof cells under the obstacles the planner keeps, per surface, a little wider so modules keep clear of them. */
export function blockedOf(buildings: Selected[], obstacles: Obstacle[] | undefined, clear = CLEAR_M): Record<string, number[]> {
  const on = (obstacles ?? []).filter((o) => o.on);
  if (!on.length) return {};
  const out: Record<string, number[]> = {};
  for (const b of buildings) {
    const rings = on.map((o) => widened(b, o.ring, clear));
    for (const s of b.sun?.surfaces ?? []) {
      if (s.kind !== "roof") continue;
      const hit: number[] = [];
      for (let n = 0; n < s.year.length; n++) {
        const p = toLocal(b.origin, [s.at[n * 3], s.at[n * 3 + 1]]);
        if (rings.some((r) => within(p, r))) hit.push(n);
      }
      if (hit.length) out[`${b.id}|${s.kind}${s.index}`] = hit;
    }
  }
  return out;
}

/** An obstacle's outline in one building's metres, widened by the clearance along its own sides: the server turns each box
 *  to its roof, so it is a turned rectangle, not one that follows the map's north. */
const widened = (b: { origin: P2 }, ring: P2[], clear: number): P2[] => {
  const q = ring.map((p) => toLocal(b.origin, p));
  if (q.length !== 4) return q;
  const side = (i: number): P2 => { const d: P2 = [q[i][0] - q[0][0], q[i][1] - q[0][1]], l = Math.hypot(...d) || 1; return [(d[0] / l) * clear, (d[1] / l) * clear]; };
  const u = side(1), v = side(3);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv], i) => [q[i][0] + su * u[0] + sv * v[0], q[i][1] + su * u[1] + sv * v[1]] as P2);
};

/** The kept obstacles in one building's own metres, seen from above and widened by the clearance: no module may touch one. */
export function avoidOf(b: Selected, obstacles: { ring: P2[]; on: boolean }[] | undefined, clear = CLEAR_M): P2[][] {
  return (obstacles ?? []).filter((o) => o.on).map((o) => widened(b, o.ring, clear));
}

/** Old panels and confirmed obstacles together: every cell where no new module may go. */
export const mergeCells = (a?: Record<string, number[]>, b?: Record<string, number[]>) => {
  const out: Record<string, number[]> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = [...new Set([...(out[k] ?? []), ...v])];
  return out;
};
