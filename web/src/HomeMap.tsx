import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Selected, SunSurface, View, polyOf, surfaceKey, Square, homesUrl, squareEdges, squaresIn } from "./api";
import { P2, P3, centre, inside, normal, toLngLat, toLocal } from "./geometry";
import { Info, Locate, Minus, Needle, Plus } from "./icons";
import { BUILDINGS_3D_FILTER, mapStyle } from "./mapStyle";
import SunLight from "./SunLight";
import { MUNICH, REGION_EDGE, REGION_OUTSIDE, VIEW_LIMIT, inRegion } from "./region";
import { Button, IconButton } from "./ui";

const BLOCKS = "buildings-3d"; // the base map's blocks: a rough picture from afar, never selected
const homesOf = (square: string) => `homes-${square}`; // measured buildings, one feature each: what people select. A source and layer per square
const squareOf = (source: string) => source.slice(homesOf("").length);
const PENDING = "pending-blocks"; // the base map's blocks, slowly brightening and dimming, where measured buildings are still on their way
const HOMES_FROM_ZOOM = 15;
const LOAD_REACH_DEG = 0.018; // about 1.5 km around the view's centre
const MAX_LOADS = 3; // at once, nearest first: a quick trip across town must not queue behind places already left
const KEEP_SQUARES = 16; // the farthest beyond this leave the map, so a long session stays as light as a short one
const MOVE_CHECK_MS = 300, PULSE_MS = 1100;
const EDGES_FROM_ZOOM = 16, EDGES_FULL_ZOOM = 17; // from afar houses cannot be told apart anyway, so no lines to draw
const EDGE_OPACITY = 0.8;
const PANEL_W = 424; // room the panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const FADE_MS = 900; // from the map's blocks to the measured buildings, and back
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop20?service=WMS&version=1.3.0&request=GetMap&layers=by_dop20c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", wall: "#1F3A5C", edge: "#8A95A8", ownEdge: "#BFD8F5", hover: "#2F5E94", pendingDim: "#2A2C34", pendingBright: "#6F93BF", face: "#FF9F0A", otherRoof: "#3A3D47", otherWall: "#23252C", limit: "#FFD60A", land: "#0F1013" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, n: P3) => new THREE.Color(hex).multiplyScalar(0.95 - 0.35 * n[1]).getHex();
const wide = () => matchMedia("(min-width: 821px)").matches;

export type Picked = { id: string; square: string; at: P2 };
export type Step = "pick" | "review";
export type Face = { building: string; poly: number };
export const letter = (i: number) => String.fromCharCode(65 + i);
type Props = {
  buildings: Selected[]; step: Step; focus: P2 | null; aerial: boolean; onPick?: (b: Picked) => void;
  open: string | null; near: string | null; face: Face | null; look: { id: string } | null;
  onFace: (f: Face | null) => void; onOpen: (id: string) => void;
  view: View; chosen: string[]; onToggle: (key: string) => void; dark: boolean;
};

// What changes with the theme on the map itself. Everything else comes from the base style.
const TONES = {
  dark: { rim: "#FFFFFF", block: "#2A2C34", edge: "#8A95A8", hover: "#2F5E94", land: "#0F1013" },
  light: { rim: "#0E6FFF", block: "#E4E2DC", edge: "#8E8B82", hover: "#9FC2EC", land: "#F1F0EC" },
};
const blockColour = (dark: boolean): maplibregl.ExpressionSpecification => { const t = TONES[dark ? "dark" : "light"]; return ["case", ["boolean", ["feature-state", "near"], false], COLORS.face, ["boolean", ["feature-state", "picked"], false], COLORS.roof, ["boolean", ["feature-state", "hover"], false], t.hover, t.block]; };

const HEAT = ["#2C6BED", "#18C3C9", "#FFE14A", "#FF8A1F", "#E5261F"].map((c) => new THREE.Color(c));
const heat = (t: number) => {
  const x = Math.min(0.999, Math.max(0, t)) * (HEAT.length - 1), i = Math.floor(x);
  return HEAT[i].clone().lerp(HEAT[i + 1], x - i);
};
const seenBits = (s: SunSurface, suns: number) => { const raw = atob(s.seen), width = Math.ceil(suns / 8); return (row: number, sun: number) => (raw.charCodeAt(row * width + (sun >> 3)) >> (7 - (sun & 7))) & 1; };

const MOVE_MS = 900; // the map rising into its window: --move in styles.css
// Same curve as --glide, so camera, window and fade are one movement.
const glide = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const RAYS = 26; // per building
const RAY_M = 34;
const RIM_M = 0.45;
const SKIN_REACH = 3; // cells the colour runs past the samples, to the surface's true edge

