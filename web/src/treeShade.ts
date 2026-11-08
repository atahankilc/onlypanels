// Trees that may shade the roof, for the planner's check. Bavaria's single trees (Einzelbäume 2024, CC BY 4.0; trees from 5.5 m up)
// come from our server one whole 2 km square at a time (scripts/build_trees.py), so no point of the home is sent. The 3D model and
// its sun figures leave trees out; this only says where trees stand high enough, towards the sun, to take some of it.
import type { Selected, SunSurface } from "./api";
import { surfaceName } from "./api";
import { toUtm } from "./utm";

const RADIUS_M = 40; // trees further off rarely reach a roof's sun in a city
const SOME_DEG = 15; // a tree rising this high above the roof, seen from it, blocks the low winter sun (about 19° at noon in Munich)
const MUCH_DEG = 30; // this high it blocks the spring and autumn sun too (about 42° at noon)

export type Shade = {
  status: "much" | "some" | "none" | "unknown";
  trees: number; tallest: number | null; nearest: number | null; // the trees that shade: count, tallest (m above ground), nearest (m)
  surfaces: { name: string; level: "much" | "some" }[];
};

const squares = new Map<string, Promise<number[]>>();
/** One whole square's trees: east, north, height in decimetres from its south-west corner. */
function square(name: string): Promise<number[]> {
  let p = squares.get(name);
  if (!p) {
    p = fetch(`/api/site/trees/${name}`).then((r) => { if (!r.ok) throw new Error(`trees ${r.status}`); return r.json(); });
    p.catch(() => squares.delete(name)); // an outage is not remembered
    squares.set(name, p);
  }
  return p;
}
const nameOf = (x: number, y: number) => `${Math.floor(x / 2000) * 2}_${Math.floor(y / 2000) * 2}`;

/** Where the surface's samples sit on average: east, north (UTM 32) and height above the building's floor. */
function middle(s: SunSurface): [number, number, number] | null {
  const k = s.at.length / 3;
  if (!k) return null;
  let lon = 0, lat = 0, z = 0;
  for (let i = 0; i < s.at.length; i += 3) { lon += s.at[i]; lat += s.at[i + 1]; z += s.at[i + 2]; }
  const [x, y] = toUtm(lon / k, lat / k);
  return [x, y, z / k];
}

export async function treeShadeOf(buildings: Selected[]): Promise<Shade> {
  const roofs = buildings.flatMap((b) => (b.sun?.surfaces ?? []).filter((s) => s.kind === "roof")).map((s) => ({ s, at: middle(s) })).filter((r) => r.at) as { s: SunSurface; at: [number, number, number] }[];
  if (!roofs.length) return { status: "unknown", trees: 0, tallest: null, nearest: null, surfaces: [] };
  // Every square a tree within reach of a roof can lie in.
  const names = new Set<string>();
  for (const { at: [x, y] } of roofs) for (const dx of [-RADIUS_M, RADIUS_M]) for (const dy of [-RADIUS_M, RADIUS_M]) names.add(nameOf(x + dx, y + dy));
  let trees: [number, number, number][];
  try {
    const lists = await Promise.all([...names].map(async (n) => {
      const [sx, sy] = n.split("_").map((v) => Number(v) * 1000), v = await square(n), out: [number, number, number][] = [];
      for (let i = 0; i < v.length; i += 3) out.push([sx + v[i] / 10, sy + v[i + 1] / 10, v[i + 2] / 10]);
      return out;
    }));
    trees = lists.flat();
  } catch {
    return { status: "unknown", trees: 0, tallest: null, nearest: null, surfaces: [] };
  }
  const shading = new Map<number, { h: number; d: number }>(), surfaces: Shade["surfaces"] = [];
  for (const { s, at: [x, y, z] } of roofs) {
    let level: "much" | "some" | null = null;
    trees.forEach(([tx, ty, h], k) => {
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
      if (d > RADIUS_M || d < 1 || h <= z) return;
      const az = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // 0 north, 90 east, 180 south
      if (az < 90 || az > 270) return; // the sun never stands in the north here
      const up = (Math.atan((h - z) / d) * 180) / Math.PI;
      if (up < SOME_DEG) return;
      const much = up >= MUCH_DEG && az >= 120 && az <= 240;
      level = much || level === "much" ? "much" : "some";
      const seen = shading.get(k);
      if (!seen || d < seen.d) shading.set(k, { h, d });
    });
    if (level) surfaces.push({ name: surfaceName(s), level });
  }
  const list = [...shading.values()];
  return {
    status: surfaces.some((s) => s.level === "much") ? "much" : surfaces.length ? "some" : "none",
    trees: list.length, tallest: list.length ? Math.max(...list.map((t) => t.h)) : null, nearest: list.length ? Math.min(...list.map((t) => t.d)) : null,
    surfaces: [...surfaces.reduce((m, s) => (m.get(s.name)?.level === "much" ? m : m.set(s.name, s)), new Map<string, Shade["surfaces"][number]>()).values()],
  };
}
