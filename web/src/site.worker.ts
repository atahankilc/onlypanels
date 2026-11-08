/// <reference lib="webworker" />
// A chosen home, worked out in the browser: its parts, its measured surfaces, and the sun on them over the year with what
// the neighbours block. A port of engine lod2.parts/building and sun.surfaces. Our server only ever hands out whole
// 2 km squares, as a map does, so it never learns which home was picked. Yearly sun comes from a PVGIS table the page
// reads whole.
import { toLonLat, toUtm } from "./utm";

type P2 = [number, number];
type P3 = [number, number, number];
type Poly = { ring: P3[]; holes: P3[][] };
type Solid = { roofs: Poly[]; walls: Poly[] };
type Feature = { properties: { id: string; home: string; h: number; lon: number; lat: number }; geometry: { coordinates: P2[][][] } };
export type SiteAsk = { id: number; op: "parts" | "building" | "sun"; square: string; key: string };
export type SiteReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

const TILE_M = 2000;
const MIN_SURFACE_M2 = 10, MAX_SAMPLES = 9000, LOOK_M = 160, LIFT_M = 0.35, PROBE_M = 1.5, MIN_FREE_M2 = 10;
const BLOCK_M = 70, CONTEXT_M = BLOCK_M + 26, TOUCH_M = 1.0, CONTEXT_STEP_M = 3, CLEARANCE_M = 0.5, DIFFUSE_SHARE = 0.5;
const MONTH_DAY = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];
const rad = Math.PI / 180;

// --- Squares, fetched whole and kept.
const homesOf = new Map<string, Promise<Feature[]>>();
const solidsOf = new Map<string, Promise<Map<string, string>>>();
const ok = (r: Response) => { if (!r.ok) throw new Error(`square ${r.status}`); return r; };
const homes = (sq: string) => {
  if (!homesOf.has(sq)) homesOf.set(sq, fetch(`/api/site/homes/${sq}`).then(ok).then((r) => r.json()).then((g) => g.features as Feature[]).catch((e) => { homesOf.delete(sq); throw e; }));
  return homesOf.get(sq)!;
};
const solids = (sq: string) => {
  if (!solidsOf.has(sq)) solidsOf.set(sq, fetch(`/api/site/solids/${sq}`).then(ok).then((r) => r.text()).then((text) => {
    const m = new Map<string, string>();
    for (const row of text.split("\n")) { const tab = row.indexOf("\t"); if (tab > 0) m.set(row.slice(0, tab), row.slice(tab + 1)); }
    return m;
  }).catch((e) => { solidsOf.delete(sq); throw e; }));
  return solidsOf.get(sq)!;
};
const tileName = (east: number, north: number) => `${Math.floor(east / TILE_M) * 2}_${Math.floor(north / TILE_M) * 2}`;

async function parts(sq: string, home: string) {
  return (await homes(sq)).filter((f) => f.properties.home === home).map((f) => ({ id: f.properties.id, at: [f.properties.lon, f.properties.lat] }));
}
async function building(sq: string, id: string): Promise<Solid | null> {
  const row = (await solids(sq)).get(id);
  return row ? JSON.parse(row) : null;
}

