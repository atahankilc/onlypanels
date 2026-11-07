import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Selected, squareBuildings, squaresIn } from "./api";
import { P2, P3, centre, normal, toLocal } from "./geometry";
import { Home as HomeIcon, Info, Locate, Minus, Needle, Plus } from "./icons";
import { mapStyle } from "./mapStyle";
import { MUNICH, REGION_EDGE, REGION_OUTSIDE, VIEW_LIMIT, inRegion } from "./region";
import { Button, IconButton } from "./ui";

const BLOCKS = "buildings-3d"; // the base map's blocks: a rough picture from afar, never selected
const HOMES = "homes"; // measured buildings, one feature each: what people select
const HOMES_FROM_ZOOM = 15;
const LOAD_REACH_DEG = 0.018; // about 1.5 km around the view's centre
const EDGES_FROM_ZOOM = 16, EDGES_FULL_ZOOM = 17; // from afar houses cannot be told apart anyway, so no lines to draw
const EDGE_OPACITY = 0.8, EDGE_REACH_M = 3000; // past this the tilted view fades out at the closest zoom they show at
const PANEL_W = 424; // room the panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const FADE_MS = 900; // from the map's blocks to the measured buildings, and back
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop40?service=WMS&version=1.3.0&request=GetMap&layers=by_dop40c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", wall: "#1F3A5C", edge: "#8A95A8", ownEdge: "#BFD8F5", hover: "#2F5E94", otherRoof: "#3A3D47", otherWall: "#23252C", limit: "#FFD60A", land: "#0F1013" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, n: P3) => new THREE.Color(hex).multiplyScalar(0.95 - 0.35 * n[1]).getHex();
const wide = () => matchMedia("(min-width: 821px)").matches;

export type Picked = { id: string; square: string; at: P2 };
export type Step = "pick" | "review";
type Props = { buildings: Selected[]; step: Step; focus: P2 | null; aerial: boolean; onPick?: (b: Picked) => void };

type Home = { id: string; square: string; polys: P2[][][]; height: number };

const asData = (homes: Map<string, Home>) => ({
  type: "FeatureCollection" as const,
  features: [...homes.values()].map((h) => ({ type: "Feature" as const, properties: { id: h.id, h: h.height }, geometry: { type: "MultiPolygon" as const, coordinates: h.polys } })),
});

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

/** Roof edges and corners of the buildings around the view. */
/** How far the lines have faded in at a zoom, eased so they neither pop in nor stop abruptly. */
const edgeFade = (zoom: number) => {
  const t = Math.min(1, Math.max(0, (zoom - EDGES_FROM_ZOOM) / (EDGES_FULL_ZOOM - EDGES_FROM_ZOOM)));
  return t * t * (3 - 2 * t);
};

function outlines(homes: Map<string, Home>, origin: P2) {
  // In the map's own projection: `origin` is only near the view, and toLocal holds just close by.
  const o = maplibregl.MercatorCoordinate.fromLngLat(origin, 0), unit = o.meterInMercatorCoordinateUnits();
  const points: number[] = [];
  for (const h of homes.values()) {
    if (Math.hypot(...toLocal(origin, h.polys[0][0][0])) > EDGE_REACH_M) continue;
    const top = h.height + 0.08;
    for (const rings of h.polys) for (const ring of rings) {
      const local = ring.map((p) => { const c = maplibregl.MercatorCoordinate.fromLngLat(p, 0); return [(c.x - o.x) / unit, (o.y - c.y) / unit]; });
      local.forEach((a, i) => {
        const b = local[(i + 1) % local.length];
        points.push(a[0], a[1], top, b[0], b[1], top, a[0], a[1], 0, a[0], a[1], top);
      });
    }
  }
  return lines(points, COLORS.edge);
}

