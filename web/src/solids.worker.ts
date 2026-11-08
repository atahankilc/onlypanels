/// <reference lib="webworker" />
// Turns a square's measured roofs and walls into one mesh, away from the page, so the map never stalls while a square arrives.
// Points land in the same metres as the square's lines: the map's own projection around the square's corner.
import { ShapeUtils, Vector2 } from "three";

type P3 = [number, number, number];
type Poly = { ring: P3[]; holes: P3[][] };
export type Ask = { name: string; at: [number, number] };
export type Detail = {
  name: string; ids: string[]; starts: Uint32Array; // building k owns vertices starts[k] .. starts[k + 1]
  positions: Float32Array; shade: Float32Array; roof: Uint8Array; index: Uint32Array; lines: Float32Array;
};

const EARTH_RADIUS_M = 6371008.8; // the map's own value, as on the server
const LINE_LIFT_M = 0.05; // just above the surface it outlines, so it does not flicker

const mercator = (lon: number, lat: number): [number, number] =>
  [(180 + lon) / 360, (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360];

/** Newell's normal: right for any flat ring, however its points go. */
function normal(r: P3[]): P3 {
  let x = 0, y = 0, z = 0;
  r.forEach((p, i) => { const q = r[(i + 1) % r.length]; x += (p[1] - q[1]) * (p[2] + q[2]); y += (p[2] - q[2]) * (p[0] + q[0]); z += (p[0] - q[0]) * (p[1] + q[1]); });
  const l = Math.hypot(x, y, z) || 1;
  return z < 0 ? [-x / l, -y / l, -z / l] : [x / l, y / l, z / l];
}

self.onmessage = async ({ data }: MessageEvent<Ask>) => {
  const { name, at } = data;
  try {
    const text = await (await fetch(`/api/site/solids/${name}`)).text();
    const [ox, oy] = mercator(at[0], at[1]), unit = 1 / (2 * Math.PI * EARTH_RADIUS_M * Math.cos((at[1] * Math.PI) / 180));
    const local = (r: P3[]): P3[] => r.map((p) => { const [x, y] = mercator(p[0], p[1]); return [(x - ox) / unit, (oy - y) / unit, p[2]]; });
    const positions: number[] = [], shade: number[] = [], roof: number[] = [], index: number[] = [], lines: number[] = [], ids: string[] = [], starts: number[] = [];
    for (const row of text.split("\n")) {
      const tab = row.indexOf("\t");
      if (tab < 0) continue;
      ids.push(row.slice(0, tab));
      starts.push(positions.length / 3);
      const solid = JSON.parse(row.slice(tab + 1)) as { roofs: Poly[]; walls: Poly[] };
      for (const [list, isRoof] of [[solid.walls, 0], [solid.roofs, 1]] as const) for (const poly of list) {
        const ring = local(poly.ring), holes = poly.holes.map(local);
        if (ring.length < 3) continue;
        const n = normal(ring), a = n.map(Math.abs), drop = a.indexOf(Math.max(...a)), keep = [0, 1, 2].filter((i) => i !== drop);
        const flat = (r: P3[]) => r.map((p) => new Vector2(p[keep[0]], p[keep[1]]));
        // One light from the south, as on the chosen home: the sides of a roof read apart, east and west walls sit a step darker.
        const s = isRoof ? 0.95 - 0.35 * n[1] : 1 - 0.24 * Math.abs(n[0]);
        const first = positions.length / 3;
        for (const p of [ring, ...holes].flat()) { positions.push(p[0], p[1], p[2]); shade.push(s); roof.push(isRoof); }
        for (const t of ShapeUtils.triangulateShape(flat(ring), holes.map(flat))) index.push(first + t[0], first + t[1], first + t[2]);
        for (const r of [ring, ...holes]) r.forEach((p, i) => { const q = r[(i + 1) % r.length]; lines.push(p[0], p[1], p[2] + LINE_LIFT_M, q[0], q[1], q[2] + LINE_LIFT_M); });
      }
    }
    starts.push(positions.length / 3);
    const out: Detail = {
      name, ids, starts: new Uint32Array(starts), positions: new Float32Array(positions), shade: new Float32Array(shade),
      roof: new Uint8Array(roof), index: new Uint32Array(index), lines: new Float32Array(lines),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(out, [out.starts.buffer, out.positions.buffer, out.shade.buffer, out.roof.buffer, out.index.buffer, out.lines.buffer]);
  } catch {
    (self as DedicatedWorkerGlobalScope).postMessage({ name, failed: true });
  }
};
