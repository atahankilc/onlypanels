import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Site, usedSurfaces } from "./api";
import { Home } from "./icons";
import { P2, P3, centre, inside, toLngLat, toLocal } from "./geometry";
import { mapStyle } from "./mapStyle";

const BLOCKS = "buildings-3d";
const PANEL_W = 424; // room the left panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const ADDRESS_REACH_M = 25; // an address point can sit on the pavement, in front of the house
const HIT_SLOP_PX = 6;
const AERIAL = "https://geoservices.bayern.de/od/wms/dop/v1/dop40?service=WMS&version=1.3.0&request=GetMap&layers=by_dop40c&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/jpeg";
const COLORS = { roof: "#3A6FA8", off: "#33363F", wall: "#1F3A5C", ground: "#2F6B4F", panel: "#0A1222" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, azimuth: number) => new THREE.Color(hex).multiplyScalar(0.8 + 0.3 * Math.cos(((azimuth - 180) * Math.PI) / 180)).getHex();

const wide = () => matchMedia("(min-width: 821px)").matches;
export type Picked = { ring: P2[]; height: number; at: P2; neighbours: { at: P2; height: number }[] };
type Props = {
  site: Site | null; placed: number[] | null; focus?: P2 | null; aerial?: boolean; draft?: P2[];
  onBuilding?: (b: Picked) => void; onPoint?: (p: P2) => void; drawing?: boolean; locate?: boolean;
};
type Geometry = { type: string; coordinates: unknown };
const ringsOf = (g: Geometry) => (g.type === "Polygon" ? [(g.coordinates as P2[][])[0]] : g.type === "MultiPolygon" ? (g.coordinates as P2[][][]).map((p) => p[0]) : []);
const outer = (g: Geometry) => (ringsOf(g).sort((a, b) => b.length - a.length)[0] ?? []).slice(0, -1);
/** The building an address belongs to: the one around the point, else the nearest close by. */
function buildingAt(m: maplibregl.Map, at: P2) {
  let best: { ring: P2[]; height: number; id: unknown } | null = null, reach = ADDRESS_REACH_M;
  for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    if (f.properties.hide_3d) continue;
    for (const ring of ringsOf(f.geometry as Geometry)) {
      const local = ring.map((p) => toLocal(at, p));
      const d = inside([0, 0], local) ? 0 : Math.min(...local.map((p) => Math.hypot(p[0], p[1])));
      if (d < reach || (d === 0 && reach === 0 && ring.length - 1 > (best?.ring.length ?? 0))) {
        reach = d;
        best = { ring: ring.slice(0, -1), height: Number(f.properties.render_height ?? 6), id: f.id };
      }
    }
  }
  return best;
}

function mesh(points: P3[], faces: number[], color: THREE.ColorRepresentation, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
}

