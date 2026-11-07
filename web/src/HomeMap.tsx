import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Selected } from "./api";
import { P2, P3, centre, inside, normal, toLngLat, toLocal } from "./geometry";
import { Home as HomeIcon, Info, Locate, Minus, Needle, Plus } from "./icons";
import { mapStyle } from "./mapStyle";
import { MUNICH, REGION_EDGE, REGION_OUTSIDE, VIEW_LIMIT, inRegion } from "./region";
import { Piece, box, pieceId, stitch } from "./stitch";
import { Button, IconButton } from "./ui";

const BLOCKS = "buildings-3d"; // the base map's blocks, used only when zoomed out
const HOMES = "homes"; // the same buildings, one feature each
const HOMES_FROM_ZOOM = 14; // the tiles carry buildings from here
const CLOSE_ZOOM = 15; // close enough to pick a house and not lose it
const EDGES_FROM_ZOOM = 16, EDGES_FULL_ZOOM = 17; // from afar houses cannot be told apart anyway, so no lines to draw
const EDGE_OPACITY = 0.8, EDGE_REACH_M = 3000; // past this the tilted view fades out at the closest zoom they show at
const MAX_HOMES = 40000; // forget what was panned past, so a long trip does not pile up
const PANEL_W = 424; // room the panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const ADDRESS_REACH_M = 25; // an address point can sit on the pavement, in front of the house
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop40?service=WMS&version=1.3.0&request=GetMap&layers=by_dop40c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", wall: "#1F3A5C", edge: "#8A95A8", ownEdge: "#BFD8F5", hover: "#2F5E94", otherRoof: "#3A3D47", otherWall: "#23252C", limit: "#FFD60A", land: "#0F1013" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, n: P3) => new THREE.Color(hex).multiplyScalar(0.95 - 0.35 * n[1]).getHex();
const wide = () => matchMedia("(min-width: 821px)").matches;

export type Picked = { ids: string[]; ring: P2[]; holes: P2[][]; height: number };
type Props = { home: Selected | null; focus: P2 | null; aerial: boolean; onPick?: (b: Picked) => void };

/** One building: the tiles can merge several into one feature, so a feature is not a building. */
type Home = Piece & { group?: string };
type Geometry = { type: string; coordinates: unknown };

function collect(m: maplibregl.Map, pieces: Map<string, Piece>, homes: Map<string, Home>) {
  let added = 0;
  for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    const g = f.geometry as Geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as P2[][]] : g.type === "MultiPolygon" ? (g.coordinates as P2[][][]) : [];
    const height = Number(f.properties.render_height) || 6, base = Number(f.properties.render_min_height) || 0;
    for (const rings of polygons) {
      if (!inRegion(rings[0][0])) continue;
      const pid = pieceId(rings, height, base); // from the shape: neighbouring tiles repeat a building under other ids
      if (pieces.has(pid)) continue;
      pieces.set(pid, { pid, rings, height, base, shell: !!f.properties.hide_3d });
      added++;
    }
  }
  if (!added) return false;
  homes.clear();
  for (const h of stitch([...pieces.values()])) homes.set(h.pid, h);
  // A building mapped in parts has an outline that is not drawn. Its parts belong together.
  const all = [...homes.values()], shells = all.filter((h) => h.shell);
  const parts = all.filter((h) => !h.shell).map((h) => ({ h, at: centre(h.rings[0]) }));
  for (const s of shells) {
    const [w, south, e, north] = box(s);
    for (const { h, at } of parts) if (!h.group && at[0] >= w && at[0] <= e && at[1] >= south && at[1] <= north && inside(at, s.rings[0])) h.group = s.pid;
  }
  // Here and nowhere else: what is collected is not collected twice, so a caller that skipped this would leave the map empty.
  (m.getSource(HOMES) as maplibregl.GeoJSONSource).setData(asData(homes));
  return true;
}

const asData = (homes: Map<string, Home>) => ({
  type: "FeatureCollection" as const,
  features: [...homes.values()].filter((h) => !h.shell).map((h) => ({ type: "Feature" as const, properties: { pid: h.pid, h: h.height, b: h.base }, geometry: { type: "Polygon" as const, coordinates: h.rings } })),
});

const open = (r: P2[]) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

function resolve(homes: Map<string, Home>, h: Home): Picked {
  const shell = h.group ? homes.get(h.group) : undefined;
  const ids = shell ? [...homes.values()].filter((x) => x.group === shell.pid).map((x) => x.pid) : [h.pid];
  const rings = (shell ?? h).rings.map(open);
  return { ids, ring: rings[0], holes: rings.slice(1), height: Math.max(...ids.map((id) => homes.get(id)?.height ?? 0)) };
}