// --- Yearly sun from the PVGIS table: bilinear over the region, linear in tilt, around the compass in azimuth.
type Table = { lats: number[]; lons: number[]; tilts: number[]; azimuths: number[]; values: [number, number][][][][] };
let table: Promise<Table | null> | null = null;
const loadTable = () => (table ??= fetch("/sun-table.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
const bracket = (xs: number[], v: number): [number, number, number] => {
  if (v <= xs[0]) return [0, 0, 0];
  if (v >= xs[xs.length - 1]) return [xs.length - 1, xs.length - 1, 0];
  let i = 0;
  while (xs[i + 1] < v) i++;
  return [i, i + 1, (v - xs[i]) / (xs[i + 1] - xs[i])];
};
function yearly(t: Table, lat: number, lon: number, tilt: number, azimuth: number): [number, number] {
  const [la0, la1, fa] = bracket(t.lats, lat), [lo0, lo1, fo] = bracket(t.lons, lon), [t0, t1, ft] = bracket(t.tilts, tilt);
  const step = 360 / t.azimuths.length, az = ((azimuth % 360) + 360) % 360, a0 = Math.floor(az / step) % t.azimuths.length, a1 = (a0 + 1) % t.azimuths.length, fz = az / step - Math.floor(az / step);
  const out: [number, number] = [0, 0];
  for (const [la, wa] of [[la0, 1 - fa], [la1, fa]]) for (const [lo, wo] of [[lo0, 1 - fo], [lo1, fo]]) for (const [ti, wt] of [[t0, 1 - ft], [t1, ft]]) for (const [ai, wz] of [[a0, 1 - fz], [a1, fz]]) {
    const w = wa * wo * wt * wz;
    if (!w) continue;
    const v = t.values[la][lo][ti][ai];
    out[0] += w * v[0]; out[1] += w * v[1];
  }
  return out;
}

// --- Geometry, as in sun.py.
type V3 = [number, number, number];
const newell = (r: number[][]): V3 => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; x += (p[1] - q[1]) * (p[2] + q[2]); y += (p[2] - q[2]) * (p[0] + q[0]); z += (p[0] - q[0]) * (p[1] + q[1]); }
  return [x, y, z];
};
const norm = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function inside(x: number, y: number, ring: number[][]) {
  let hit = false;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    if (ay !== by && (ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

function directions(lat: number) {
  const found: { month: number; hour: number; az: number; el: number; vector: V3; strength: number }[] = [];
  const phi = lat * rad, r1 = (v: number) => Math.round(v * 10) / 10;
  MONTH_DAY.forEach((day, m) => {
    const dec = 23.44 * rad * Math.sin((2 * Math.PI * (day - 81)) / 365);
    for (let hour = 4; hour < 21; hour++) {
      const h = 15 * (hour - 12) * rad;
      const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h);
      if (sinEl < Math.sin(4 * rad)) continue;
      const el = Math.asin(sinEl);
      const az = Math.atan2(-Math.sin(h) * Math.cos(dec), Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(h));
      found.push({ month: m + 1, hour, az: r1((((az / rad) % 360) + 360) % 360), el: r1(el / rad),
        vector: [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)], strength: 0.7 ** ((1 / sinEl) ** 0.678) });
    }
  });
  return found;
}

/** Height of everything around a building, on a 1 m grid centred on it. */
class Heights {
  half: number; size: number; grid: Float32Array; top = 0;
  constructor(half: number) { this.half = half; this.size = 2 * half; this.grid = new Float32Array(this.size * this.size); }
  add(ring: number[][], height: number | null) {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const x0 = Math.max(Math.trunc(Math.min(...xs)) - 1, -this.half), x1 = Math.min(Math.trunc(Math.max(...xs)) + 2, this.half);
    const y0 = Math.max(Math.trunc(Math.min(...ys)) - 1, -this.half), y1 = Math.min(Math.trunc(Math.max(...ys)) + 2, this.half);
    if (x0 >= x1 || y0 >= y1) return;
    let n: V3 | null = null;
    if (height === null) { n = newell(ring); if (Math.abs(n[2]) < 1e-6) return; }
    const p = ring[0], flat = ring.map((q) => [q[0], q[1]]);
    for (let gx = x0; gx < x1; gx++) for (let gy = y0; gy < y1; gy++) {
      const cx = gx + 0.5, cy = gy + 0.5;
      if (!inside(cx, cy, flat)) continue;
      const z = n ? p[2] - (n[0] * (cx - p[0]) + n[1] * (cy - p[1])) / n[2] : height!;
      const k = (gx + this.half) * this.size + gy + this.half;
      if (z > this.grid[k]) { this.grid[k] = z; if (z > this.top) this.top = z; }
    }
  }
  at(x: number, y: number) {
    const ix = Math.floor(x) + this.half, iy = Math.floor(y) + this.half;
    return ix >= 0 && iy >= 0 && ix < this.size && iy < this.size ? this.grid[ix * this.size + iy] : null;
  }
  /** Whether another building stands right in front of a wall point. */
  against(p: number[], n: number[]) {
    const x = p[0] + PROBE_M * n[0], y = p[1] + PROBE_M * n[1], z = p[2] + PROBE_M * n[2], g = this.at(x, y);
    return g !== null && g > z;
  }
  /** Which points the sun cannot reach from this direction. */
  shaded(points: number[][], d: number[]) {
    const minZ = Math.min(...points.map((p) => p[2]));
    const steps = Math.trunc(Math.min(LOOK_M, (this.top - minZ) / Math.max(d[2], 0.03))) + 2;
    return points.map((p) => {
      for (let t = 1.5; t < steps; t += 1.5) {
        const g = this.at(p[0] + t * d[0], p[1] + t * d[1]);
        if (g !== null && g > p[2] + t * d[2] + CLEARANCE_M) return true;
      }
      return false;
    });
  }
}

const arange = (start: number, stop: number, step: number) => Array.from({ length: Math.max(0, Math.ceil((stop - start) / step)) }, (_, k) => start + k * step);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A grid of points on a flat surface: points, their cells, a way to place other rings on that grid, the normal, the area. */
function sample(ring: number[][], holes: number[][][], step: number) {
  const p0 = ring[0], nn = newell(ring), area = norm(nn) / 2, n = nn.map((v) => v / (2 * area)) as V3;
  let u = cross([0, 0, 1], n);
  u = norm(u) < 1e-6 ? [1, 0, 0] : (u.map((v) => v / norm(u)) as V3);
  const v = cross(n, u);
  const flat = (r: number[][]) => r.map((q) => { const d = [q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]; return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]]; });
  const a = flat(ring), fh = holes.map(flat);
  const as = a.map((q) => q[0]), bs = a.map((q) => q[1]);
  const ga = arange(Math.min(...as) + step / 2, Math.max(...as), step), gb = arange(Math.min(...bs) + step / 2, Math.max(...bs), step);
  const points: number[][] = [], cells: [number, number][] = [];
  ga.forEach((x, i) => gb.forEach((y, j) => {
    if (inside(x, y, a) && !fh.some((h) => inside(x, y, h))) { points.push([p0[0] + x * u[0] + y * v[0], p0[1] + x * u[1] + y * v[1], p0[2] + x * u[2] + y * v[2]]); cells.push([i, j]); }
  }));
  const a0 = ga.length && gb.length ? ga[0] : 0, b0 = ga.length && gb.length ? gb[0] : 0;
  const place = (r: number[][]) => flat(r).map(([x, y]) => [r2((x - a0) / step), r2((y - b0) / step)]);
  return { points, cells, place, n, area };
}