/** A coat of colour over one surface: its exact outline, with the samples as a small image stretched smoothly across it. */
function skinOf(s: SunSurface, poly: Poly) {
  const outline = [s.outline, ...s.holes].flat();
  const i0 = Math.floor(Math.min(...outline.map((p) => p[0]))) - 1, j0 = Math.floor(Math.min(...outline.map((p) => p[1]))) - 1;
  const w = Math.ceil(Math.max(...outline.map((p) => p[0]))) - i0 + 2, h = Math.ceil(Math.max(...outline.map((p) => p[1]))) - j0 + 2;
  // Each pixel takes the nearest sample, so the edge of the surface is coloured, and missing wall stays clear.
  const source = new Int32Array(w * h).fill(-1);
  let ring: number[] = [];
  s.year.forEach((_, n) => { const px = (s.cells[n * 2 + 1] - j0) * w + s.cells[n * 2] - i0; source[px] = n; ring.push(px); });
  for (let k = 0; k < SKIN_REACH; k++) {
    const next: number[] = [];
    for (const px of ring) {
      const x = px % w, y = (px - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, q = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && source[q] < 0) { source[q] = source[px]; next.push(q); }
      }
    }
    ring = next;
  }
  const pixels = new Uint8Array(w * h * 4), texture = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  const skin = polygon(poly.ring, poly.holes, "#FFFFFF");
  const at = skin.geometry.getAttribute("position") as THREE.BufferAttribute, uv = new Float32Array(at.count * 2);
  outline.forEach((p, i) => {
    uv[i * 2] = (p[0] - i0 + 0.5) / w; uv[i * 2 + 1] = (p[1] - j0 + 0.5) / h;
    at.setXYZ(i, at.getX(i) + s.n[0] * 0.12, at.getY(i) + s.n[1] * 0.12, at.getZ(i) + s.n[2] * 0.12);
  });
  skin.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const material = skin.material as THREE.MeshBasicMaterial;
  material.map = texture; material.transparent = true; material.depthWrite = false; material.userData.alpha = true;
  // A thick line along the surface's edge marks it as chosen, on any layer.
  const rim: P3[] = [], faces: number[] = [];
  for (const ring of [poly.ring, ...poly.holes]) ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], e = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
    const side = new THREE.Vector3(...s.n).cross(e).multiplyScalar(RIM_M / 2), up = new THREE.Vector3(...s.n).multiplyScalar(0.2), k = rim.length;
    for (const [a, d] of [[p, 1], [q, 1], [q, -1], [p, -1]] as const) rim.push([a[0] + side.x * d + up.x, a[1] + side.y * d + up.y, a[2] + side.z * d + up.z]);
    faces.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const edge = mesh(rim, faces, "#FFFFFF");
  return { s, skin, edge, pixels, source, texture };
}

/** Where a building's roof photo comes from, and the part of the ground it covers. */
function photoOf(b: Selected) {
  const all = b.real?.roofs.flatMap((p) => p.ring) ?? [];
  if (!all.length) return null;
  const x0 = Math.min(...all.map((p) => p[0])) - 3, x1 = Math.max(...all.map((p) => p[0])) + 3, y0 = Math.min(...all.map((p) => p[1])) - 3, y1 = Math.max(...all.map((p) => p[1])) + 3;
  const merc = (p: P2): P2 => [(p[0] * 20037508.34) / 180, Math.log(Math.tan(((90 + p[1]) * Math.PI) / 360)) * 6378137];
  const [a, c] = [merc(toLngLat(b.origin, [x0, y0])), merc(toLngLat(b.origin, [x1, y1]))];
  const px = (m: number) => Math.min(4096, Math.max(256, Math.round(m / 0.1))); // the photo is 20 cm: twice that, so resampling does not soften it
  return { x0, x1, y0, y1, url: `https://geoservices.bayern.de/od/wms/dop/v1/dop20?service=WMS&version=1.3.0&request=GetMap&layers=by_dop20c&styles=&crs=EPSG:3857&bbox=${a[0]},${a[1]},${c[0]},${c[1]}&width=${px(x1 - x0)}&height=${px(y1 - y0)}&format=image/jpeg` };
}

/** The aerial photo of the ground under a building, as a texture lying on its roofs. */
function roofPhoto(b: Selected, roofs: THREE.Mesh[], redraw: () => void) {
  const photo = photoOf(b);
  if (!photo) return;
  const { x0, x1, y0, y1, url } = photo;
  new THREE.TextureLoader().setCrossOrigin("anonymous").load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16; // roofs are seen at an angle
    for (const roof of roofs) {
      const at = roof.geometry.getAttribute("position"), uv = new Float32Array(at.count * 2);
      for (let i = 0; i < at.count; i++) { uv[i * 2] = (at.getX(i) - x0) / (x1 - x0); uv[i * 2 + 1] = (at.getY(i) - y0) / (y1 - y0); }
      roof.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const material = roof.material as THREE.MeshBasicMaterial;
      material.map = texture; material.color.set("#FFFFFF"); material.needsUpdate = true;
      roof.userData.color = 0xffffff;
    }
    redraw();
  });
}

function mesh(points: P3[], faces: number[], color: THREE.ColorRepresentation, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setIndex(faces);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
}

/** A flat polygon anywhere in space: triangulated along the axis it faces least. */
function polygon(ring: P3[], holes: P3[][] = [], color: THREE.ColorRepresentation, opacity = 1) {
  const n = normal(ring).map(Math.abs), drop = n.indexOf(Math.max(...n));
  const keep = [0, 1, 2].filter((i) => i !== drop);
  const flat = (r: P3[]) => r.map((p) => new THREE.Vector2(p[keep[0]], p[keep[1]]));
  return mesh([ring, ...holes].flat(), THREE.ShapeUtils.triangulateShape(flat(ring), holes.map(flat)).flat(), color, opacity);
}

