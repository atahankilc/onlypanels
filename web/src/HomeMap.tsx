import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Site, usedSurfaces } from "./api";
import { P2, P3, centre, inside, normal, toLngLat, toLocal } from "./geometry";
import { Home as HomeIcon, Info, Locate, Minus, Needle, Plus } from "./icons";
import { mapStyle } from "./mapStyle";
import { Button, IconButton } from "./ui";

const BLOCKS = "buildings-3d"; // the base map's blocks, used only when zoomed out
const HOMES = "homes"; // the same buildings, one feature each
const HOMES_FROM_ZOOM = 15;
const PANEL_W = 424; // room the left panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const ADDRESS_REACH_M = 25; // an address point can sit on the pavement, in front of the house
const SHADE_LOOK_M = 70;
const OUTLINE_REACH_M = 450;
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop40?service=WMS&version=1.3.0&request=GetMap&layers=by_dop40c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", off: "#33363F", wall: "#1F3A5C", ground: "#2F6B4F", panel: "#0A1222", edge: "#8A95A8", ownEdge: "#BFD8F5", hover: "#2F5E94", otherRoof: "#3A3D47", otherWall: "#23252C" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, azimuth: number) => new THREE.Color(hex).multiplyScalar(0.8 + 0.3 * Math.cos(((azimuth - 180) * Math.PI) / 180)).getHex();
const wide = () => matchMedia("(min-width: 821px)").matches;

export type Picked = { ids: string[]; ring: P2[]; holes: P2[][]; height: number; at: P2; neighbours: { at: P2; height: number }[] };
type Props = {
  site: Site | null; placed: number[] | null; focus?: P2 | null; aerial?: boolean; draft?: P2[];
  onBuilding?: (b: Picked) => void; onPoint?: (p: P2) => void; drawing?: boolean; locate?: boolean;
};

/** One building: the tiles can merge several into one feature, so a feature is not a building. */
type Home = { pid: string; rings: P2[][]; height: number; base: number; shell: boolean; group?: string };
type Geometry = { type: string; coordinates: unknown };

function collect(m: maplibregl.Map, homes: Map<string, Home>) {
  let added = 0;
  for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    const g = f.geometry as Geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as P2[][]] : g.type === "MultiPolygon" ? (g.coordinates as P2[][][]) : [];
    for (const rings of polygons) {
      const c = centre(rings[0]), pid = `${f.id}:${c[0].toFixed(5)}:${c[1].toFixed(5)}`;
      if (homes.has(pid)) continue;
      homes.set(pid, { pid, rings, height: Number(f.properties.render_height) || 6, base: Number(f.properties.render_min_height) || 0, shell: !!f.properties.hide_3d });
      added++;
    }
  }
  if (!added) return false;
  // A building mapped in parts has an outline that is not drawn. Its parts belong together.
  const all = [...homes.values()], shells = all.filter((h) => h.shell);
  for (const s of shells) for (const h of all) if (!h.shell && !h.group && inside(centre(h.rings[0]), s.rings[0])) h.group = s.pid;
  return true;
}

const asData = (homes: Map<string, Home>) => ({
  type: "FeatureCollection" as const,
  features: [...homes.values()].filter((h) => !h.shell).map((h) => ({ type: "Feature" as const, properties: { pid: h.pid, h: h.height, b: h.base }, geometry: { type: "Polygon" as const, coordinates: h.rings } })),
});

const open = (r: P2[]) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

function resolve(homes: Map<string, Home>, h: Home, at?: P2): Picked {
  const shell = h.group ? homes.get(h.group) : undefined;
  const ids = shell ? [...homes.values()].filter((x) => x.group === shell.pid).map((x) => x.pid) : [h.pid];
  const rings = (shell ?? h).rings.map(open), middle = centre(rings[0]);
  const neighbours = [...homes.values()].filter((x) => !x.shell && !ids.includes(x.pid)).map((x) => ({ at: centre(x.rings[0]), height: x.height }))
    .filter((x) => Math.hypot(...toLocal(middle, x.at)) < SHADE_LOOK_M);
  return { ids, ring: rings[0], holes: rings.slice(1), height: Math.max(...ids.map((id) => homes.get(id)?.height ?? 0)), at: at ?? middle, neighbours };
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

function walls(ring: P3[], base: number) {
  const points: P3[] = [], faces: number[] = [];
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], k = points.length;
    points.push([p[0], p[1], base], [q[0], q[1], base], q, p);
    faces.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  return mesh(points, faces, COLORS.wall);
}

