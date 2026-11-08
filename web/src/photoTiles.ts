// The aerial photo in 512 px tiles, fetched once and shared: the map's ground and the photos on the roofs use the same tiles.
// The service sends no caching headers, so the browser would fetch a tile again every time; this keeps the recent ones.
import * as maplibregl from "maplibre-gl";

export const WORLD_M = 40075016.686; // the world's width in EPSG:3857 metres
const HALF = WORLD_M / 2;
export const TILE_PX = 512;
const KEEP = 600; // tiles, about 60 MB of JPEG

const sideOf = (z: number) => WORLD_M / 2 ** z;
const urlOf = (z: number, x: number, y: number) => {
  const s = sideOf(z), x0 = -HALF + x * s, y1 = HALF - y * s;
  return `https://geoservices.bayern.de/od/wms/dop/v1/dop20?service=WMS&version=1.3.0&request=GetMap&layers=by_dop20c&styles=&crs=EPSG:3857&bbox=${x0},${y1 - s},${x0 + s},${y1}&width=${TILE_PX}&height=${TILE_PX}&format=image/jpeg`;
};

const tiles = new Map<string, Promise<Blob>>();
const have = new Set<string>(); // arrived, not only asked for

export function tile(z: number, x: number, y: number): Promise<Blob> {
  const key = `${z}/${x}/${y}`, found = tiles.get(key);
  if (found) { tiles.delete(key); tiles.set(key, found); return found; } // most recent last
  const job = fetch(urlOf(z, x, y)).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
  job.then(() => have.add(key), () => { tiles.delete(key); });
  tiles.set(key, job);
  while (tiles.size > KEEP) { const old = tiles.keys().next().value as string; tiles.delete(old); have.delete(old); }
  return job;
}
const ready = (z: number, x: number, y: number) => have.has(`${z}/${x}/${y}`);

/** The map's ground asks through here: `dop://{z}/{x}/{y}`. */
export const GROUND_TILES = "dop://{z}/{x}/{y}";
maplibregl.addProtocol("dop", async (params) => {
  const [z, x, y] = params.url.slice("dop://".length).split("/").map(Number);
  return { data: await (await tile(z, x, y)).arrayBuffer() };
});

/** Tile numbers of a point in EPSG:3857 metres. */
export const tileAt = (z: number, X: number, Y: number): [number, number] => [Math.floor((X + HALF) / sideOf(z)), Math.floor((HALF - Y) / sideOf(z))];

/**
 * One image from nx by ny tiles, its corner tile at x0, y0. Tiles already here are drawn before `ready` resolves, the rest as they
 * arrive, each followed by `drew`. Until a tile is drawn its part stays see-through. `box` is west, south, east, north in EPSG:3857 metres.
 */
export function mosaic(z: number, x0: number, y0: number, nx: number, ny: number, drew: () => void, alive: () => boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = nx * TILE_PX; canvas.height = ny * TILE_PX;
  const draw = canvas.getContext("2d") as CanvasRenderingContext2D, s = sideOf(z);
  const box = [-HALF + x0 * s, HALF - (y0 + ny) * s, -HALF + (x0 + nx) * s, HALF - y0 * s];
  const first: Promise<unknown>[] = [], all: Promise<unknown>[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const here = ready(z, x0 + i, y0 + j);
    const job = tile(z, x0 + i, y0 + j).then(createImageBitmap).then((image) => {
      if (alive()) { draw.drawImage(image, i * TILE_PX, j * TILE_PX); if (!here) drew(); }
      image.close();
    }).catch(() => undefined);
    if (here) first.push(job);
    all.push(job);
  }
  return { canvas, box, ready: Promise.all(first), done: Promise.all(all) };
}

/**
 * The same tiles as `mosaic`, handed over one by one as images instead of drawn into one canvas, so a caller can put each
 * straight into its part of a GPU texture. Images come upside down, as a texture's rows run from the bottom; (i, j) counts
 * from the top left tile. Tiles already here are handed over before `ready` resolves. The caller closes each image.
 */
export function tileImages(z: number, x0: number, y0: number, nx: number, ny: number, got: (i: number, j: number, image: ImageBitmap) => void, alive: () => boolean) {
  const s = sideOf(z), box = [-HALF + x0 * s, HALF - (y0 + ny) * s, -HALF + (x0 + nx) * s, HALF - y0 * s];
  const first: Promise<unknown>[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const here = ready(z, x0 + i, y0 + j);
    const job = tile(z, x0 + i, y0 + j).then((blob) => createImageBitmap(blob, { imageOrientation: "flipY" })).then((image) => {
      if (alive()) got(i, j, image); else image.close();
    }).catch(() => undefined);
    if (here) first.push(job);
  }
  return { box, ready: Promise.all(first) };
}
