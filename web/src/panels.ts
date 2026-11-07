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