/** The building an address belongs to: the one around the point, else the nearest close by. */
function homeAt(homes: Map<string, Home>, at: P2) {
  let best: Home | null = null, reach = ADDRESS_REACH_M;
  for (const h of homes.values()) {
    if (h.shell) continue;
    const local = h.rings[0].map((p) => toLocal(at, p));
    const d = inside([0, 0], local) ? 0 : Math.min(...local.map((p) => Math.hypot(p[0], p[1])));
    if (d < reach) { reach = d; best = h; }
  }
  return best;
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

/** Roof edges and corners of the buildings around the view. */
/** How far the lines have faded in at a zoom, eased so they neither pop in nor stop abruptly. */
const edgeFade = (zoom: number) => {
  const t = Math.min(1, Math.max(0, (zoom - EDGES_FROM_ZOOM) / (EDGES_FULL_ZOOM - EDGES_FROM_ZOOM)));
  return t * t * (3 - 2 * t);
};

function outlines(homes: Map<string, Home>, origin: P2, skip: Set<string>) {
  // In the map's own projection: `origin` is only near the view, and toLocal holds just close by.
  const o = maplibregl.MercatorCoordinate.fromLngLat(origin, 0), unit = o.meterInMercatorCoordinateUnits();
  const points: number[] = [];
  for (const h of homes.values()) {
    if (h.shell || skip.has(h.pid) || Math.hypot(...toLocal(origin, h.rings[0][0])) > EDGE_REACH_M) continue;
    const up = maplibregl.MercatorCoordinate.fromLngLat(h.rings[0][0], 0).meterInMercatorCoordinateUnits() / unit;
    const top = (h.height + 0.08) * up, base = h.base * up;
    for (const ring of h.rings) {
      const local = ring.map((p) => { const c = maplibregl.MercatorCoordinate.fromLngLat(p, 0); return [(c.x - o.x) / unit, (o.y - c.y) / unit]; });
      for (let i = 0; i + 1 < local.length; i++) {
        const [a, b] = [local[i], local[i + 1]];
        points.push(a[0], a[1], top, b[0], b[1], top, a[0], a[1], base, a[0], a[1], top);
      }
    }
  }
  return lines(points, COLORS.edge);
}

export default function HomeMap({ home, focus, aerial, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const group = useRef(new THREE.Group());
  const edges = useRef(new THREE.Group());
  const pieces = useRef(new Map<string, Piece>());
  const homes = useRef(new Map<string, Home>());
  const origin = useRef<P2 | null>(null);
  const edgesAt = useRef<P2 | null>(null);
  const owned = useRef<string[]>([]);
  const ready = useRef(false);
  const needle = useRef<HTMLSpanElement>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const [credits, setCredits] = useState(false);
  const live = useRef({ onPick, home });
  live.current = { onPick, home };

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
  // The selected building stays the map's own block, recoloured, so its shape cannot change. A measured model replaces
  // every block that stands on its footprint: the map and the land register do not always cut houses the same way.
  const syncHomes = useRef(() => {
    const m = map.current, now = live.current.home;
    if (!m || !ready.current) return;
    const at = (id: string) => ({ source: HOMES, id });
    owned.current.forEach((id) => m.setFeatureState(at(id), { picked: false, gone: false }));
    const picked = now?.homeIds ?? [];
    const gone = new Set<string>();
    if (now?.real) {
      const real = now.real;
      picked.forEach((id) => gone.add(id));
      for (const h of homes.current.values()) {
        const c = toLocal(now.origin, centre(h.rings[0]));
        if (!h.shell && real.ground.some((g) => inside(c, g))) gone.add(h.pid);
      }
    }
    owned.current = [...new Set([...picked, ...gone])];
    picked.forEach((id) => m.setFeatureState(at(id), { picked: true }));
    gone.forEach((id) => m.setFeatureState(at(id), { gone: true }));
    refreshEdges.current();
  });

  const redraw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const g = group.current;
    empty(g);
    origin.current = home?.origin ?? origin.current;
    syncHomes.current();
    if (home?.real) {
      const { roofs, walls, others } = home.real;
      walls.forEach((p) => g.add(polygon(p.ring, p.holes, COLORS.wall)));
      roofs.forEach((p) => g.add(polygon(p.ring, p.holes, lit(COLORS.roof, normal(p.ring)))));
      others.forEach((p) => g.add(polygon(p.ring, p.holes, normal(p.ring)[2] > 0.1 ? COLORS.otherRoof : COLORS.otherWall)));
      g.add(lines(edgesOf([...walls, ...roofs]), COLORS.ownEdge, 0.7));
      g.add(lines(edgesOf(others), COLORS.edge));
    }
    m.triggerRepaint();
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
    const scene = new THREE.Scene(), edgeScene = new THREE.Scene(), camera = new THREE.Camera();
    scene.add(group.current);
    edgeScene.add(edges.current);
    m.on("load", () => {
      const paint = (name: "fill-extrusion-color" | "fill-extrusion-opacity") => m.getPaintProperty(BLOCKS, name);
      m.setLayoutProperty(BLOCKS, "visibility", "none");
      m.addSource(HOMES, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "pid" });
      m.addLayer({
        id: HOMES, type: "fill-extrusion", source: HOMES, minzoom: HOMES_FROM_ZOOM,
        paint: {
          "fill-extrusion-color": ["case", ["boolean", ["feature-state", "gone"], false], "#131418", ["boolean", ["feature-state", "picked"], false], COLORS.roof, ["boolean", ["feature-state", "hover"], false], COLORS.hover, "#2A2C34"],
          "fill-extrusion-height": ["case", ["boolean", ["feature-state", "gone"], false], 0, ["get", "h"]],
          "fill-extrusion-base": ["case", ["boolean", ["feature-state", "gone"], false], 0, ["get", "b"]],
          "fill-extrusion-opacity": paint("fill-extrusion-opacity") as number,
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
          draw(scene, origin.current);
          if (edgeFade(m.getZoom()) > 0) draw(edgeScene, edgesAt.current);
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
      const fadeEdges = () => edges.current.children.forEach((l) => { ((l as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = EDGE_OPACITY * edgeFade(m.getZoom()); });
      refreshEdges.current = () => {
        if (edgeFade(m.getZoom()) === 0) return; // nothing to see: left for when the view comes close
        const c = m.getCenter();
        const now = `${pieces.current.size}|${owned.current.join()}|${Math.round(c.lng * 100)}|${Math.round(c.lat * 100)}`; // a joined piece leaves the count of homes as it was
        if (now === drawn) return;
        drawn = now;
        edgesAt.current = [c.lng, c.lat];
        empty(edges.current);
        edges.current.add(outlines(homes.current, edgesAt.current, new Set(owned.current)));
        fadeEdges();
        m.triggerRepaint();
      };
      m.on("zoom", () => { refreshEdges.current(); fadeEdges(); });
      // Tiles arrive one by one, so split what has arrived into single buildings, a moment after the last one.
      let timer = 0;
      const update = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (pieces.current.size > MAX_HOMES) { pieces.current.clear(); homes.current.clear(); }
          collect(m, pieces.current, homes.current);
          syncHomes.current();
        }, 120);
      };
      m.on("sourcedata", (e) => { if (e.sourceId === "openmaptiles" && e.tile) update(); });
      m.on("moveend", update);
      ready.current = true;
      redraw();
      update();
    });

    const under = (p: maplibregl.Point) => {
      if (!m.getLayer(HOMES)) return undefined;
      const hit = m.queryRenderedFeatures(p, { layers: [HOMES] })[0];
      return hit ? homes.current.get(String(hit.properties.pid)) : undefined;
    };
    m.on("click", (e) => {
      const pick = live.current.onPick;
      if (!pick) return;
      if (m.getZoom() < CLOSE_ZOOM) { if (inRegion([e.lngLat.lng, e.lngLat.lat])) m.flyTo({ center: e.lngLat, zoom: 18.2, pitch: PITCH, duration: 1200 }); return; }
      const hit = under(e.point);
      if (hit) pick(resolve(homes.current, hit));
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
        hover(hit ? resolve(homes.current, hit).ids : []);
      });
    });
    m.on("mouseout", () => hover([]));
    m.on("movestart", () => hover([]));
    return () => { ready.current = false; m.remove(); map.current = null; };
  }, []);

  useEffect(redraw, [home]);
  const frame = (duration: number) => {
    const m = map.current;
    if (!m || !home) return;
    const points = home.ring.map((p) => toLngLat(home.origin, p));
    const area = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    const side = matchMedia("(min-width: 821px)").matches ? PANEL_W : 0;
    m.fitBounds(area, { padding: { top: 120, bottom: 120, right: 120, left: 120 + side }, maxZoom: 19.5, pitch: PITCH, bearing: m.getBearing(), duration });
  };
  // Frame the home once, so a large building is not cut off, and keep it close enough not to lose it.
  const framed = useRef<P2 | null>(null);
  useEffect(() => {
    if (!home) { framed.current = null; map.current?.setMinZoom(null); return; }
    if (framed.current === home.origin || !map.current) return;
    framed.current = home.origin;
    map.current.setMinZoom(CLOSE_ZOOM);
    frame(900);
  }, [home]);
  useEffect(() => {
    const m = map.current;
    if (!focus || !m) return;
    m.flyTo({ center: focus, zoom: 18.6, pitch: PITCH, bearing: 0, duration: 1800 });
    // The building is only known once the map has arrived and its tiles are in.
    let tries = 0;
    const wait = setInterval(() => {
      if (++tries > 40) clearInterval(wait);
      if (m.isMoving() || !m.areTilesLoaded() || m.getZoom() < 17) return;
      if (collect(m, pieces.current, homes.current)) syncHomes.current();
      const hit = homeAt(homes.current, focus);
      if (!hit && tries < 12) return;
      clearInterval(wait);
      if (hit && !live.current.home) live.current.onPick?.(resolve(homes.current, hit));
    }, 250);
    return () => clearInterval(wait);
  }, [focus]);
  useEffect(() => {
    if (!ready.current) return;
    const m = map.current;
    m?.setLayoutProperty("aerial", "visibility", aerial ? "visible" : "none");
    // See-through, not hidden: buildings must stay clickable over the photo.
    m?.setPaintProperty(HOMES, "fill-extrusion-opacity", aerial ? 0 : 1);
  }, [aerial]);
  return (
    <>
      <div ref={box} className="map3d" role="application" aria-label="3D map of the home" />
      {home && <Button variant="glass" size="lg" className="map-home" onClick={() => frame(700)}><HomeIcon />Back to my home</Button>}
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