function panels(list: P3[][]) {
  const points: P3[] = [], faces: number[] = [];
  list.forEach((c) => { const k = points.length; points.push(...c); faces.push(k, k + 1, k + 2, k, k + 2, k + 3); });
  return mesh(points, faces, COLORS.panel);
}

function lines(points: number[], color: string, opacity = 0.8) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
const edgesOf = (polys: Poly[]) => polys.flatMap(({ ring }) => ring.flatMap((p, i) => { const q = ring[(i + 1) % ring.length]; return [...p, ...q]; }));

/** Roof edges and corners of the buildings around the view. */
function outlines(homes: Map<string, Home>, origin: P2, centerAt: P2, skip: Set<string>) {
  const mid = toLocal(origin, centerAt), points: number[] = [];
  for (const h of homes.values()) {
    if (h.shell || skip.has(h.pid)) continue;
    const top = h.height + 0.08;
    for (const ring of h.rings) {
      const local = ring.map((p) => toLocal(origin, p));
      if (Math.hypot(local[0][0] - mid[0], local[0][1] - mid[1]) > OUTLINE_REACH_M) break;
      for (let i = 0; i + 1 < local.length; i++) {
        const [a, b] = [local[i], local[i + 1]];
        points.push(a[0], a[1], top, b[0], b[1], top, a[0], a[1], h.base, a[0], a[1], top);
      }
    }
  }
  return lines(points, COLORS.edge);
}

