import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Selected, Square, homesUrl, squareEdges, squaresIn } from "./api";
import { P2, P3, centre, inside, listedFaces, normal, toLngLat } from "./geometry";
import { Home as HomeIcon, Info, Locate, Minus, Needle, Plus } from "./icons";
import { BUILDINGS_3D_FILTER, mapStyle } from "./mapStyle";
import { MUNICH, REGION_EDGE, REGION_OUTSIDE, VIEW_LIMIT, inRegion } from "./region";
import { Button, IconButton } from "./ui";

const BLOCKS = "buildings-3d"; // the base map's blocks: a rough picture from afar, never selected
const homesOf = (square: string) => `homes-${square}`; // measured buildings, one feature each: what people select. A source and layer per square
const squareOf = (source: string) => source.slice(homesOf("").length);
const PENDING = "pending-blocks"; // the base map's blocks, blinking blue, where measured buildings are still on their way
const HOMES_FROM_ZOOM = 15;
const LOAD_REACH_DEG = 0.018; // about 1.5 km around the view's centre
const MAX_LOADS = 3; // at once, nearest first: a quick trip across town must not queue behind places already left
const KEEP_SQUARES = 16; // the farthest beyond this leave the map, so a long session stays as light as a short one
const MOVE_CHECK_MS = 300, PULSE_MS = 700;
const EDGES_FROM_ZOOM = 16, EDGES_FULL_ZOOM = 17; // from afar houses cannot be told apart anyway, so no lines to draw
const EDGE_OPACITY = 0.8;
const PANEL_W = 424; // room the panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const FADE_MS = 900; // from the map's blocks to the measured buildings, and back
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop40?service=WMS&version=1.3.0&request=GetMap&layers=by_dop40c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", wall: "#1F3A5C", edge: "#8A95A8", ownEdge: "#BFD8F5", hover: "#2F5E94", pending: "#4C9BFF", face: "#FF9F0A", otherRoof: "#3A3D47", otherWall: "#23252C", limit: "#FFD60A", land: "#0F1013" };
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
};

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

