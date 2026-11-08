// Trees on the home's sun, for the planner. Bavaria's single trees (Einzelbäume 2024, CC BY 4.0; trees from 5.5 m up) come from our
// server one whole 2 km square at a time (scripts/build_trees.py), so no point of the home is sent, and only once a request has
// reached the planner. Each tree becomes a crown; every sample point of every surface loses the sun positions a crown stands in front
// of, by how much light the crown lets through that month. The yearly sun per point is scaled by that, so the yield the engine sizes
// with, the production and the energy check all carry the trees. Diffuse light is left as it was, so the loss is if anything low.
import type { Selected, SunSurface } from "./api";
import { surfaceName } from "./api";
import { toUtm } from "./utm";

const REACH_M = 60; // a 20 m tree's shadow at the low winter noon sun (about 19°) is about 58 m long
const DIFFUSE_SHARE = 0.5; // as in site.worker.ts: half of a year's sun on a surface is diffuse, the rest comes from the sun's direction
// Crown shape and how much light it stops, by month: our assumptions, not measured (docs/assumptions.md).
const CROWN_RADIUS = (h: number) => Math.min(6, Math.max(1.5, 0.2 * h)); // m
const CROWN_FROM = 0.35; // the crown starts at this share of the tree's height
const STOPS = [0.35, 0.35, 0.35, 0.6, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.6, 0.35]; // January to December: bare in winter, in leaf May to October
const MUCH = 0.1, SOME = 0.03; // share of a roof side's yearly sun lost to trees from which the check says "shade the roof", or "take some"

export type Shade = {
  status: "much" | "some" | "none" | "unknown";
  trees: number; tallest: number | null; nearest: number | null; // the trees that take sun: count, tallest (m above ground), nearest (m)
  surfaces: { name: string; lost: number }[]; // roof sides that lose sun, with the share of their yearly sun lost
  near?: TreeOnMap[]; // the trees around the home, for the map: where, how tall, and whether they take the home's sun
};
/** One tree for the map: longitude, latitude, height above ground (m), crown radius (m), and whether it shades the home. */
export type TreeOnMap = { at: [number, number]; h: number; r: number; shades: boolean; share: number }; // share: of all the roof sun the trees take
const SHOW_M = 40; // the map draws the trees this close to the home
const SHARE_SHOWN = 0.03; // a tree is marked on the map when it takes at least this share of all the roof sun the trees take
type Tree = [number, number, number]; // east, north (UTM 32), height above ground

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

/** Every tree within reach of any surface, from every square that reach touches. */
async function treesAround(points: [number, number][]): Promise<Tree[]> {
  const names = new Set<string>();
  for (const [x, y] of points) for (const dx of [-REACH_M, REACH_M]) for (const dy of [-REACH_M, REACH_M]) names.add(nameOf(x + dx, y + dy));
  const lists = await Promise.all([...names].map(async (n) => {
    const [sx, sy] = n.split("_").map((v) => Number(v) * 1000), v = await square(n), out: Tree[] = [];
    for (let i = 0; i < v.length; i += 3) out.push([sx + v[i] / 10, sy + v[i + 1] / 10, v[i + 2] / 10]);
    return out;
  }));
  return lists.flat();
}

/** Whether the ray from p towards the sun passes through the tree's crown, a vertical cylinder. */
function hits(p: [number, number, number], ux: number, uy: number, tanEl: number, t: Tree): boolean {
  const r = CROWN_RADIUS(t[2]), dx = t[0] - p[0], dy = t[1] - p[1];
  const along = dx * ux + dy * uy; // horizontal distance to the point nearest the trunk
  if (along <= 0) return false;
  const off = Math.abs(dx * uy - dy * ux);
  if (off >= r) return false;
  const half = Math.sqrt(r * r - off * off), low = p[2] + (along - half) * tanEl, high = p[2] + (along + half) * tanEl;
  return low <= t[2] && high >= CROWN_FROM * t[2];
}

/** Bytes as base64, in pieces small enough for the call stack. */
const pack = (bytes: Uint8Array) => { let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };
const bits = (s: SunSurface, suns: number) => { const raw = atob(s.seen), width = Math.ceil(suns / 8); return (row: number, sun: number) => (raw.charCodeAt(row * width + (sun >> 3)) >> (7 - (sun & 7))) & 1; };