export default function HomeMap({ site, placed, focus, aerial, draft, onBuilding, onPoint, drawing, locate }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const group = useRef(new THREE.Group());
  const edges = useRef(new THREE.Group());
  const homes = useRef(new Map<string, Home>());
  const origin = useRef<P2 | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const owned = useRef<string[]>([]);
  const ready = useRef(false);
  const liftPins = useRef(() => {});
  const needle = useRef<HTMLSpanElement>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const [credits, setCredits] = useState(false);
  const locateMe = () => navigator.geolocation?.getCurrentPosition((p) => {
    const m = map.current, at: P2 = [p.coords.longitude, p.coords.latitude];
    if (!m) return;
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
    const m = map.current, now = live.current.site;
    if (!m || !ready.current) return;
    const at = (id: string) => ({ source: HOMES, id });
    owned.current.forEach((id) => m.setFeatureState(at(id), { picked: false, gone: false }));
    const picked = (now?.buildings ?? []).flatMap((b) => b.homeIds);
    const gone = new Set<string>();
    now?.buildings.forEach((b) => {
      if (!b.real) return;
      b.homeIds.forEach((id) => gone.add(id));
      for (const h of homes.current.values()) {
        const c = toLocal(now.origin, centre(h.rings[0]));
        if (!h.shell && b.real.ground.some((g) => inside(c, g))) gone.add(h.pid);
      }
    });
    owned.current = [...new Set([...picked, ...gone])];
    picked.forEach((id) => m.setFeatureState(at(id), { picked: true }));
    gone.forEach((id) => m.setFeatureState(at(id), { gone: true }));
    refreshEdges.current();
  });
  const live = useRef({ onBuilding, onPoint, drawing, locate, site });
  live.current = { onBuilding, onPoint, drawing, locate, site };

  const redraw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const g = group.current;
    g.clear();
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    origin.current = site?.origin ?? origin.current;

    syncHomes.current();

    if (site) {
      site.buildings.forEach((b) => {
        if (!b.real) return;
        b.real.walls.forEach((p) => g.add(polygon(p.ring, p.holes, COLORS.wall)));
        b.real.rest.forEach((p) => g.add(polygon(p.ring, p.holes, COLORS.roof)));
        b.real.others.forEach((p) => g.add(polygon(p.ring, p.holes, normal(p.ring)[2] > 0.1 ? COLORS.otherRoof : COLORS.otherWall)));
        g.add(lines(edgesOf([...b.real.walls, ...b.real.rest, ...b.real.faces.map((f) => ({ ring: f.ring, holes: [] }))]), COLORS.ownEdge, 0.7));
        g.add(lines(edgesOf(b.real.others), COLORS.edge));
      });
      const used = usedSurfaces(site);
      site.surfaces.forEach((s) => {
        const rank = used.indexOf(s);
        const owner = site.buildings.find((b) => b.id === s.owner);
        g.add(polygon(s.ring, s.holes ?? [], !s.wanted ? COLORS.off : s.kind === "ground" ? COLORS.ground : lit(COLORS.roof, s.azimuth), s.kind === "ground" ? 0.6 : 1));
        if (owner && !owner.real && owner.roof === "pitched") g.add(walls(s.ring, s.base)); // the gable above the block
        const count = placed && rank >= 0 ? placed[rank] ?? 0 : 0;
        if (count > 0) g.add(panels(s.panels.slice(0, count)));
        if (s.wanted && rank < 0) return; // nothing fits here
        const tag = document.createElement("div");
        tag.className = `pin${s.wanted ? "" : " off"}`;
        tag.textContent = s.wanted ? String(rank + 1) : "–";
        tag.dataset.z = String(s.ring.reduce((sum, p) => sum + p[2], 0) / s.ring.length);
        markers.current.push(new maplibregl.Marker({ element: tag }).setLngLat(toLngLat(site.origin, centre(s.ring.map((p) => [p[0], p[1]])))).addTo(m));
      });
    }
    liftPins.current();
    m.triggerRepaint();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current as HTMLDivElement, style: mapStyle(true), attributionControl: false, center: site?.origin ?? focus ?? [10.4, 51.1],
      zoom: site || focus ? 18.6 : 5, pitch: site || focus ? PITCH : 0, maxPitch: 60, bearing: -20, clickTolerance: 8, canvasContextAttributes: { antialias: true },
      // By default tiles are cut into smaller ones when zooming in, which cuts every building along a grid.
      zoomLevelsToOverscale: 16,
    });
    map.current = m;
    // Less fling after a drag, and zooming stays on the view's centre instead of chasing the pointer.
    m.dragPan.enable({ maxSpeed: 500, deceleration: 4000 });
    m.scrollZoom.enable({ around: "center" });
    if (wide() && !box.current?.closest(".offermap")) m.setPadding({ left: PANEL_W, top: 0, right: 0, bottom: 0 });
    // Lift the rank pins to the roof: a marker has no height of its own.
    const lift = () => {
      const px = (512 * 2 ** m.getZoom()) / (40075016 * Math.cos((m.getCenter().lat * Math.PI) / 180)) * Math.sin((m.getPitch() * Math.PI) / 180);
      markers.current.forEach((x) => x.setOffset([0, -Number(x.getElement().dataset.z) * px]));
    };
    liftPins.current = lift;
    m.on("move", lift);
    m.on("rotate", () => { if (needle.current) needle.current.style.rotate = `${-m.getBearing()}deg`; });
    if (live.current.locate) m.once("load", locateMe);
    let renderer: THREE.WebGLRenderer;
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    scene.add(group.current, edges.current);
    m.on("load", () => {
      const paint = (name: "fill-extrusion-color" | "fill-extrusion-opacity") => m.getPaintProperty(BLOCKS, name);
      m.setLayerZoomRange(BLOCKS, 14, HOMES_FROM_ZOOM);
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
          if (!origin.current) return;
          const c = maplibregl.MercatorCoordinate.fromLngLat(origin.current, 0), s = c.meterInMercatorCoordinateUnits();
          const local = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).scale(new THREE.Vector3(s, -s, s));
          camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(local);
          renderer.resetState();
          renderer.setViewport(0, 0, m.getCanvas().width, m.getCanvas().height);
          renderer.render(scene, camera);
        },
      });
      m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "draft-fill", type: "fill", source: "draft", paint: { "fill-color": "#7CF0C6", "fill-opacity": 0.22 } });
      m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#7CF0C6", "line-width": 2 } });
      m.addSource("aerial", { type: "raster", tiles: [AERIAL], tileSize: 512 });
      m.addLayer({ id: "aerial", type: "raster", source: "aerial", layout: { visibility: "none" } }, HOMES);

      refreshEdges.current = () => {
        edges.current.clear();
        if (m.getZoom() < HOMES_FROM_ZOOM) return;
        const c = m.getCenter();
        origin.current ??= [c.lng, c.lat];
        edges.current.add(outlines(homes.current, origin.current, [c.lng, c.lat], new Set(owned.current)));
        m.triggerRepaint();
      };
      // Tiles arrive one by one, so split what has arrived into single buildings, a moment after the last one.
      let timer = 0;
      const update = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (collect(m, homes.current)) (m.getSource(HOMES) as maplibregl.GeoJSONSource).setData(asData(homes.current));
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
      const { onBuilding: pick, onPoint: point, drawing: draws } = live.current;
      if (draws) { point?.([e.lngLat.lng, e.lngLat.lat]); return; }
      if (!pick) return;
      if (m.getZoom() < HOMES_FROM_ZOOM) { m.flyTo({ center: e.lngLat, zoom: 18.2, pitch: PITCH, duration: 1200 }); return; }
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
        if (!live.current.onBuilding || live.current.drawing) { hover([]); return; }
        const hit = under(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
        hover(hit ? resolve(homes.current, hit).ids : []);
      });
    });
    m.on("mouseout", () => hover([]));
    m.on("movestart", () => hover([]));
    return () => { ready.current = false; markers.current = []; m.remove(); map.current = null; };
  }, []);

  useEffect(redraw, [site, placed]);
  const frame = (duration: number) => {
    const m = map.current, first = site?.surfaces.filter((x) => x.kind !== "ground") ?? [];
    if (!m || !site || !first.length) return;
    const points = first.flatMap((x) => x.ring.map((p) => toLngLat(site.origin, [p[0], p[1]])));
    const area = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    m.fitBounds(area, { padding: 110, maxZoom: 19.5, pitch: PITCH, bearing: m.getBearing(), duration });
  };
  // Frame the home once it is known, so a large building is not cut off.
  const framed = useRef(false);
  useEffect(() => {
    if (!site) { framed.current = false; map.current?.setMinZoom(null); return; }
    if (framed.current || !map.current) return;
    framed.current = true;
    map.current.setMinZoom(HOMES_FROM_ZOOM);
    frame(900);
  }, [site]);
  useEffect(() => {
    const m = map.current;
    if (!focus || !m) return;
    m.flyTo({ center: focus, zoom: 18.6, pitch: PITCH, bearing: -20, duration: 1800 });
    // The building is only known once the map has arrived and its tiles are in.
    let tries = 0;
    const wait = setInterval(() => {
      if (++tries > 40) clearInterval(wait);
      if (m.isMoving() || !m.areTilesLoaded() || m.getZoom() < 17) return;
      collect(m, homes.current);
      const hit = homeAt(homes.current, focus);
      if (!hit && tries < 12) return;
      clearInterval(wait);
      if (hit && !live.current.site) live.current.onBuilding?.(resolve(homes.current, hit, focus));
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
  useEffect(() => {
    const src = map.current?.getSource("draft") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const line = draft ?? [];
    src.setData({ type: "FeatureCollection", features: line.length < 2 ? [] : [{ type: "Feature", properties: {}, geometry: line.length < 3 ? { type: "LineString", coordinates: line } : { type: "Polygon", coordinates: [[...line, line[0]]] } }] });
  }, [draft]);
  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = drawing ? "crosshair" : ""; }, [drawing]);

  return (
    <>
      <div ref={box} className="map3d" role="application" aria-label="3D map of the home" />
      {site && <Button variant="glass" size="lg" className="map-home" onClick={() => frame(700)}><HomeIcon />Back to my home</Button>}
      <div className="mapctl">
        {locate !== undefined && <IconButton variant="glass" size="lg" label="Go to my location" onClick={locateMe}><Locate /></IconButton>}
        <div className="mapstack">
          <IconButton variant="plain" size="lg" label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus /></IconButton>
          <IconButton variant="plain" size="lg" label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus /></IconButton>
          <IconButton variant="plain" size="lg" label="Face north" onClick={() => map.current?.easeTo({ bearing: 0, pitch: PITCH })}><span ref={needle} className="needle"><Needle /></span></IconButton>
        </div>
        <IconButton variant="glass" size="lg" label="Map credits" aria-pressed={credits} onClick={() => setCredits(!credits)}><Info /></IconButton>
      </div>
      {credits && <p className="credits"><a href="https://maplibre.org" target="_blank" rel="noreferrer">MapLibre</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">© OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · Sun: PVGIS · Roofs and aerial photo in Bavaria: Bayerische Vermessungsverwaltung</p>}
    </>
  );
}