/** Removing an object from a scene does not free its GPU buffers. */
function empty(g: THREE.Group) {
  g.traverse((o) => {
    const x = o as THREE.Mesh;
    x.geometry?.dispose();
    (x.material as THREE.Material | undefined)?.dispose();
  });
  g.clear();
}

function lines(points: number[], color: string, opacity = 0.8) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
const edgesOf = (polys: Poly[]) => polys.flatMap(({ ring }) => ring.flatMap((p, i) => { const q = ring[(i + 1) % ring.length]; return [...p, ...q]; }));

/** How far the lines have faded in at a zoom, eased so they neither pop in nor stop abruptly. */
const edgeFade = (zoom: number) => {
  const t = Math.min(1, Math.max(0, (zoom - EDGES_FROM_ZOOM) / (EDGES_FULL_ZOOM - EDGES_FROM_ZOOM)));
  return t * t * (3 - 2 * t);
};

type OnMap = { scene: THREE.Scene; at: P2; done: boolean };
type Spot = { id: string; square: string };

export default function HomeMap({ buildings, step, focus, aerial, onPick, open, near, face, look, onFace, onOpen, view, chosen, onToggle, dark }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const models = useRef<{ scene: THREE.Scene; at: P2; id: string; polys: Poly[]; surfaces: { s: SunSurface; poly: number }[]; skins: ReturnType<typeof skinOf>[] }[]>([]); // one per building, each around its own origin
  const edgeLook = useRef(new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0 })); // one for all squares
  const [loading, setLoading] = useState(0);
  const squares = useRef(new Map<string, OnMap>());
  const around = useRef<Square[]>([]); // the squares the view needs now
  const solid = useRef<{ opacity: number; visibility: "visible" | "none" }>({ opacity: 1, visibility: "visible" });
  const heights = useRef(new Map<string, number>());
  const owned = useRef<Spot[]>([]);
  const ready = useRef(false);
  const shown = useRef(0); // 0: the map's blocks, 1: the measured buildings
  const needle = useRef<HTMLSpanElement>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const [credits, setCredits] = useState(false);
  const [bearing, setBearing] = useState(0);
  const spot = useRef<maplibregl.Marker | null>(null);
  const pins = useRef<maplibregl.Marker[]>([]);
  const live = useRef({ onPick, buildings, step, onFace, onOpen, onToggle, dark });
  live.current = { onPick, buildings, step, onFace, onOpen, onToggle, dark };

  const locateMe = () => navigator.geolocation?.getCurrentPosition((p) => {
    const m = map.current, at: P2 = [p.coords.longitude, p.coords.latitude];
    if (!m || !inRegion(at)) return;
    const dot = document.createElement("div");
    dot.className = "me";
    me.current?.remove();
    me.current = new maplibregl.Marker({ element: dot }).setLngLat(at).addTo(m);
    m.flyTo({ center: at, zoom: 18, pitch: PITCH, duration: 1400 });
  }, () => undefined, { enableHighAccuracy: true, timeout: 8000 });

  const refreshSquares = useRef(() => {});
  const mark = (b: Spot, key: string, value: boolean) => {
    const m = map.current, source = homesOf(b.square);
    if (m?.getSource(source)) m.setFeatureState({ source, id: b.id }, { [key]: value }); // a square that left the map is marked again when it returns
  };
  const setSolid = (change: Partial<typeof solid.current>) => {
    const m = map.current;
    Object.assign(solid.current, change);
    if (m) squares.current.forEach((_, name) => {
      if (change.opacity !== undefined) m.setPaintProperty(homesOf(name), "fill-extrusion-opacity", change.opacity);
      if (change.visibility) m.setLayoutProperty(homesOf(name), "visibility", change.visibility);
    });
  };
  const fadeLines = useRef(() => {});
  // A selected building stays the map's own block, recoloured, so its shape cannot change.
  const syncHomes = useRef(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    owned.current.forEach((b) => mark(b, "picked", false));
    owned.current = live.current.buildings;
    owned.current.forEach((b) => mark(b, "picked", true));
    m.triggerRepaint();
  });

  const setShown = (t: number) => {
    shown.current = t;
    models.current.forEach(({ scene }) => scene.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!material) return;
      material.transparent = t < 1 || !!material.userData.alpha;
      material.depthWrite = t >= 1 && !material.userData.alpha; // while fading, a wall must not hide the roof behind it
      material.opacity = t * (material.userData.opacity ?? 1);
    }));
    map.current?.triggerRepaint();
  };

  const clearModels = () => { models.current.forEach(({ scene }) => { scene.children.forEach((g) => empty(g as THREE.Group)); }); models.current = []; };
  const buildModels = () => {
    clearModels();
    models.current = live.current.buildings.map((b) => {
      const { roofs, walls } = b.real ?? { roofs: [], walls: [] };
      const g = new THREE.Group(), scene = new THREE.Scene();
      const faced = (m: THREE.Mesh, poly: number) => { m.userData = { face: { building: b.id, poly }, color: (m.material as THREE.MeshBasicMaterial).color.getHex() }; g.add(m); return m; };
      walls.forEach((p, i) => faced(polygon(p.ring, p.holes, COLORS.wall), roofs.length + i));
      const roofMeshes = roofs.map((p, poly) => faced(polygon(p.ring, p.holes, lit(COLORS.roof, normal(p.ring))), poly));
      roofPhoto(b, roofMeshes, () => map.current?.triggerRepaint());
      const line = lines(edgesOf([...walls, ...roofs]), COLORS.ownEdge, 0.5);
      (line.material as THREE.Material).userData.opacity = 0.5;
      g.add(line);
      const skins = (b.sun?.surfaces ?? []).map((x) => skinOf(x, [...roofs, ...walls][polyOf(b, x)]));
      skins.forEach((k) => g.add(k.skin, k.edge));
      scene.add(g);
      return { scene, at: b.origin, id: b.id, polys: [...roofs, ...walls], surfaces: (b.sun?.surfaces ?? []).map((x) => ({ s: x, poly: polyOf(b, x) })), skins };
    });
    paintTiles();
    paintRims();
    sunMark();
  };

  const paintRims = () => models.current.forEach((x) => x.skins.forEach((k) => (k.edge.material as THREE.MeshBasicMaterial).color.set(TONES[live.current.dark ? "dark" : "light"].rim)));

  // Chosen surfaces carry a colour. Everything else shows what it really is, so the eye goes to the choice.
  const paintTiles = () => {
    const picked = new Set(chosen), hot = face;
    const values = models.current.flatMap((m) => m.skins.flatMap((k) => k.s.year));
    const sorted = [...values].sort((a, b) => a - b), low = sorted[Math.floor(sorted.length * 0.05)] ?? 0, high = sorted[Math.floor(sorted.length * 0.98)] ?? 1;
    const dim = new THREE.Color("#0F1013"), mark = new THREE.Color("#FFFFFF");
    models.current.forEach((m) => {
      const b = live.current.buildings.find((x) => x.id === m.id);
      if (!b?.sun) return;
      const suns = b.sun.suns, moment = view.moment ? suns.findIndex((x) => x.month === view.moment?.month && x.hour === view.moment.hour) : -1;
      for (const { s: x, pixels, source, texture, edge } of m.skins) {
        edge.visible = picked.has(surfaceKey(b, x));
        const on = picked.has(surfaceKey(b, x)), over = hot?.building === b.id && hot.poly === polyOf(b, x), read = seenBits(x, suns.length);
        const rgba = x.year.map((value, i) => {
          let c = dim, alpha = 0;
          if (view.layer === "sun") {
            if (!view.moment) c = heat((value - low) / Math.max(1, high - low));
            else if (moment < 0) c = HEAT[0];
            else { const v = suns[moment].vector; c = heat(read(i, moment) ? Math.max(0, x.n[0] * v[0] + x.n[1] * v[1] + x.n[2] * v[2]) : 0); }
            alpha = 0.94;
          } else if (!on) alpha = 0.6; // the chosen ones keep the clean photo, the rest step back
          if (over) { c = c.clone().lerp(mark, 0.45); alpha = Math.max(alpha, 0.55); }
          const out = c.clone().convertLinearToSRGB();
          return [out.r * 255, out.g * 255, out.b * 255, alpha * 255];
        });
        source.forEach((n, px) => { if (n >= 0) pixels.set(rgba[n], px * 4); else pixels[px * 4 + 3] = 0; });
        texture.needsUpdate = true;
      }
    });
    map.current?.triggerRepaint();
  };

  // Parallel rays down to the spots the sun reaches. They belong to the buildings, so they stay put when the map moves.
  const sunMarks = useRef<THREE.Group[]>([]);
  const sunMark = () => {
    sunMarks.current.forEach((g) => { g.parent?.remove(g); empty(g); });
    sunMarks.current = [];
    const m = map.current;
    if (!m || !view.moment || view.layer !== "sun" || view.style !== "beams") { m?.triggerRepaint(); return; }
    models.current.forEach((model) => {
      const b = live.current.buildings.find((x) => x.id === model.id), suns = b?.sun?.suns ?? [];
      const moment = suns.findIndex((x) => x.month === view.moment?.month && x.hour === view.moment.hour);
      if (!b || moment < 0) return;
      const v = suns[moment].vector, g = new THREE.Group(), rays: number[] = [];
      const lit = b.sun?.surfaces.flatMap((x) => { const read = seenBits(x, suns.length); return x.year.flatMap((_, i) => (read(i, moment) && x.n[0] * v[0] + x.n[1] * v[1] + x.n[2] * v[2] > 0.15 ? [[x, i] as const] : [])); }) ?? [];
      const every = Math.max(1, Math.floor(lit.length / RAYS));
      for (let k = 0; k < lit.length; k += every) {
        const [x, i] = lit[k], c = toLocal(b.origin, [x.at[i * 3], x.at[i * 3 + 1]]), z = x.at[i * 3 + 2];
        rays.push(c[0], c[1], z, c[0] + v[0] * RAY_M, c[1] + v[1] * RAY_M, z + v[2] * RAY_M);
      }
      g.add(lines(rays, "#FFD400", 0.4));
      model.scene.add(g);
      sunMarks.current.push(g);
    });
    m.triggerRepaint();
  };

  // A letter marks each building, the same one as in the panel.
  const liftPins = useRef(() => {});
  const placePins = () => {
    const m = map.current;
    pins.current.forEach((x) => x.remove());
    pins.current = [];
    if (!m || !ready.current) return;
    const pin = (text: string, at: P2, z: number, click: () => void) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "pin";
      tag.textContent = text;
      tag.dataset.z = String(z);
      tag.addEventListener("click", (e) => { e.stopPropagation(); click(); });
      pins.current.push(new maplibregl.Marker({ element: tag }).setLngLat(at).addTo(m));
    };
    buildings.forEach((b, i) => {
      pin(letter(i), b.origin, (heights.current.get(b.id) ?? 8) + 1, () => onOpen(b.id));
    });
    liftPins.current();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current as HTMLDivElement, style: mapStyle(dark), attributionControl: false, center: MUNICH, zoom: 11, pitch: 30, maxPitch: 60, bearing: 0,
      maxBounds: VIEW_LIMIT, clickTolerance: 8, canvasContextAttributes: { antialias: true }, reduceMotion: false,
      // By default tiles are cut into smaller ones when zooming in, which cuts every building along a grid.
      zoomLevelsToOverscale: 16,
    });
    map.current = m;
    // Less fling after a drag, and zooming stays on the view's centre instead of chasing the pointer.
    m.dragPan.enable({ maxSpeed: 500, deceleration: 4000 });
    m.scrollZoom.enable({ around: "center" });
    // A marker has no height of its own: lift it to the roof by hand.
    liftPins.current = () => {
      const px = (512 * 2 ** m.getZoom()) / (40075016 * Math.cos((m.getCenter().lat * Math.PI) / 180)) * Math.sin((m.getPitch() * Math.PI) / 180);
      pins.current.forEach((x) => x.setOffset([0, -Number(x.getElement().dataset.z) * px]));
    };
    m.on("move", () => liftPins.current());
    m.on("rotate", () => { if (needle.current) needle.current.style.rotate = `${-m.getBearing()}deg`; setBearing(m.getBearing()); });

    m.once("load", locateMe);
    let renderer: THREE.WebGLRenderer;
    const camera = new THREE.Camera();
    let pulse = 0;
    m.on("load", () => {
      const paint = (name: "fill-extrusion-color" | "fill-extrusion-opacity") => m.getPaintProperty(BLOCKS, name);
      m.setLayerZoomRange(BLOCKS, 14, HOMES_FROM_ZOOM);
      solid.current.opacity = paint("fill-extrusion-opacity") as number;
      m.addLayer({
        id: "home-3d", type: "custom", renderingMode: "3d",
        onAdd(mm, gl) {
          renderer = new THREE.WebGLRenderer({ canvas: mm.getCanvas(), context: gl, antialias: true });
          renderer.autoClear = false;
        },
        render(_gl, args) {
          renderer.resetState();
          renderer.setViewport(0, 0, m.getCanvas().width, m.getCanvas().height);
          // Each around its own origin, near what it draws: the GPU's numbers run out of digits far from it.
          const draw = (what: THREE.Scene, at: P2 | null) => {
            what.userData.seen = null;
            if (!at) return;
            const c = maplibregl.MercatorCoordinate.fromLngLat(at, 0), s = c.meterInMercatorCoordinateUnits();
            const local = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).scale(new THREE.Vector3(s, -s, s));
            camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(local);
            what.userData.seen = camera.projectionMatrix.clone();
            renderer.render(what, camera);
          };
          if (edgeFade(m.getZoom()) > 0 && shown.current < 1) around.current.forEach(({ name }) => {
            const square = squares.current.get(name);
            if (square?.done) draw(square.scene, square.at);
          });
          if (shown.current > 0) models.current.forEach(({ scene, at }) => draw(scene, at));
        },
      });
      m.addSource("aerial", { type: "raster", tiles: [AERIAL], tileSize: 512 });
      m.addLayer({ id: "aerial", type: "raster", source: "aerial", layout: { visibility: "none" } }, BLOCKS);

      // The edge of the prototype: dimmed outside, a yellow line, and the reason written along it.
      m.addSource("outside", { type: "geojson", data: REGION_OUTSIDE });
      m.addSource("limit", { type: "geojson", data: REGION_EDGE });
      m.addLayer({ id: "outside", type: "fill", source: "outside", paint: { "fill-color": COLORS.land, "fill-opacity": 0.72 } });
      m.addLayer({ id: "limit-line", type: "line", source: "limit", paint: { "line-color": COLORS.limit, "line-width": 2.5 } });
      m.addLayer({
        id: "limit-text", type: "symbol", source: "limit",
        layout: { "symbol-placement": "line", "symbol-spacing": 340, "text-field": "Not in prototype focus", "text-font": ["Noto Sans Bold"], "text-size": 13, "text-offset": [0, -1], "text-letter-spacing": 0.04, "text-keep-upright": true },
        paint: { "text-color": COLORS.limit, "text-halo-color": COLORS.land, "text-halo-width": 1.6 },
      });

      // Edges cover exactly what the solid layer shows: the same buildings, from the same zoom.
      fadeLines.current = () => { edgeLook.current.opacity = (1 - shown.current) * EDGE_OPACITY * edgeFade(m.getZoom()); };
      m.on("zoom", () => fadeLines.current());

      // Where measured buildings are missing, the base map's blocks breathe from the resting dark to a soft blue. They get a source of their own, so changing
      // which ones blink does not make the map read its other layers again.
      const block = m.getStyle().layers.find((l) => l.id === BLOCKS) as maplibregl.FillExtrusionLayerSpecification;
      m.addSource(PENDING, m.getStyle().sources[block.source]);
      m.addLayer({
        ...block, id: PENDING, source: PENDING, minzoom: HOMES_FROM_ZOOM, maxzoom: 24, layout: { visibility: "none" },
        paint: { ...block.paint, "fill-extrusion-color": COLORS.pendingDim, "fill-extrusion-color-transition": { duration: PULSE_MS, delay: 0 }, "fill-extrusion-opacity": 0.9 },
      }, BLOCKS);
      const failed = new Set<string>();
      const missing = () => around.current.filter((s) => !squares.current.get(s.name)?.done && !failed.has(s.name));
      let blinking = "";
      const showMissing = () => {
        const list = missing(), now = list.map((s) => s.name).sort().join();
        setLoading(list.length);
        if (now === blinking) return;
        blinking = now;
        m.setLayoutProperty(PENDING, "visibility", list.length ? "visible" : "none");
        if (list.length) m.setFilter(PENDING, ["all", BUILDINGS_3D_FILTER, ["<", ["distance", { type: "MultiPolygon", coordinates: list.map((s) => [s.ring]) }], 1]] as maplibregl.FilterSpecification);
      };
      let bright = false;
      pulse = window.setInterval(() => {
        bright = !bright;
        if (blinking) m.setPaintProperty(PENDING, "fill-extrusion-color", bright ? COLORS.pendingBright : COLORS.pendingDim);
      }, PULSE_MS);

      // Measured buildings come by the 2 km square. The page only starts each load: MapLibre's worker fetches, reads and
      // cuts the buildings, and the lines arrive ready for the GPU. Nothing of this runs where the map draws its frames.
      const asking = new Set<string>();
      const drop = (name: string) => {
        m.removeLayer(homesOf(name));
        m.removeSource(homesOf(name));
        squares.current.get(name)?.scene.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
        squares.current.delete(name);
      };
      const addSquare = (name: string) => {
        asking.add(name);
        squareEdges(name).then(({ at, points }) => {
          if (!ready.current) return;
          const scene = new THREE.Scene(), g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(points, 3));
          const line = new THREE.LineSegments(g, edgeLook.current);
          line.frustumCulled = false; // it would read every point to find the bounds, and squares are picked by hand
          scene.add(line);
          squares.current.set(name, { scene, at, done: false });
          // Tiles stop at z16: finer ones hold the same shapes, in many more pieces.
          m.addSource(homesOf(name), { type: "geojson", data: homesUrl(name), promoteId: "id", maxzoom: 16 });
          m.addLayer({
            id: homesOf(name), type: "fill-extrusion", source: homesOf(name), minzoom: HOMES_FROM_ZOOM, layout: { visibility: solid.current.visibility },
            paint: {
              "fill-extrusion-color": blockColour(live.current.dark),
              "fill-extrusion-height": ["get", "h"],
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": solid.current.opacity,
              "fill-extrusion-opacity-transition": { duration: FADE_MS, delay: 0 },
            },
          }, BLOCKS);
        }).catch(() => { asking.delete(name); failed.add(name); showMissing(); pump(); });
      };
      const pump = () => {
        const c = m.getCenter(), away = (s: Square) => { const [x, y] = centre(s.ring.slice(0, 4)); return Math.hypot(x - c.lng, y - c.lat); };
        missing().filter((s) => !asking.has(s.name)).sort((a, b) => away(a) - away(b)).slice(0, MAX_LOADS - asking.size).forEach((s) => addSquare(s.name));
      };
      const tidy = () => {
        const c = m.getCenter(), near = new Set(around.current.map((s) => s.name));
        const spare = [...squares.current].filter(([name, s]) => s.done && !near.has(name)).sort(([, a], [, b]) => Math.hypot(b.at[0] - c.lng, b.at[1] - c.lat) - Math.hypot(a.at[0] - c.lng, a.at[1] - c.lat));
        spare.slice(0, Math.max(0, squares.current.size - KEEP_SQUARES)).forEach(([name]) => drop(name));
      };
      m.on("sourcedata", (e) => {
        const name = e.sourceId?.startsWith(homesOf("")) ? squareOf(e.sourceId) : "", square = squares.current.get(name);
        if (!square || square.done || !e.isSourceLoaded) return;
        square.done = true;
        asking.delete(name);
        syncHomes.current();
        showMissing();
        pump();
      });
      m.on("error", (e) => {
        const source = (e as { sourceId?: string }).sourceId;
        if (!source?.startsWith(homesOf("")) || !squares.current.has(squareOf(source))) return;
        const name = squareOf(source);
        drop(name); asking.delete(name); failed.add(name); showMissing(); pump();
      });
      // What the view needs is checked while it moves, so blue shows at once. An older answer never replaces a newer one.
      let asks = 0, timer = 0;
      const refresh = () => {
        const ticket = ++asks;
        if (!ready.current) return;
        if (m.getZoom() < HOMES_FROM_ZOOM || live.current.step !== "pick") { around.current = []; showMissing(); return; }
        const { lng, lat } = m.getCenter(), r = LOAD_REACH_DEG;
        squaresIn(lng - r, lat - r * 0.7, lng + r, lat + r * 0.7).then((list) => {
          if (ticket !== asks || !ready.current) return;
          around.current = list.filter((s) => s.ring.some(inRegion));
          showMissing();
          pump();
          tidy();
          m.triggerRepaint();
        }).catch(() => undefined);
      };
      refreshSquares.current = refresh;
      m.on("move", () => { if (!timer) timer = window.setTimeout(() => { timer = 0; refresh(); }, MOVE_CHECK_MS); });
      m.on("moveend", () => { failed.clear(); refresh(); });
      ready.current = true;
      syncHomes.current();
      refresh();
    });

    // The surface under a point. Surfaces are projected forward, as they are drawn, and tested on screen: the map's
    // matrix is too coarse to invert into a line of sight. Sides turned away from the viewer do not count.
    const faceAt = (p: maplibregl.Point): Face | null => {
      const box = m.getContainer(), v = new THREE.Vector3(), w = new THREE.Vector3();
      let best: { depth: number; face: Face } | null = null;
      for (const { scene, id, polys, surfaces } of models.current) {
        const seen = scene.userData.seen as THREE.Matrix4 | null;
        if (!seen) continue;
        for (const { s: surface, poly } of surfaces) {
          const ring = polys[poly].ring, q0 = ring[0];
          const front = v.set(q0[0], q0[1], q0[2]).applyMatrix4(seen).z, ahead = w.set(q0[0] + surface.n[0], q0[1] + surface.n[1], q0[2] + surface.n[2]).applyMatrix4(seen).z;
          if (ahead >= front) continue;
          let depth = 0;
          const flat = ring.map((q): P2 => {
            v.set(q[0], q[1], q[2]).applyMatrix4(seen);
            depth += v.z / ring.length;
            return [(v.x + 1) / 2 * box.clientWidth, (1 - v.y) / 2 * box.clientHeight];
          });
          if (inside([p.x, p.y], flat) && (!best || depth < best.depth)) best = { depth, face: { building: id, poly } };
        }
      }
      return (best as { face: Face } | null)?.face ?? null;
    };

    const under = (p: maplibregl.Point) => {
      const layers = [...squares.current.keys()].map(homesOf);
      const hit = layers.length ? m.queryRenderedFeatures(p, { layers })[0] : undefined;
      if (!hit) return undefined;
      const { id, h, lon, lat } = hit.properties;
      return { id: String(id), square: squareOf(hit.source), at: [lon, lat] as P2, height: Number(h) };
    };
    m.on("click", (e) => {
      if (live.current.step === "review") {
        const found = faceAt(e.point), b = live.current.buildings.find((x) => x.id === found?.building);
        const surface = b?.sun?.surfaces.find((x) => polyOf(b, x) === found?.poly);
        if (b && surface) live.current.onToggle(surfaceKey(b, surface));
        return;
      }
      const pick = live.current.onPick;
      if (!pick) return;
      if (m.getZoom() < HOMES_FROM_ZOOM) { if (inRegion([e.lngLat.lng, e.lngLat.lat])) m.flyTo({ center: e.lngLat, zoom: 18.2, pitch: PITCH, duration: 1200 }); return; }
      const hit = under(e.point);
      if (hit) { heights.current.set(hit.id, hit.height); pick(hit); }
    });
    // Show what a click would pick: the block itself changes colour, nothing is drawn on top of it.
    let frame = 0, lit: Spot[] = [];
    const hover = (spots: Spot[]) => {
      if (spots[0]?.id === lit[0]?.id) return;
      lit.forEach((b) => mark(b, "hover", false));
      spots.forEach((b) => mark(b, "hover", true));
      lit = spots;
    };
    m.on("mousemove", (e) => {
      if (frame || m.isMoving()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (live.current.step === "review") {
          const found = faceAt(e.point);
          m.getCanvas().style.cursor = found ? "pointer" : "";
          live.current.onFace(found);
          return;
        }
        if (!live.current.onPick) { hover([]); m.getCanvas().style.cursor = ""; return; }
        const hit = under(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
        hover(hit ? [hit] : []);
      });
    });
    m.on("mouseout", () => hover([]));
    m.on("movestart", () => hover([]));
    return () => { ready.current = false; clearInterval(pulse); squares.current.clear(); around.current = []; m.remove(); map.current = null; };
  }, []);

  useEffect(() => { syncHomes.current(); }, [buildings]);
  // The theme repaints the map in place: reloading the style would drop every layer added to it.
  useEffect(() => {
    const m = map.current, tones = TONES[dark ? "dark" : "light"];
    if (!m || !ready.current) return;
    const style = mapStyle(dark);
    for (const layer of style.layers) {
      if (!m.getLayer(layer.id) || !("paint" in layer) || !layer.paint) continue;
      for (const [key, value] of Object.entries(layer.paint)) if (key !== "fill-extrusion-opacity") (m as unknown as { setPaintProperty: (id: string, key: string, value: unknown) => void }).setPaintProperty(layer.id, key, value);
    }
    if (style.sky) m.setSky(style.sky);
    if (style.light) m.setLight(style.light);
    squares.current.forEach((_, name) => { if (m.getLayer(homesOf(name))) m.setPaintProperty(homesOf(name), "fill-extrusion-color", blockColour(dark)); });
    m.setPaintProperty("outside", "fill-color", tones.land);
    m.setPaintProperty("limit-text", "text-halo-color", tones.land);
    edgeLook.current.color.set(tones.edge);
    paintRims();
    m.triggerRepaint();
  }, [dark]);
  // Roof photos load while the user is still picking, so nothing pops in during the move.
  const fetched = useRef(new Set<string>());
  useEffect(() => {
    for (const b of buildings) {
      const photo = b.real && !fetched.current.has(b.id) ? photoOf(b) : null;
      if (!photo) continue;
      fetched.current.add(b.id);
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = photo.url;
    }
  }, [buildings]);
  useEffect(placePins, [buildings, step, open]);
  useEffect(paintTiles, [view, chosen, face]);
  useEffect(sunMark, [view]);
  // Models are built when their sun arrives, so tiles appear without leaving the screen.
  const sunReady = buildings.filter((b) => b.sun).length;
  useEffect(() => { if (step === "review" && shown.current === 1) { buildModels(); setShown(1); } }, [sunReady]);
  // A building hovered in the list lights up on the map.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !near) return;
    const b = live.current.buildings.find((x) => x.id === near);
    if (!b) return;
    mark(b, "near", true);
    return () => mark(b, "near", false);
  }, [near]);
  useEffect(() => { if (look) frame(700, look.id); }, [look]);

  const frame = (duration: number, only?: string) => {
    const m = map.current, list = live.current.buildings.filter((b) => !only || b.id === only);
    if (!m || !list.length) return;
    const points = list.flatMap((b) => [b.origin, ...(b.real?.roofs ?? []).flatMap((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]])))]);
    const area = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    // The map stays full size behind its window, so the room is measured from the screen's edges.
    m.fitBounds(area, { padding: wide() ? { top: 90, left: PANEL_W + 70, right: 90, bottom: 120 } : { top: 110, left: 30, right: 30, bottom: innerHeight * 0.5 }, maxZoom: 19.5, pitch: PITCH, bearing: m.getBearing(), duration, easing: glide });
  };

  // Between the steps the map's blocks fade out while the measured buildings fade in, as the camera settles on them.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const to = step === "review" ? 1 : 0, from = shown.current;
    if (to === from) return;
    if (to) { buildModels(); setShown(0); placePins(); frame(MOVE_MS); }
    refreshSquares.current();
    setSolid({ visibility: "visible", opacity: to || aerial ? 0 : 1 });
    const start = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MOVE_MS), eased = glide(t);
      setShown(from + (to - from) * eased);
      fadeLines.current();
      if (t < 1) { frameId = requestAnimationFrame(tick); return; }
      if (to) setSolid({ visibility: "none" });
      else clearModels();
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [step]);

  // Search goes there and marks the spot. It selects nothing.
  useEffect(() => {
    const m = map.current;
    spot.current?.remove();
    spot.current = null;
    if (!focus || !m) return;
    const pin = document.createElement("div");
    pin.className = "spot";
    spot.current = new maplibregl.Marker({ element: pin }).setLngLat(focus).addTo(m);
    m.flyTo({ center: focus, zoom: 18, pitch: PITCH, bearing: 0, duration: 1800 });
  }, [focus]);
  useEffect(() => {
    if (!ready.current) return;
    const m = map.current;
    m?.setLayoutProperty("aerial", "visibility", aerial ? "visible" : "none");
    // See-through, not hidden: buildings must stay clickable over the photo.
    if (step === "pick") setSolid({ opacity: aerial ? 0 : 1 });
  }, [aerial]);
  return (
    <>
      <div className="sheet" aria-hidden="true" />
      <div ref={box} className="map3d" role="application" aria-label="3D map of the home" />
      {loading > 0 && <div className="mapload" role="status">Loading measured buildings…</div>}
      <div className="rim" aria-hidden="true" />
      <SunLight view={view} sun={buildings.find((b) => b.sun)?.sun ?? null} bearing={bearing} />
      <div className="mapctl">
        <IconButton variant="glass" size="lg" label="Go to my location" onClick={locateMe}><Locate /></IconButton>
        <div className="mapstack">
          <IconButton variant="plain" size="lg" label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus /></IconButton>
          <IconButton variant="plain" size="lg" label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus /></IconButton>
          <IconButton variant="plain" size="lg" label="Face north" onClick={() => map.current?.easeTo({ bearing: 0, pitch: PITCH })}><span ref={needle} className="needle"><Needle /></span></IconButton>
        </div>
        <IconButton variant="glass" size="lg" label="Map credits" aria-pressed={credits} onClick={() => setCredits(!credits)}><Info /></IconButton>
      </div>
      {credits && <p className="credits"><a href="https://maplibre.org" target="_blank" rel="noreferrer">MapLibre</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">© OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · Roofs and aerial photo: Bayerische Vermessungsverwaltung</p>}
    </>
  );
}