function polygon(ring: P3[], color: THREE.ColorRepresentation, opacity = 1) {
  const contour = ring.map((p) => new THREE.Vector2(p[0], p[1]));
  return mesh(ring, THREE.ShapeUtils.triangulateShape(contour, []).flat(), color, opacity);
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

export default function HomeMap({ site, placed, focus, aerial, draft, onBuilding, onPoint, drawing, locate }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const group = useRef(new THREE.Group());
  const origin = useRef<P2 | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const ready = useRef(false);
  const blocks = useRef<unknown>(null);
  const pickAddress = useRef<(at: P2) => void>(() => {});
  const liftPins = useRef(() => {});
  const live = useRef({ onBuilding, onPoint, drawing, locate, site });
  live.current = { onBuilding, onPoint, drawing, locate, site };

  const redraw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const g = group.current;
    g.clear();
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    origin.current = site?.origin ?? null;
    if (site) {
      const used = usedSurfaces(site);
      site.surfaces.forEach((s) => {
        const rank = used.indexOf(s);
        g.add(polygon(s.ring, !s.wanted ? COLORS.off : s.kind === "ground" ? COLORS.ground : lit(COLORS.roof, s.azimuth), s.kind === "ground" ? 0.6 : 1));
        if (s.kind !== "ground") g.add(walls(s.ring, 0));
        const count = placed && rank >= 0 ? placed[rank] ?? 0 : 0;
        if (count > 0) g.add(panels(s.panels.slice(0, count)));
        const tag = document.createElement("div");
        tag.className = `pin${s.wanted ? "" : " off"}`;
        tag.textContent = s.wanted ? String(rank + 1) : "–";
        const mid = centre(s.ring.map((p) => [p[0], p[1]]));
        tag.dataset.z = String(s.ring.reduce((sum, p) => sum + p[2], 0) / s.ring.length);
        markers.current.push(new maplibregl.Marker({ element: tag }).setLngLat(toLngLat(site.origin, mid)).addTo(m));
      });
    }
    liftPins.current();
    m.triggerRepaint();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current as HTMLDivElement, style: mapStyle(true), attributionControl: { compact: true }, center: site?.origin ?? focus ?? [10.4, 51.1],
      zoom: site || focus ? 18.6 : 5, pitch: site || focus ? PITCH : 0, maxPitch: 60, bearing: -20, clickTolerance: 8, canvasContextAttributes: { antialias: true },
    });
    map.current = m;
    // Less fling after a drag, and zooming stays on the view's centre instead of chasing the pointer.
    m.dragPan.enable({ maxSpeed: 500, deceleration: 4000 });
    m.scrollZoom.enable({ around: "center" });
    if (wide() && !box.current?.closest(".offermap")) m.setPadding({ left: PANEL_W, top: 0, right: 0, bottom: 0 });
    m.once("idle", () => box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    // Lift the rank pins to the roof: a marker has no height of its own.
    const lift = () => {
      const px = (512 * 2 ** m.getZoom()) / (40075016 * Math.cos((m.getCenter().lat * Math.PI) / 180)) * Math.sin((m.getPitch() * Math.PI) / 180);
      markers.current.forEach((x) => x.setOffset([0, -Number(x.getElement().dataset.z) * px]));
    };
    liftPins.current = lift;
    m.on("move", lift);
    if (live.current.locate) {
      const here = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 18, pitch: PITCH } as maplibregl.FitBoundsOptions });
      m.addControl(here, "bottom-right");
      m.once("load", () => here.trigger());
    }
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    let renderer: THREE.WebGLRenderer;
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    scene.add(group.current);
    m.on("load", () => {
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
      m.addSource("hover", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "hover", type: "fill-extrusion", source: "hover", paint: { "fill-extrusion-color": "#4B85FF", "fill-extrusion-opacity": 0.55, "fill-extrusion-height": ["get", "height"] } });
      m.addLayer({ id: "draft-fill", type: "fill", source: "draft", paint: { "fill-color": "#7CF0C6", "fill-opacity": 0.22 } });
      m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#7CF0C6", "line-width": 2 } });
      m.addSource("aerial", { type: "raster", tiles: [AERIAL], tileSize: 512, attribution: "Aerial photo: Bayerische Vermessungsverwaltung, CC BY 4.0" });
      m.addLayer({ id: "aerial", type: "raster", source: "aerial", layout: { visibility: "none" } }, BLOCKS);
      ready.current = true;
      redraw();
    });
    const neighbours = (id: unknown) => m.queryRenderedFeatures({ layers: [BLOCKS] }).filter((f) => f.id !== id && f.geometry.type === "Polygon").map((f) => ({
      at: centre((f.geometry as { coordinates: P2[][] }).coordinates[0]), height: Number(f.properties.render_height ?? 6),
    }));
    const under = (p: maplibregl.Point) => {
      if (!m.getLayer(BLOCKS)) return undefined;
      return m.queryRenderedFeatures(p, { layers: [BLOCKS] })[0] ?? m.queryRenderedFeatures([[p.x - HIT_SLOP_PX, p.y - HIT_SLOP_PX], [p.x + HIT_SLOP_PX, p.y + HIT_SLOP_PX]], { layers: [BLOCKS] })[0];
    };
    pickAddress.current = (at) => {
      const b = buildingAt(m, at);
      if (b) live.current.onBuilding?.({ ring: b.ring, height: b.height, at, neighbours: neighbours(b.id) });
    };
    m.on("click", (e) => {
      const { onBuilding: pick, onPoint: point, drawing: draws } = live.current;
      if (draws) { point?.([e.lngLat.lng, e.lngLat.lat]); return; }
      if (!pick) return;
      const hit = under(e.point);
      if (!hit) return;
      const ring = outer(hit.geometry as Geometry);
      if (ring.length < 3) return;
      pick({ ring, height: Number(hit.properties.render_height ?? 6), at: [e.lngLat.lng, e.lngLat.lat], neighbours: neighbours(hit.id) });
    });
    // Show what a click would pick.
    let frame = 0;
    const hover = (data: unknown) => (m.getSource("hover") as maplibregl.GeoJSONSource | undefined)?.setData(data as Parameters<maplibregl.GeoJSONSource["setData"]>[0]);
    const none = { type: "FeatureCollection", features: [] };
    m.on("mousemove", (e) => {
      if (!live.current.onBuilding || live.current.drawing || frame || m.isMoving()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const hit = under(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
        hover(hit ? { type: "Feature", properties: { height: Number(hit.properties.render_height ?? 6) + 0.2 }, geometry: hit.geometry } : none);
      });
    });
    m.on("mouseout", () => hover(none));
    m.on("movestart", () => hover(none));
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
    map.current.setMinZoom(15); // close enough that the home cannot get lost
    frame(900);
  }, [site]);
  useEffect(() => {
    const m = map.current;
    if (!focus || !m) return;
    m.flyTo({ center: focus, zoom: 18.6, pitch: PITCH, bearing: -20, duration: 1800 });
    // The building is only in the tiles once the map has arrived and settled, and map events do not say so reliably.
    let tries = 0;
    const wait = setInterval(() => {
      if (++tries > 40) clearInterval(wait);
      if (m.isMoving() || !m.areTilesLoaded() || m.getZoom() < 17) return;
      clearInterval(wait);
      if (!live.current.site) pickAddress.current(focus);
    }, 250);
    return () => clearInterval(wait);
  }, [focus]);
  useEffect(() => {
    if (!ready.current) return;
    map.current?.setLayoutProperty("aerial", "visibility", aerial ? "visible" : "none");
    // See-through, not hidden: buildings must stay clickable over the photo.
    const m = map.current;
    if (m) { blocks.current ??= m.getPaintProperty(BLOCKS, "fill-extrusion-opacity"); m.setPaintProperty(BLOCKS, "fill-extrusion-opacity", aerial ? 0 : (blocks.current as number)); }
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
      {site && <button type="button" className="mapbtn home" onClick={() => frame(700)}><Home />Back to my home</button>}
    </>
  );
}