/** The home with trees on its sun: every surface's yearly sun per point, scaled by what the crowns take. Plus what the check says. */
export async function withTrees(buildings: Selected[]): Promise<{ buildings: Selected[]; shade: Shade }> {
  const unknown = { buildings, shade: { status: "unknown", trees: 0, tallest: null, nearest: null, surfaces: [] } as Shade };
  // Every sample point in UTM, kept per surface.
  const placed = buildings.map((b) => (b.sun?.surfaces ?? []).map((s) => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < s.at.length; i += 3) { const [x, y] = toUtm(s.at[i], s.at[i + 1]); pts.push([x, y, s.at[i + 2]]); }
    return pts;
  }));
  const all = placed.flat(2);
  if (!all.length) return unknown;
  let trees: Tree[];
  try {
    trees = await treesAround(placed.flat().filter((p) => p.length).map((p) => [p[0][0], p[0][1]]));
  } catch {
    return unknown;
  }
  const blocking = new Map<number, number>(); // tree → nearest distance to a point it shades
  const impact = new Map<number, number>(); // tree → the roof sun it takes, in m² of a year's direct sun (summed over roof points)
  const lost: Shade["surfaces"] = [];
  const out = buildings.map((b, bi) => {
    if (!b.sun) return b;
    const suns = b.sun.suns.map((x) => {
      const el = (x.el * Math.PI) / 180, horiz = Math.hypot(x.vector[0], x.vector[1]) || 1;
      return { ux: x.vector[0] / horiz, uy: x.vector[1] / horiz, tanEl: Math.tan(el), stops: STOPS[x.month - 1], strength: 0.7 ** ((1 / Math.sin(el)) ** 0.678), v: x.vector };
    });
    const surfaces = b.sun.surfaces.map((s, si) => {
      const pts = placed[bi][si];
      if (!pts.length) return s;
      const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const extent = Math.max(...pts.map((p) => Math.hypot(p[0] - mx, p[1] - my)));
      const low = Math.min(...pts.map((p) => p[2]));
      const near = trees.map((t, k) => [t, k] as [Tree, number]).filter(([t]) => t[2] > low && Math.hypot(t[0] - mx, t[1] - my) <= REACH_M + extent);
      if (!near.length) return s;
      const cos = suns.map((x) => s.n[0] * x.v[0] + s.n[1] * x.v[1] + s.n[2] * x.v[2]);
      const weight = cos.map((c, i) => Math.max(c, 0) * suns[i].strength), wsum = Math.max(weight.reduce((a, w) => a + w, 0), 1e-9);
      // Per sun, only trees on its side of the surface and near the line towards it.
      const facing = suns.map((x, i) => (cos[i] > 0.02 ? near.filter(([t]) => {
        const dx = t[0] - mx, dy = t[1] - my, along = dx * x.ux + dy * x.uy;
        const r = CROWN_RADIUS(t[2]);
        return along > -extent && Math.abs(dx * x.uy - dy * x.ux) < r + extent && t[2] >= low + Math.max(0, along - extent - r) * x.tanEl;
      }) : []));
      const seen = bits(s, suns.length);
      const light = new Uint8Array(s.year.length * suns.length).fill(255); // what the map's sun-by-time view draws
      let before = 0, after = 0;
      const year = s.year.map((value, row) => {
        let open = 0, through = 0;
        suns.forEach((x, i) => {
          if (!weight[i] || !seen(row, i)) return;
          open += weight[i];
          let pass = 1;
          for (const [t, k] of facing[i]) if (hits(pts[row], x.ux, x.uy, x.tanEl, t)) {
            if (s.kind === "roof") impact.set(k, (impact.get(k) ?? 0) + (weight[i] / wsum) * x.stops * pass * (s.m2 / Math.max(1, s.year.length)));
            pass *= 1 - x.stops;
            const d = Math.hypot(t[0] - pts[row][0], t[1] - pts[row][1]);
            if (!blocking.has(k) || d < blocking.get(k)!) blocking.set(k, d);
          }
          through += weight[i] * pass;
          if (pass < 1) light[row * suns.length + i] = Math.round(pass * 255);
        });
        const was = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * open / wsum, now = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * through / wsum;
        const next = Math.round(value * (now / was));
        before += value; after += next;
        return next;
      });
      if (s.kind === "roof" && before > 0 && after < before) lost.push({ name: surfaceName(s), lost: 1 - after / before });
      return after < before ? { ...s, year, light: pack(light) } : s;
    });
    return { ...b, sun: { ...b.sun, surfaces } };
  });
  const roofs = [...lost.reduce((m, x) => ((m.get(x.name)?.lost ?? 0) >= x.lost ? m : m.set(x.name, x)), new Map<string, Shade["surfaces"][number]>()).values()]
    .filter((x) => x.lost >= SOME).sort((a, b) => b.lost - a.lost);
  const used = [...blocking.entries()];
  // The trees near the home, back from the grid to longitude and latitude by the grid's own slope at one point of the home:
  // within the 40 m drawn, that is a few centimetres off at most.
  const ref = buildings.flatMap((b) => b.sun?.surfaces ?? []).find((s) => s.at.length)!, lon0 = ref.at[0], lat0 = ref.at[1], p0 = toUtm(lon0, lat0);
  const [e1, n1] = toUtm(lon0 + 1e-4, lat0), [e2, n2] = toUtm(lon0, lat0 + 1e-4), [ea, na] = [e1 - p0[0], n1 - p0[1]], [eb, nb] = [e2 - p0[0], n2 - p0[1]], det = ea * nb - eb * na;
  const back = (e: number, n: number): [number, number] => { const de = e - p0[0], dn = n - p0[1]; return [lon0 + ((de * nb - dn * eb) / det) * 1e-4, lat0 + ((dn * ea - de * na) / det) * 1e-4]; };
  // A tree "takes the home's sun" on the map when it takes a real share of what all trees take from the roofs, not when its
  // shadow touches a roof corner once a year: otherwise nearly every tree around lights up and the map says nothing.
  const total = [...impact.values()].reduce((a, v) => a + v, 0);
  const shading = new Set([...impact.entries()].filter(([, v]) => total > 0 && v / total >= SHARE_SHOWN).map(([k]) => k));
  const near = trees.map((t, k) => [t, k] as [Tree, number]).filter(([t]) => all.some((p) => Math.hypot(t[0] - p[0], t[1] - p[1]) <= SHOW_M))
    .map(([t, k]) => ({ at: back(t[0], t[1]), h: t[2], r: CROWN_RADIUS(t[2]), shades: shading.has(k), share: total > 0 ? (impact.get(k) ?? 0) / total : 0 }));
  return {
    buildings: out,
    shade: {
      status: roofs.some((x) => x.lost >= MUCH) ? "much" : roofs.length ? "some" : "none",
      trees: used.length, tallest: used.length ? Math.max(...used.map(([k]) => trees[k][2])) : null, nearest: used.length ? Math.min(...used.map(([, d]) => d)) : null,
      surfaces: roofs, near,
    },
  };
}