export default function HomeMap({ buildings, step, focus, aerial, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const models = useRef<{ scene: THREE.Scene; at: P2 }[]>([]); // one per building, each around its own origin
  const edges = useRef(new THREE.Group());
  const asked = useRef(new Set<string>());
  const [loading, setLoading] = useState(0);
  const homes = useRef(new Map<string, Home>());
  const edgesAt = useRef<P2 | null>(null);
  const owned = useRef<string[]>([]);
  const ready = useRef(false);
  const shown = useRef(0); // 0: the map's blocks, 1: the measured buildings
  const needle = useRef<HTMLSpanElement>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const [credits, setCredits] = useState(false);
  const spot = useRef<maplibregl.Marker | null>(null);
  const live = useRef({ onPick, buildings });
  live.current = { onPick, buildings };

  const locateMe = () => navigator.geolocation?.getCurrentPosition((p) => {
    const m = map.current, at: P2 = [p.coords.longitude, p.coords.latitude];
    if (!m || !inRegion(at)) return;
    const dot = document.createElement("div");
    dot.className = "me";
    me.current?.remove();
    me.current = new maplibregl.Marker({ element: dot }).setLngLat(at).addTo(m);
    m.flyTo({ center: at, zoom: 18, pitch: PITCH, duration: 1400 });
  }, () => undefined, { enableHighAccuracy: true, timeout: 8000 });

  const refreshEdges = useRef(() => {});
  const fadeLines = useRef(() => {});
  // A selected building stays the map's own block, recoloured, so its shape cannot change.
  const syncHomes = useRef(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const at = (id: string) => ({ source: HOMES, id });
    owned.current.forEach((id) => m.setFeatureState(at(id), { picked: false }));
    owned.current = live.current.buildings.map((b) => b.id);
    owned.current.forEach((id) => m.setFeatureState(at(id), { picked: true }));
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
      roofs.forEach((p) => g.add(polygon(p.ring, p.holes, lit(COLORS.roof, normal(p.ring)))));
      const line = lines(edgesOf([...walls, ...roofs]), COLORS.ownEdge, 0.7);
      (line.material as THREE.Material).userData.opacity = 0.7;
      g.add(line);
      scene.add(g);
      return { scene, at: b.origin };
    });
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
    m.on("rotate", () => { if (needle.current) needle.current.style.rotate = `${-m.getBearing()}deg`; });
    m.once("load", locateMe);
    let renderer: THREE.WebGLRenderer;
    const edgeScene = new THREE.Scene(), camera = new THREE.Camera();
    edgeScene.add(edges.current);
    m.on("load", () => {
      const paint = (name: "fill-extrusion-color" | "fill-extrusion-opacity") => m.getPaintProperty(BLOCKS, name);
      m.setLayerZoomRange(BLOCKS, 14, HOMES_FROM_ZOOM);
      m.addSource(HOMES, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
      m.addLayer({
        id: HOMES, type: "fill-extrusion", source: HOMES, minzoom: HOMES_FROM_ZOOM,
        paint: {
          "fill-extrusion-color": ["case", ["boolean", ["feature-state", "picked"], false], COLORS.roof, ["boolean", ["feature-state", "hover"], false], COLORS.hover, "#2A2C34"],
          "fill-extrusion-height": ["get", "h"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": paint("fill-extrusion-opacity") as number,
          "fill-extrusion-opacity-transition": { duration: FADE_MS, delay: 0 },
        },
      }, BLOCKS);
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
            if (!at) return;
            const c = maplibregl.MercatorCoordinate.fromLngLat(at, 0), s = c.meterInMercatorCoordinateUnits();
            const local = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).scale(new THREE.Vector3(s, -s, s));
            camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(local);
            renderer.render(what, camera);
          };
          if (edgeFade(m.getZoom()) > 0 && shown.current < 1) draw(edgeScene, edgesAt.current);
          if (shown.current > 0) models.current.forEach(({ scene, at }) => draw(scene, at));
        },
      });
      m.addSource("aerial", { type: "raster", tiles: [AERIAL], tileSize: 512 });
      m.addLayer({ id: "aerial", type: "raster", source: "aerial", layout: { visibility: "none" } }, HOMES);

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
      let drawn = "";
      const fadeEdges = () => edges.current.children.forEach((l) => { ((l as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = (1 - shown.current) * EDGE_OPACITY * edgeFade(m.getZoom()); });
      refreshEdges.current = () => {
        if (edgeFade(m.getZoom()) === 0) return; // nothing to see: left for when the view comes close
        const c = m.getCenter();
        const now = `${homes.current.size}|${Math.round(c.lng * 100)}|${Math.round(c.lat * 100)}`; // a joined piece leaves the count of homes as it was
        if (now === drawn) return;
        drawn = now;
        edgesAt.current = [c.lng, c.lat];
        empty(edges.current);
        edges.current.add(outlines(homes.current, edgesAt.current));
        fadeEdges();
        m.triggerRepaint();
      };
      m.on("zoom", () => { refreshEdges.current(); fadeEdges(); });
      fadeLines.current = fadeEdges;
      // Measured buildings come by the 2 km square, around wherever the view settles. Each square is asked for once.
      const addSquare = (name: string) => {
        asked.current.add(name);
        setLoading((n) => n + 1);
        squareBuildings(name).then((list) => {
          list.forEach((b) => { if (inRegion(b.polys[0][0][0])) homes.current.set(b.id, { ...b, square: name }); });
          (m.getSource(HOMES) as maplibregl.GeoJSONSource).setData(asData(homes.current));
          syncHomes.current();
          refreshEdges.current();
        }).catch(() => asked.current.delete(name)).finally(() => setLoading((n) => n - 1));
      };
      const load = () => {
        if (m.getZoom() < HOMES_FROM_ZOOM) return;
        const { lng, lat } = m.getCenter(), r = LOAD_REACH_DEG;
        squaresIn(lng - r, lat - r * 0.7, lng + r, lat + r * 0.7).then((names) => names.filter((n) => !asked.current.has(n)).forEach(addSquare)).catch(() => undefined);
      };
      m.on("moveend", load);
      ready.current = true;
      syncHomes.current();
      load();
    });

    const under = (p: maplibregl.Point) => {
      if (!m.getLayer(HOMES)) return undefined;
      const hit = m.queryRenderedFeatures(p, { layers: [HOMES] })[0];
      return hit ? homes.current.get(String(hit.properties.id)) : undefined;
    };
    m.on("click", (e) => {
      const pick = live.current.onPick;
      if (!pick) return;
      if (m.getZoom() < HOMES_FROM_ZOOM) { if (inRegion([e.lngLat.lng, e.lngLat.lat])) m.flyTo({ center: e.lngLat, zoom: 18.2, pitch: PITCH, duration: 1200 }); return; }
      const hit = under(e.point);
      if (hit) pick({ id: hit.id, square: hit.square, at: centre(hit.polys[0][0]) });
    });
    // Show what a click would pick: the block itself changes colour, nothing is drawn on top of it.
    let frame = 0, lit: string[] = [];
    const hover = (ids: string[]) => {
      if (ids.join() === lit.join()) return;
      lit.forEach((id) => m.setFeatureState({ source: HOMES, id }, { hover: false }));
      ids.forEach((id) => m.setFeatureState({ source: HOMES, id }, { hover: true }));
      lit = ids;
    };
    m.on("mousemove", (e) => {
      if (frame || m.isMoving()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!live.current.onPick) { hover([]); m.getCanvas().style.cursor = ""; return; }
        const hit = under(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
        hover(hit ? [hit.id] : []);
      });
    });
    m.on("mouseout", () => hover([]));
    m.on("movestart", () => hover([]));
    return () => { ready.current = false; m.remove(); map.current = null; };
  }, []);

  useEffect(() => syncHomes.current(), [buildings]);
  const frame = (duration: number) => {
    const m = map.current, list = live.current.buildings;
    if (!m || !list.length) return;
    const points = list.flatMap((b) => homes.current.get(b.id)?.polys[0][0] ?? [b.origin]);
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
    if (to) { buildModels(); setShown(0); frame(FADE_MS); }
    m.setLayoutProperty(HOMES, "visibility", "visible");
    m.setPaintProperty(HOMES, "fill-extrusion-opacity", to || aerial ? 0 : 1);
    const start = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_MS), eased = t * t * (3 - 2 * t);
      setShown(from + (to - from) * eased);
      fadeLines.current();
      if (t < 1) { frameId = requestAnimationFrame(tick); return; }
      if (to) m.setLayoutProperty(HOMES, "visibility", "none");
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
    if (step === "pick") m?.setPaintProperty(HOMES, "fill-extrusion-opacity", aerial ? 0 : 1);
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
