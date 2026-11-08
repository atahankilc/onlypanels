// Fits real module rectangles into a measured roof surface, in the surface's own plane.
import { P3 } from "./geometry";
import type { Poly } from "./api";

const W = 1.13, H = 1.76, GAP = 0.03, EDGE = 0.4; // a usual module; the distance kept from every roof edge
type V = [number, number];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const within = (p: V, ring: V[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const gap = (p: V, a: V, b: V) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const clear = (p: V, ring: V[]) => ring.every((a, i) => gap(p, a, ring[(i + 1) % ring.length]) >= EDGE);

/** Every module that fits, lowest rows first, each as four corners in the model's metres. */
export function fit(poly: Poly, n: P3): P3[][] {
  const up = unit(n);
  const u = Math.abs(up[2]) > 0.99 ? ([1, 0, 0] as P3) : unit(cross([0, 0, 1], up));
  const v = cross(up, u), o = poly.ring[0];
  const flat = (p: P3): V => { const d: P3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return [dot(d, u), dot(d, v)]; };
  const ring = poly.ring.map(flat), holes = poly.holes.map((h) => h.map(flat));
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ok = (p: V) => within(p, ring) && clear(p, ring) && holes.every((h) => !within(p, h) && clear(p, h));
  let best: V[][] = [];
  for (const [w, h] of [[W, H], [H, W]]) for (const sx of [0, 0.33, 0.66]) for (const sy of [0, 0.5]) {
    const found: V[][] = [];
    for (let y = y0 + EDGE + sy * h; y + h <= y1; y += h + GAP) for (let x = x0 + EDGE + sx * w; x + w <= x1; x += w + GAP) {
      const c: V[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      if (c.every(ok) && ok([x + w / 2, y + h / 2])) found.push(c);
    }
    if (found.length > best.length) best = found;
  }
  const lift = 0.22, back = (p: V): P3 => [0, 1, 2].map((i) => o[i] + u[i] * p[0] + v[i] * p[1] + up[i] * lift) as P3;
  return best.sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]).map((c) => c.map(back));
}

/** The modules on a surface with those on the homeowner's marked cells first, and how many those are. A module counts as
 *  marked when its middle lies on a marked cell and no point near its corners lies on a cell the homeowner left free. The cell grid
 *  is laid onto the surface through its outline, the same way the map lays its colours: three outline corners fix the plane. */
export function ordered(poly: Poly, s: SurfaceCells, marked?: number[], taken?: number[]): { rects: P3[][]; inside: number } {
  let rects = fit(poly, s.n);
  const total = s.cells.length / 2;
  if (!taken?.length && (!marked || marked.length >= total)) return { rects, inside: rects.length }; // nothing drawn, or all of it marked
  if (!taken?.length && !marked?.length) return { rects, inside: 0 };
  const keep = new Set(marked ?? []), at = new Map<string, number>();
  for (let n = 0; n < s.cells.length / 2; n++) at.set(`${s.cells[n * 2]},${s.cells[n * 2 + 1]}`, n);
  const corners = [poly.ring, ...poly.holes].flat(), outline = [s.outline, ...s.holes].flat(), q0 = outline[0];
  const far = outline.reduce((k, p, i) => (Math.hypot(p[0] - q0[0], p[1] - q0[1]) > Math.hypot(outline[k][0] - q0[0], outline[k][1] - q0[1]) ? i : k), 0);
  const span = (i: number) => Math.abs((outline[far][0] - q0[0]) * (outline[i][1] - q0[1]) - (outline[far][1] - q0[1]) * (outline[i][0] - q0[0]));
  const side = outline.reduce((k, _, i) => (span(i) > span(k) ? i : k), 0);
  const P0 = corners[0], A: P3 = [0, 1, 2].map((i) => corners[far][i] - P0[i]) as P3, B: P3 = [0, 1, 2].map((i) => corners[side][i] - P0[i]) as P3;
  const aa = dot(A, A), ab = dot(A, B), bb = dot(B, B), det = aa * bb - ab * ab || 1;
  const cell = (X: P3) => {
    const d: P3 = [X[0] - P0[0], X[1] - P0[1], X[2] - P0[2]], da = dot(d, A), db = dot(d, B);
    const al = (da * bb - db * ab) / det, be = (db * aa - da * ab) / det;
    const qi = q0[0] + al * (outline[far][0] - q0[0]) + be * (outline[side][0] - q0[0]), qj = q0[1] + al * (outline[far][1] - q0[1]) + be * (outline[side][1] - q0[1]);
    return at.get(`${Math.round(qi)},${Math.round(qj)}`);
  };
  const mid = (r: P3[]): P3 => [0, 1, 2].map((i) => (r[0][i] + r[2][i]) / 2) as P3;
  // Cells that already carry panels hold no new module at all.
  if (taken?.length) { const old = new Set(taken); rects = rects.filter((r) => ![mid(r), ...r].some((p) => { const k = cell(p); return k !== undefined && old.has(k); })); }
  if (!marked || marked.length >= total) return { rects, inside: rects.length };
  // Corners are tested a little inside the module: cells are about a metre, and an edge on a cell boundary is not a module there.
  const inner = (r: P3[]) => { const m = mid(r); return r.map((p) => [0, 1, 2].map((i) => m[i] + (p[i] - m[i]) * 0.6) as P3); };
  const isMarked = (r: P3[]) => {
    const c = cell(mid(r));
    return c !== undefined && keep.has(c) && inner(r).every((p) => { const k = cell(p); return k === undefined || keep.has(k); });
  };
  const inside = rects.filter(isMarked), outside = rects.filter((r) => !isMarked(r));
  return { rects: [...inside, ...outside], inside: inside.length };
}
export type SurfaceCells = { n: P3; cells: number[]; outline: [number, number][]; holes: [number, number][][] };
