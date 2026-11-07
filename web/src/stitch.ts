// The map's tiles cut every building at a fixed line just outside each tile, so a building across a tile edge arrives
// as pieces. Left apart, each piece is a building of its own and its cut shows as a straight line through the block.
import polygonClipping from "polygon-clipping";
import { P2, area, centre, toLocal } from "./geometry";

const TILE_ZOOM = 14, TILE_UNITS = 4096, TILE_BUFFER = 64; // OpenMapTiles' grid, in the tiles' own units
const MIN_OVERLAP_M2 = 0.5; // two pieces of one building share a strip; houses that only touch share nothing
const MIN_RING_M2 = 1; // joining leaves slivers where the two copies of a wall differ by rounding

export type Piece = { pid: string; rings: P2[][]; height: number; base: number; shell: boolean };

const WORLD = 2 ** TILE_ZOOM * TILE_UNITS;
const tileUnits = ([lng, lat]: P2): P2 => {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * WORLD, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD];
};
const onCutLine = (v: number) => {
  const r = ((v % TILE_UNITS) + TILE_UNITS) % TILE_UNITS;
  return Math.abs(r - TILE_BUFFER) < 0.5 || Math.abs(r - (TILE_UNITS - TILE_BUFFER)) < 0.5;
};
/** Once per piece, as tiles keep arriving and all of them are stitched again. */
const once = <T>(work: (p: Piece) => T) => {
  const known = new WeakMap<Piece, T>();
  return (p: Piece) => {
    if (!known.has(p)) known.set(p, work(p));
    return known.get(p) as T;
  };
};

/** A wall lying exactly on a cut line. A real wall can too: joining still needs an overlap. */
const isCut = once((p) => p.rings.some((ring) => {
  const units = ring.map(tileUnits);
  return units.slice(1).some((b, i) => {
    const a = units[i];
    return (onCutLine(a[0]) && Math.abs(a[0] - b[0]) < 0.5) || (onCutLine(a[1]) && Math.abs(a[1] - b[1]) < 0.5);
  });
}));

export const box = once((p) => {
  const xs = p.rings[0].map((c) => c[0]), ys = p.rings[0].map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
});
const m2 = (rings: P2[][]) => {
  const size = (r: P2[]) => area(r.map((c) => toLocal(rings[0][0], c)));
  return size(rings[0]) - rings.slice(1).reduce((s, r) => s + size(r), 0);
};
const partners = once(() => new Map<Piece, boolean>());
function overlaps(a: Piece, b: Piece) {
  const known = partners(a).get(b);
  if (known !== undefined) return known;
  let shared = false;
  try {
    shared = (polygonClipping.intersection(a.rings, b.rings) as P2[][][]).reduce((s, rings) => s + m2(rings), 0) >= MIN_OVERLAP_M2;
  } catch { /* as in join */ }
  partners(a).set(b, shared);
  return shared;
}

export const pieceId = (rings: P2[][], height: number, base: number) => {
  const r = rings[0], c = centre(r.slice(0, -1));
  return `${c[0].toFixed(6)}:${c[1].toFixed(6)}:${height}:${base}`;
};

const joined = new WeakMap<Piece, { key: string; shapes: Piece[] }>();
function join(group: Piece[]): Piece[] {
  const [first, ...rest] = group, key = group.map((p) => p.pid).join();
  const known = joined.get(first);
  if (known?.key === key) return known.shapes;
  let union: P2[][][];
  try {
    union = polygonClipping.union(first.rings, ...rest.map((p) => p.rings)) as P2[][][];
  } catch {
    return group; // the library gives up on some near-degenerate shapes: one cut building beats an empty map
  }
  const shapes = union.filter((rings) => m2(rings) >= MIN_RING_M2).map((rings) => {
    const kept = rings.filter((r, i) => i === 0 || m2([r]) >= MIN_RING_M2);
    return { ...first, rings: kept, pid: pieceId(kept, first.height, first.base) };
  });
  joined.set(first, { key, shapes });
  return shapes;
}

/** Whole buildings from what the tiles gave. Pieces join only if they look alike and really overlap: an id cannot tell,
 * as a tile's id can cover hundreds of buildings and the next tile can call the same building something else. */
export function stitch(pieces: Piece[]): Piece[] {
  const looks = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const look = `${p.height}:${p.base}:${p.shell}`;
    const same = looks.get(look);
    if (same) same.push(i); else looks.set(look, [i]);
  });
  const parent = pieces.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const same of looks.values()) {
    for (const i of same) {
      if (!isCut(pieces[i])) continue;
      const a = box(pieces[i]);
      for (const j of same) {
        const b = box(pieces[j]);
        if (i === j || a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3] || root(i) === root(j)) continue;
        if (overlaps(pieces[i], pieces[j])) parent[root(i)] = root(j);
      }
    }
  }
  const groups = new Map<number, Piece[]>();
  pieces.forEach((p, i) => {
    const group = groups.get(root(i));
    if (group) group.push(p); else groups.set(root(i), [p]);
  });
  return [...groups.values()].flatMap((group) => (group.length > 1 ? join(group) : group));
}
