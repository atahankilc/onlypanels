// Plain geometry in metres around a local origin: x east, y north, z up.
// Roof shapes here are assumptions from the footprint, not a survey.
export type P2 = [number, number];
export type P3 = [number, number, number];

const RAD = Math.PI / 180;
const M_PER_DEG = 111320;
const PANEL_W = 1.13, PANEL_L = 1.76, GAP = 0.03;
const INSET = 0.4; // keep clear of roof edges
const FLAT_TILT = 15, GROUND_TILT = 25;
const FLAT_ROW_GAP = 1.0, GROUND_ROW_GAP = 1.9; // against rows shading each other
const MAX_PANELS = 200; // per surface: far above any home system

export const toLocal = (o: P2, p: P2): P2 => [(p[0] - o[0]) * M_PER_DEG * Math.cos(o[1] * RAD), (p[1] - o[1]) * M_PER_DEG];
export const toLngLat = (o: P2, p: P2): P2 => [o[0] + p[0] / (M_PER_DEG * Math.cos(o[1] * RAD)), o[1] + p[1] / M_PER_DEG];

export const area = (r: P2[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export const centre = (r: P2[]): P2 => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

export function inside(p: P2, r: P2[]) {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) hit = !hit;
  }
  return hit;
}

/** Smallest rectangle around the footprint: its long direction is the likely ridge. */
export function longAxis(r: P2[]) {
  let best = { size: Infinity, angle: 0, length: 0, width: 0, mid: [0, 0] as P2 };
  r.forEach((p, i) => {
    const q = r[(i + 1) % r.length];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const u: P2 = [Math.cos(a), Math.sin(a)], v: P2 = [-u[1], u[0]];
    const us = r.map((c) => c[0] * u[0] + c[1] * u[1]), vs = r.map((c) => c[0] * v[0] + c[1] * v[1]);
    const du = Math.max(...us) - Math.min(...us), dv = Math.max(...vs) - Math.min(...vs);
    if (du * dv >= best.size) return;
    const mu = (Math.max(...us) + Math.min(...us)) / 2, mv = (Math.max(...vs) + Math.min(...vs)) / 2;
    best = { size: du * dv, angle: du >= dv ? a : a + Math.PI / 2, length: Math.max(du, dv), width: Math.min(du, dv), mid: [mu * u[0] + mv * v[0], mu * u[1] + mv * v[1]] };
  });
  return best;
}

/** Keeps the part of the ring on the side the normal points to. */
function clip(r: P2[], o: P2, n: P2) {
  const side = (p: P2) => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
  const out: P2[] = [];
  r.forEach((p, i) => {
    const q = r[(i + 1) % r.length], a = side(p), b = side(q);
    if (a >= 0) out.push(p);
    if (a >= 0 !== b >= 0) { const t = a / (a - b); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  });
  return out;
}

export type Face = { ring: P3[]; base: number; tilt: number; azimuth: number; side: string; m2: number; panels: P3[][] };
const bearing = (n: P2) => (Math.atan2(n[0], n[1]) / RAD + 360) % 360;
export const compass = (a: number) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(a / 45) % 8];

/** Rows of panels inside the ring. u runs along a row, n points down the slope. */
function grid(ring: P2[], u: P2, n: P2, depth: number, pitch: number, height: (p: P2) => number) {
  const us = ring.map((p) => p[0] * u[0] + p[1] * u[1]), ns = ring.map((p) => p[0] * n[0] + p[1] * n[1]);
  const at = (a: number, b: number): P2 => [a * u[0] + b * n[0], a * u[1] + b * n[1]];
  const fits = (a: number, b: number) => [[-INSET, -INSET], [PANEL_W + INSET, -INSET], [PANEL_W + INSET, depth + INSET], [-INSET, depth + INSET]].every(([x, y]) => inside(at(a + x, b + y), ring));
  const u0 = Math.min(...us), u1 = Math.max(...us), mid = (u0 + u1) / 2;
  const rows: P3[][][] = [];
  for (let b = Math.max(...ns) - depth - INSET; b >= Math.min(...ns); b -= pitch) {
    const row: { d: number; c: P3[] }[] = [];
    for (let a = u0; a + PANEL_W <= u1; a += PANEL_W + GAP) {
      if (!fits(a, b)) continue;
      const c = [at(a, b), at(a + PANEL_W, b), at(a + PANEL_W, b + depth), at(a, b + depth)];
      row.push({ d: Math.abs(a + PANEL_W / 2 - mid), c: c.map((p) => [p[0], p[1], height(p)] as P3) });
    }
    rows.push(row.sort((x, y) => x.d - y.d).map((x) => x.c));
  }
  return rows.flat().slice(0, MAX_PANELS);
}

export function pitchedFaces(ring: P2[], eave: number, tilt: number, flip: boolean): Face[] {
  const a = longAxis(ring), angle = a.angle + (flip ? Math.PI / 2 : 0), half = (flip ? a.length : a.width) / 2;
  const slope = Math.tan(tilt * RAD), depth = PANEL_L * Math.cos(tilt * RAD);
  const u: P2 = [Math.cos(angle), Math.sin(angle)];
  return [1, -1].map((s) => {
    const n: P2 = [-u[1] * s, u[0] * s];
    const poly = clip(ring, a.mid, n);
    const z = (p: P2) => eave + Math.max(0, half - ((p[0] - a.mid[0]) * n[0] + (p[1] - a.mid[1]) * n[1])) * slope;
    const azimuth = bearing(n);
    return { ring: poly.map((p) => [p[0], p[1], z(p)] as P3), base: eave, tilt, azimuth, side: compass(azimuth),
      m2: area(poly) / Math.cos(tilt * RAD), panels: grid(poly, u, n, depth, depth + GAP, (p) => z(p) + 0.12) };
  });
}

function southRows(ring: P2[], base: number, tilt: number, gap: number): Face {
  const depth = PANEL_L * Math.cos(tilt * RAD), rise = Math.tan(tilt * RAD);
 
  const n: P2 = [0, -1];
  const rows = grid(ring, [1, 0], n, depth, depth + gap, () => 0).map((c) => {
    const low = Math.min(...c.map((p) => p[1]));
    return c.map((p) => [p[0], p[1], base + 0.3 + (p[1] - low) * rise] as P3);
  });
  return { ring: ring.map((p) => [p[0], p[1], base] as P3), base, tilt, azimuth: 180, side: "south", m2: area(ring), panels: rows };
}

export const flatFace = (ring: P2[], eave: number) => southRows(ring, eave + 0.05, FLAT_TILT, FLAT_ROW_GAP);
export const groundFace = (ring: P2[]) => southRows(ring, 0.05, GROUND_TILT, GROUND_ROW_GAP);