function dense(ring: number[][]) {
  const out: P2[] = [];
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / CONTEXT_STEP_M));
    for (let s = 0; s < k; s++) out.push([ax + ((bx - ax) * s) / k, ay + ((by - ay) * s) / k]);
  });
  return out;
}
function touches(ring: P2[], own: P2[]) {
  for (const [ox, oy] of own) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], dx = bx - ax, dy = by - ay;
      const t = Math.min(1, Math.max(0, ((ox - ax) * dx + (oy - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
      if (Math.hypot(ox - (ax + t * dx), oy - (ay + t * dy)) < TOUCH_M) return true;
    }
    if (inside(ox, oy, ring)) return true;
  }
  return false;
}
const pack = (bits: boolean[][]) => {
  const bytes: number[] = [];
  for (const row of bits) for (let i = 0; i < row.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | (row[i + k] ? 1 : 0); bytes.push(b); }
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

async function surfaces(sq: string, id: string) {
  const b = await building(sq, id);
  if (!b) return null;
  const ring0 = b.roofs[0].ring;
  const lon = ring0.reduce((s, p) => s + p[0], 0) / ring0.length, lat = ring0.reduce((s, p) => s + p[1], 0) / ring0.length;
  const [ox, oy] = toUtm(lon, lat);
  const metres = (r: number[][]) => r.map((p) => { const [x, y] = toUtm(p[0], p[1]); return [x - ox, y - oy, p[2]]; });
  const heights = new Heights(LOOK_M + 60);
  const cx = Math.round(ox / 10) * 10, cy = Math.round(oy / 10) * 10;
  const names = new Set([sq, ...[-LOOK_M, LOOK_M].flatMap((dx) => [-LOOK_M, LOOK_M].map((dy) => tileName(cx + dx, cy + dy)))]);
  const nearby: { other: string; h: number; ring: number[][]; square: string }[] = [];
  for (const name of names) {
    for (const f of await homes(name).catch(() => [] as Feature[])) {
      const { id: other, h, lon: flon, lat: flat } = f.properties;
      if (other === id) continue;
      const [x, y] = toUtm(flon, flat);
      if (Math.abs(x - cx) >= LOOK_M + 60 || Math.abs(y - cy) >= LOOK_M + 60) continue;
      for (const rings of f.geometry.coordinates) {
        const ring = metres(rings[0].map((p) => [p[0], p[1], 0]));
        heights.add(ring, h);
        const last = ring[ring.length - 1], closed = ring[0][0] === last[0] && ring[0][1] === last[1] && ring[0][2] === last[2];
        nearby.push({ other, h, ring: (closed ? ring.slice(0, -1) : ring).map((p) => [p[0], p[1]]), square: name });
      }
    }
  }
  for (const roof of b.roofs) heights.add(metres(roof.ring), null);

  const items = [...b.roofs.map((p, i) => ["roof", i, p] as const), ...b.walls.map((p, i) => ["wall", i, p] as const)];
  const shapes = items.flatMap(([kind, index, poly]) => {
    const ring = metres(poly.ring);
    return norm(newell(ring)) / 2 < MIN_SURFACE_M2 ? [] : [{ kind, index, ring, holes: poly.holes.map(metres) }];
  });
  const total = shapes.reduce((s, x) => s + norm(newell(x.ring)) / 2, 0);
  const step = Math.max(1, Math.sqrt(total / MAX_SAMPLES));
  const suns = directions(lat), t = await loadTable();
  const out = [];
  for (const s of shapes) {
    let { ring, holes } = s;
    if (s.kind === "roof" && newell(ring)[2] < 0) { ring = [...ring].reverse(); holes = holes.map((h) => [...h].reverse()); }
    let { points, cells, place, n, area } = sample(ring, holes, step);
    if (s.kind === "wall" && points.length) {
      const free = points.map((p) => !heights.against(p, n));
      points = points.filter((_, i) => free[i]); cells = cells.filter((_, i) => free[i]);
      area = points.length * step * step;
      if (area < MIN_FREE_M2) continue;
    }
    if (!points.length) continue;
    const tilt = Math.acos(Math.min(1, Math.abs(n[2]))) / rad, azimuth = (((Math.atan2(n[0], n[1]) / rad) % 360) + 360) % 360;
    const lifted = points.map((p) => [p[0] + LIFT_M * n[0], p[1] + LIFT_M * n[1], p[2] + LIFT_M * n[2]]);
    const cosines = suns.map((x) => n[0] * x.vector[0] + n[1] * x.vector[1] + n[2] * x.vector[2]);
    const seen = points.map(() => suns.map(() => false));
    suns.forEach((x, i) => { if (cosines[i] > 0.02) heights.shaded(lifted, x.vector).forEach((blocked, k) => { seen[k][i] = !blocked; }); });
    const weight = cosines.map((c, i) => Math.max(c, 0) * suns[i].strength), wsum = Math.max(weight.reduce((a, w) => a + w, 0), 1e-9);
    const y = t ? yearly(t, lat, lon, tilt, azimuth) : null, base = y ? y[0] : 1000;
    const at: number[] = [];
    for (const p of points) { const [plon, plat] = toLonLat(p[0] + ox, p[1] + oy); at.push(Math.round(plon * 1e7) / 1e7, Math.round(plat * 1e7) / 1e7, r2(p[2])); }
    out.push({ kind: s.kind, index: s.index, m2: Math.round(area * 10) / 10, tilt: Math.round(tilt), azimuth: Math.round(azimuth),
      kwh_m2: y ? Math.round(y[0]) : null, kwh_per_kwp: y ? Math.round(y[1]) : null,
      year: seen.map((row) => Math.round(base * (DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * row.reduce((a, v, i) => a + (v ? weight[i] : 0), 0) / wsum))),
      at, seen: pack(seen), cells: cells.flat(), outline: place(s.ring), holes: s.holes.map(place), n: n.map((v) => Math.round(v * 1e4) / 1e4) });
  }
  const own = b.roofs.flatMap((r) => dense(metres(r.ring)));
  const around = [], close = new Map<string, Set<string>>();
  for (const x of nearby) {
    const pts = dense(x.ring), gap = pts.map(([px, py]) => Math.min(...own.map(([qx, qy]) => Math.hypot(px - qx, py - qy))));
    const least = Math.min(...gap);
    if (least >= CONTEXT_M) continue;
    around.push({ id: x.other, h: x.h, touch: touches(pts, own), ring: pts.map(([px, py], i) => { const [a, c] = toLonLat(px + ox, py + oy); return [Math.round(a * 1e7) / 1e7, Math.round(c * 1e7) / 1e7, Math.round(gap[i] * 10) / 10]; }), solid: null as Solid | null });
    if (least < BLOCK_M) (close.get(x.square) ?? close.set(x.square, new Set()).get(x.square)!).add(x.other);
  }
  const found = new Map<string, Solid>();
  for (const [name, ids] of close) { const m = await solids(name).catch(() => new Map<string, string>()); for (const i of ids) { const row = m.get(i); if (row) found.set(i, JSON.parse(row)); } }
  for (const item of around) item.solid = found.get(item.id) ?? null;
  return { around, step: r2(step), suns: suns.map(({ month, hour, az, el, vector, strength }) => ({ month, hour, az, el, vector, strength })), surfaces: out, sunny: !!t && out.length > 0, missing: t ? 0 : out.length };
}

self.onmessage = async ({ data }: MessageEvent<SiteAsk>) => {
  const { id, op, square, key } = data;
  try {
    const value = op === "parts" ? await parts(square, key) : op === "building" ? await building(square, key) : await surfaces(square, key);
    (self as unknown as Worker).postMessage({ id, ok: true, value } satisfies SiteReply);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(e) } satisfies SiteReply);
  }
};