export default function HomeMap({ buildings, step, focus, aerial, onPick, open, near, face, look, onFace, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const models = useRef<{ scene: THREE.Scene; at: P2; id: string; roofs: Poly[] }[]>([]); // one per building, each around its own origin
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
  const spot = useRef<maplibregl.Marker | null>(null);
  const pins = useRef<maplibregl.Marker[]>([]);
  const live = useRef({ onPick, buildings, step, onFace, onOpen });
  live.current = { onPick, buildings, step, onFace, onOpen };

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
      material.transparent = t < 1;
      material.depthWrite = t >= 1; // while fading, a wall must not hide the roof behind it
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
      walls.forEach((p) => g.add(polygon(p.ring, p.holes, COLORS.wall)));
      roofs.forEach((p, poly) => {
        const roof = polygon(p.ring, p.holes, lit(COLORS.roof, normal(p.ring)));
        roof.userData = { face: { building: b.id, poly }, color: (roof.material as THREE.MeshBasicMaterial).color.getHex() };
        g.add(roof);
      });
      const line = lines(edgesOf([...walls, ...roofs]), COLORS.ownEdge, 0.7);
      (line.material as THREE.Material).userData.opacity = 0.7;
      g.add(line);
      scene.add(g);
      return { scene, at: b.origin, id: b.id, roofs };
    });
  };

  // Letters mark buildings and numbers mark roof surfaces, the same ones as in the panel.
  const liftPins = useRef(() => {});
  const placePins = () => {
    const m = map.current;
    pins.current.forEach((x) => x.remove());
    pins.current = [];
    if (!m || !ready.current) return;
    const pin = (text: string, at: P2, z: number, click: () => void, small = false) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = `pin${small ? " small" : ""}`;
      tag.textContent = text;
      tag.dataset.z = String(z);
      tag.addEventListener("click", (e) => { e.stopPropagation(); click(); });
      pins.current.push(new maplibregl.Marker({ element: tag }).setLngLat(at).addTo(m));
    };
    buildings.forEach((b, i) => {
      if (step === "review" && b.id === open && b.real) {
        listedFaces(b.real.roofs).forEach((f, n) => pin(String(n + 1), toLngLat(b.origin, [f.at[0], f.at[1]]), f.at[2], () => onFace({ building: b.id, poly: f.poly }), true));
      } else pin(letter(i), b.origin, (heights.current.get(b.id) ?? 8) + 1, () => onOpen(b.id));
    });
    liftPins.current();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current as HTMLDivElement, style: mapStyle(true), attributionControl: false, center: MUNICH, zoom: 11, pitch: 30, maxPitch: 60, bearing: 0,
      maxBounds: VIEW_LIMIT, clickTolerance: 8, canvasContextAttributes: { antialias: true },
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
    m.on("rotate", () => { if (needle.current) needle.current.style.rotate = `${-m.getBearing()}deg`; });
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

      // Where measured buildings are missing, the base map's blocks blink. They get a source of their own, so changing
      // which ones blink does not make the map read its other layers again.
      const block = m.getStyle().layers.find((l) => l.id === BLOCKS) as maplibregl.FillExtrusionLayerSpecification;
      m.addSource(PENDING, m.getStyle().sources[block.source]);
      m.addLayer({
        ...block, id: PENDING, source: PENDING, minzoom: HOMES_FROM_ZOOM, maxzoom: 24, layout: { visibility: "none" },
        paint: { ...block.paint, "fill-extrusion-color": COLORS.pending, "fill-extrusion-opacity": 0.6, "fill-extrusion-opacity-transition": { duration: PULSE_MS, delay: 0 } },
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
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let bright = false;
        pulse = window.setInterval(() => {
          bright = !bright;
          if (blinking) m.setPaintProperty(PENDING, "fill-extrusion-opacity", bright ? 0.8 : 0.15);
        }, PULSE_MS);
      }

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
              "fill-extrusion-color": ["case", ["boolean", ["feature-state", "near"], false], COLORS.face, ["boolean", ["feature-state", "picked"], false], COLORS.roof, ["boolean", ["feature-state", "hover"], false], COLORS.hover, "#2A2C34"],
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

    // The roof surface under a point. Roofs are projected forward, as they are drawn, and tested on screen: the map's
    // matrix is too coarse to invert into a line of sight.
    const faceAt = (p: maplibregl.Point): Face | null => {
      const box = m.getContainer(), v = new THREE.Vector3();
      let best: { depth: number; face: Face } | null = null;
      for (const { scene, id, roofs } of models.current) {
        const seen = scene.userData.seen as THREE.Matrix4 | null;
        if (!seen) continue;
        roofs.forEach(({ ring }, poly) => {
          let depth = 0;
          const flat = ring.map((q): P2 => {
            v.set(q[0], q[1], q[2]).applyMatrix4(seen);
            depth += v.z / ring.length;
            return [(v.x + 1) / 2 * box.clientWidth, (1 - v.y) / 2 * box.clientHeight];
          });
          if (inside([p.x, p.y], flat) && (!best || depth < best.depth)) best = { depth, face: { building: id, poly } };
        });
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
      if (live.current.step === "review") { const found = faceAt(e.point); if (found) live.current.onOpen(found.building); return; }
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
  useEffect(placePins, [buildings, step, open]);
  // A building hovered in the list lights up on the map.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !near) return;
    const b = live.current.buildings.find((x) => x.id === near);
    if (!b) return;
    mark(b, "near", true);
    return () => mark(b, "near", false);
  }, [near]);
  // A roof surface hovered on either side lights up on the model.
  useEffect(() => {
    models.current.forEach(({ scene }) => scene.traverse((o) => {
      const mine = o.userData.face as Face | undefined;
      if (!mine) return;
      const on = face?.building === mine.building && face.poly === mine.poly;
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(on ? COLORS.face : o.userData.color);
    }));
    map.current?.triggerRepaint();
  }, [face]);
  useEffect(() => { if (look) frame(700, look.id); }, [look]);

  const frame = (duration: number, only?: string) => {
    const m = map.current, list = live.current.buildings.filter((b) => !only || b.id === only);
    if (!m || !list.length) return;
    const points = list.flatMap((b) => [b.origin, ...(b.real?.roofs ?? []).flatMap((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]])))]);
    const area = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    const side = matchMedia("(min-width: 821px)").matches ? PANEL_W : 0;
    m.fitBounds(area, { padding: { top: 120, bottom: 120, right: 120, left: 120 + side }, maxZoom: 19.5, pitch: PITCH, bearing: m.getBearing(), duration });
  };

  // Between the steps the map's blocks fade out while the measured buildings fade in, as the camera settles on them.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const to = step === "review" ? 1 : 0, from = shown.current;
    if (to === from) return;
    if (to) { buildModels(); setShown(0); frame(FADE_MS); placePins(); }
    refreshSquares.current();
    setSolid({ visibility: "visible", opacity: to || aerial ? 0 : 1 });
    const start = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_MS), eased = t * t * (3 - 2 * t);
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
      <div ref={box} className="map3d" role="application" aria-label="3D map of the home" />
      {loading > 0 && <div className="mapload" role="status">Loading measured buildings…</div>}
      {step === "review" && <Button variant="glass" size="lg" className="map-home" onClick={() => frame(700)}><HomeIcon />Show my buildings</Button>}
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
