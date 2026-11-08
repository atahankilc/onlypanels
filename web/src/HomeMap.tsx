import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as THREE from "three";
import { Poly, Selected, SunSurface, View, homesIn, polyOf, surfaceKey, Square, homesUrl, squareEdges, squaresIn } from "./api";
import { fit } from "./panels";
import { TILT_PER_PX, TURN_PER_PX, leash } from "./camera";
import { P2, P3, centre, inside, normal, toLngLat, toLocal } from "./geometry";
import { Info, Locate, Minus, Needle, Plus } from "./icons";
import { BUILDINGS_3D_FILTER, mapStyle } from "./mapStyle";
import SunLight from "./SunLight";
import { MUNICH, REGION_EDGE, REGION_OUTSIDE, VIEW_LIMIT, inRegion } from "./region";
import { Button, IconButton } from "./ui";
import type { Detail } from "./solids.worker";
import { GROUND_TILES, TILE_PX, WORLD_M, mosaic, tile, tileAt } from "./photoTiles";

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
// The roofs take their photo from the same tiles as the ground, so what the map already shows is on the roofs at once.
// The roofs' photo on the picking step, in three rings around the view's centre: sharp in the middle, a level finer than the ground;
// coarser further out, the widest reaching past every square drawn. A roof takes the sharpest ring that covers it.
const ROOF_LEVELS = [{ dz: 1, tiles: 5 }, { dz: -1, tiles: 6 }, { dz: -3, tiles: 6 }];
const ROOF_TILE_ZOOM = { min: 12, max: 19 }; // 19 is about 10 cm a pixel here, finer than the photo itself
const NEIGHBOUR_TILE_ZOOM = 19, NEIGHBOUR_TILES_MAX = 6; // across, for the roofs on the chosen home's step
const MAX_DETAIL_LOADS = 2; // real roofs come after the blocks, a square or two at a time, nearest first
export const SUN_LOW = 500, SUN_HIGH = 1400; // kWh per m² a year
const PANEL_W = 424; // room the panel takes on a wide screen
const PITCH = 50; // steeper tilts make a drag near the horizon cover hundreds of metres
const MAX_PITCH = 60;
const REVIEW_PITCH = 75; // around one site there is no horizon to drag, and walls need seeing
const PAN = { maxSpeed: 500, deceleration: 4000 }; // less fling after a drag
const SITE = "site-fade"; // around the chosen buildings the map fades into plain ground
const SITE_FROM_M = 45, SITE_RING_M = 10, SITE_RINGS = [0.2, 0.25, 0.3, 0.4, 0.6, 1];
const FADE_MS = 900; // from the map's blocks to the measured buildings, and back
const COLORS = { roof: "#3A6FA8", edge: "#8A95A8", hover: "#2F5E94", pendingDim: "#2A2C34", pendingBright: "#6F93BF", face: "#FF9F0A", otherRoof: "#3A3D47", otherWall: "#23252C", limit: "#FFD60A", land: "#0F1013" };
// One light from the south, so the sides of a roof read apart.
const lit = (hex: string, n: P3) => new THREE.Color(hex).multiplyScalar(0.95 - 0.35 * n[1]).getHex();
// Walls have no up, so their normal has no reliable sign: east and west sides just sit a step darker, so corners read in daylight.
const litWall = (hex: string, n: P3) => new THREE.Color(hex).multiplyScalar(1 - 0.24 * Math.abs(n[0])).getHex();
/** Real roofs: inside the photo's box a roof shows the aerial photo, a marked one tinted by its mark. Walls, and roofs outside it, keep their colour. */
function roofMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true, side: THREE.DoubleSide,
    uniforms: {
      photo0: { value: null }, fit0: { value: new THREE.Vector4() }, has0: { value: 0 },
      photo1: { value: null }, fit1: { value: new THREE.Vector4() }, has1: { value: 0 },
      photo2: { value: null }, fit2: { value: new THREE.Vector4() }, has2: { value: 0 },
      opacity: { value: 1 },
    },
    vertexShader: `attribute float roof; attribute float mark; varying vec3 vColor; varying float vRoof; varying float vMark; varying vec2 vXY;
      void main() { vColor = color; vRoof = roof; vMark = mark; vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D photo0; uniform vec4 fit0; uniform float has0;
      uniform sampler2D photo1; uniform vec4 fit1; uniform float has1;
      uniform sampler2D photo2; uniform vec4 fit2; uniform float has2;
      uniform float opacity;
      varying vec3 vColor; varying float vRoof; varying float vMark; varying vec2 vXY;
      // A tile still on its way is see-through, so the next ring, or the roof's colour, shows meanwhile.
      vec4 look(sampler2D photo, vec4 fit, float has) {
        vec2 uv = vec2(vXY.x * fit.x + fit.y, vXY.y * fit.z + fit.w);
        if (has < 0.5 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
        return texture2D(photo, uv);
      }
      void main() {
        vec3 c = vColor;
        if (vRoof > 0.5) {
          vec4 t = look(photo0, fit0, has0);
          if (t.a < 0.5) t = look(photo1, fit1, has1);
          if (t.a < 0.5) t = look(photo2, fit2, has2);
          if (t.a > 0.5) c = mix(t.rgb, vColor, vMark * 0.55);
        }
        gl_FragColor = vec4(c, opacity);
        #include <colorspace_fragment>
      }`,
  });
}
const mercator = (lon: number, lat: number): P2 => [(180 + lon) / 360, (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360];
/** Turns a square's local metres into the photo's 0..1, as x * a + b and y * c + d. The photo's box is in EPSG:3857 metres. */
function photoFit(at: P2, box: number[]) {
  const [ox, oy] = mercator(at[0], at[1]), unit = 1 / (2 * Math.PI * 6371008.8 * Math.cos((at[1] * Math.PI) / 180)), C = WORLD_M;
  const w = box[2] - box[0], h = box[3] - box[1];
  return new THREE.Vector4((unit * C) / w, (ox * C - C / 2 - box[0]) / w, (unit * C) / h, ((0.5 - oy) * C - box[1]) / h);
}
const wide = () => matchMedia("(min-width: 821px)").matches;

export type Picked = { id: string; home: string; square: string; at: P2 };
export type Step = "pick" | "review";
export type Face = { building: string; poly: number };
export const letter = (i: number) => String.fromCharCode(65 + i);
type Props = {
  buildings: Selected[]; step: Step; focus: P2 | null; onPick?: (b: Picked) => void;
  open: string | null; near: string | null; face: Face | null; look: { id: string } | null;
  onFace: (f: Face | null) => void; onOpen: (id: string) => void;
  view: View; chosen: string[]; onToggle: (key: string) => void; editing: boolean; installed: string[];
  panels?: Record<string, number>; panelW?: number; turn?: number; onReady?: () => void; // the planner's desk
  // editsOn: the cells the tool changes now (priority or existing panels), to tell adding from taking out.
  // The homeowner's drawing: the cells marked on each surface, the tool in hand, and each stroke's cells. Without them a click toggles a whole surface.
  marked?: Record<string, number[]>; taken?: Record<string, number[]>; editsOn?: Record<string, number[]>; tool?: Tool; onPaint?: (cells: Record<string, number[]>, on: boolean, start: boolean) => void;
};
export type Tool = "surface" | "draw";
const SNAP_PX = 10; // a click this close to a point, corner or edge lands on it

// The map's own colours for what is drawn on it. Everything else comes from the base style.
const TONE = { ground: "#0F1013", ghost: "#3A3D47", block: "#2A2C34", edge: "#8A95A8", hover: "#2F5E94", land: "#0F1013", wall: "#1F3A5C", roof: COLORS.roof, line: "#BFD8F5" };
const blockColour = (): maplibregl.ExpressionSpecification => { const t = TONE; return ["case", ["boolean", ["feature-state", "near"], false], COLORS.face, ["boolean", ["feature-state", "picked"], false], COLORS.roof, ["boolean", ["feature-state", "hover"], false], t.hover, t.block]; };

const HEAT = ["#2C6BED", "#18C3C9", "#FFE14A", "#FF8A1F", "#E5261F"].map((c) => new THREE.Color(c));
const heat = (t: number) => {
  const x = Math.min(0.999, Math.max(0, t)) * (HEAT.length - 1), i = Math.floor(x);
  return HEAT[i].clone().lerp(HEAT[i + 1], x - i);
};
const seenBits = (s: SunSurface, suns: number) => { const raw = atob(s.seen), width = Math.ceil(suns / 8); return (row: number, sun: number) => (raw.charCodeAt(row * width + (sun >> 3)) >> (7 - (sun & 7))) & 1; };

const MOVE_MS = 900; // the map rising into its window: --move in styles.css
const FLY_MAX_MS = 2800, FLY_PER_ZOOM_MS = 260, FLY_PER_KM_MS = 120; // a longer flight when the chosen buildings are far or small on screen
// Same curve as --glide, so camera, window and fade are one movement.
const glide = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
// The roof's overlays: what is not chosen lies under a shade and a diagonal hatch, so roofs and walls read the same way;
// panels already there keep their photo under amber; planned modules look like modules.
// The hatch lies on the surface itself, in metres: every hatched part carries the same lines, and they stay put as the
// view turns. Edges are smoothed per pixel, so the lines stay sharp instead of blurring into grey; only when they get
// too fine to draw do they fade into an even shade.
const HATCH_M = 0.6; // metres between hatch lines
const HATCH_INK = 0.32; // share of each period that is line
const hatchLook = (veil: string, veilA: number, ink: string, inkA: number) => ({ veil: new THREE.Vector4(...new THREE.Color(veil).toArray(), veilA), ink: new THREE.Vector4(...new THREE.Color(ink).toArray(), inkA) });
const OVERLAY = { hatch: hatchLook("#0E0F13", 0.55, "#FFFFFF", 0.7), has: "#FFB547" };
/** The hatch material: uv carries metres on the surface; uv1 the cell mask, as for every overlay. */
function hatchMaterial() {
  const uniforms = { uVeil: { value: OVERLAY.hatch.veil.clone() }, uInk: { value: OVERLAY.hatch.ink.clone() } };
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  material.userData.hatch = uniforms;
  material.customProgramCacheKey = () => "hatch";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vHatch;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHatch = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vHatch;
uniform vec4 uVeil;
uniform vec4 uInk;`)
      .replace("#include <map_fragment>", `{
  float d = (vHatch.x + vHatch.y) / (${HATCH_M.toFixed(2)} * 1.41421356);
  float t = abs(fract(d) - 0.5);
  float aa = fwidth(d);
  float ink = smoothstep(0.5 - ${HATCH_INK.toFixed(2)} * 0.5 - aa, 0.5 - ${HATCH_INK.toFixed(2)} * 0.5 + aa, t);
  ink = mix(ink, ${HATCH_INK.toFixed(2)}, smoothstep(0.25, 0.5, aa));
  vec4 c = mix(uVeil, uInk, ink);
  diffuseColor = vec4(c.rgb, c.a * diffuseColor.a);
}`);
  };
  return material;
}
const HAS_TINT = 0.28; // how much amber lies over panels already there
// Planned modules: dark cells under a thin frame, with a little sheen. Portrait: u across, v along.
const moduleLook = (() => {
  const c = document.createElement("canvas"), w = 128, h = 200;
  c.width = w; c.height = h;
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#21407C"); g.addColorStop(1, "#0A1430");
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(120, 160, 230, 0.32)"; x.lineWidth = 1.5;
  for (let i = 1; i < 10; i++) { x.beginPath(); x.moveTo(4, (h / 10) * i); x.lineTo(w - 4, (h / 10) * i); x.stroke(); }
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo((w / 6) * i, 4); x.lineTo((w / 6) * i, h - 4); x.stroke(); }
  const s = x.createLinearGradient(0, 0, w * 0.9, h * 0.5); s.addColorStop(0, "rgba(255,255,255,0.2)"); s.addColorStop(0.45, "rgba(255,255,255,0)");
  x.fillStyle = s; x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(205, 220, 242, 0.85)"; x.lineWidth = 5; x.strokeRect(2.5, 2.5, w - 5, h - 5);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const SKIN_REACH = 3; // cells the colour runs past the samples, to the surface's true edge

/** A coat of colour over one surface: its exact outline, with the samples as a small image stretched smoothly across it. */
function skinOf(s: SunSurface, poly: Poly, step: number) {
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
  // A copy of the surface lifted along its normal, carrying the cell image on uv1 for the per-cell masks.
  const lifted = (by: number, material: THREE.MeshBasicMaterial) => {
    const m = polygon(poly.ring, poly.holes, "#FFFFFF"), at = m.geometry.getAttribute("position") as THREE.BufferAttribute;
    outline.forEach((_, i) => at.setXYZ(i, at.getX(i) + s.n[0] * by, at.getY(i) + s.n[1] * by, at.getZ(i) + s.n[2] * by));
    m.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv, 2));
    (m.material as THREE.Material).dispose(); m.material = material;
    return m;
  };
  const cellMask = () => { const px = new Uint8Array(w * h * 4), t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.channel = 1; return [px, t] as const; };
  // What is not chosen goes grey, only on the cells that are not marked: the mask follows the cells.
  const [holes, mask] = cellMask();
  const hatched = hatchMaterial();
  hatched.userData.alpha = true;
  const cover = lifted(0.16, hatched);
  cover.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(outline.flatMap((p) => [p[0] * step, p[1] * step])), 2));
  // Panels already there: their photo under a faint amber, on the cells that carry them.
  const [fitted, fit] = cellMask();
  const amber = new THREE.MeshBasicMaterial({ color: OVERLAY.has, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  amber.userData.alpha = true; amber.userData.opacity = HAS_TINT;
  const plate = lifted(0.2, amber);
  plate.visible = false;
  // Each cell's middle in the model, for drawing: the outline maps the cell grid onto the surface's plane.
  const corners = [poly.ring, ...poly.holes].flat(), q0 = outline[0];
  const far = outline.reduce((k, p, i) => (Math.hypot(p[0] - q0[0], p[1] - q0[1]) > Math.hypot(outline[k][0] - q0[0], outline[k][1] - q0[1]) ? i : k), 0);
  const span = (i: number) => Math.abs((outline[far][0] - q0[0]) * (outline[i][1] - q0[1]) - (outline[far][1] - q0[1]) * (outline[i][0] - q0[0]));
  const side = outline.reduce((k, _, i) => (span(i) > span(k) ? i : k), 0);
  const [P0, P1, P2] = [corners[0], corners[far], corners[side]], [a1, b1, a2, b2] = [outline[far][0] - q0[0], outline[far][1] - q0[1], outline[side][0] - q0[0], outline[side][1] - q0[1]];
  const det = a1 * b2 - a2 * b1 || 1, centres = new Float32Array(s.year.length * 3);
  s.year.forEach((_, n) => {
    const x = s.cells[n * 2] - q0[0], y = s.cells[n * 2 + 1] - q0[1], al = (x * b2 - y * a2) / det, be = (a1 * y - b1 * x) / det;
    for (let k = 0; k < 3; k++) centres[n * 3 + k] = P0[k] + al * (P1[k] - P0[k]) + be * (P2[k] - P0[k]) + s.n[k] * 0.16;
  });
  return { s, skin, cover, plate, pixels, source, texture, holes, mask, fitted, fit, centres, plane: [P0, P1, P2] as P3[] };
}

// Roads and rails bound a street block. Service roads, paths and tracks run inside blocks, so they do not.
const BLOCK_ROADS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "busway", "rail", "transit"]);
const ROADS_WITHIN_M = 250;
const GHOST_ALPHA = 0.92; // the plain blocks around the site, before the fade rings cover them

/** The map's roads and rails near a point, as segments in metres around it. Empty while the map has no tiles there. */
function roadsNear(m: maplibregl.Map, o: P2) {
  const out: [P2, P2][] = [];
  for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
    if (!BLOCK_ROADS.has(f.properties.class) || f.properties.brunnel === "tunnel") continue;
    const g = f.geometry, lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = toLocal(o, line[i - 1] as P2), c = toLocal(o, line[i] as P2);
      if (Math.min(Math.abs(a[0]), Math.abs(c[0])) < ROADS_WITHIN_M && Math.min(Math.abs(a[1]), Math.abs(c[1])) < ROADS_WITHIN_M) out.push([a, c]);
    }
  }
  return out;
}

const side = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a: P2, b: P2, c: P2, d: P2) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;

/** The point on a segment closest to p. */
function closest(p: P2, a: P2, b: P2): P2 {
  const d: P2 = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1)));
  return [a[0] + t * d[0], a[1] + t * d[1]];
}

/** The neighbours on the same street block as the chosen buildings: no road or rail between their closest points.
 *  Without roads on the map only the ones sharing a wall count, as before. */
function blockOf(list: Selected[], roads: [P2, P2][], o: P2) {
  const block = new Set<string>(), chosen = new Set(list.map((b) => b.id));
  const edges = list.flatMap((b) => (b.real?.roofs ?? []).flatMap((r) => r.ring.map((p, i) => [toLocal(o, toLngLat(b.origin, [p[0], p[1]])), toLocal(o, toLngLat(b.origin, [r.ring[(i + 1) % r.ring.length][0], r.ring[(i + 1) % r.ring.length][1]]))] as [P2, P2])));
  for (const b of list) for (const near of b.sun?.around ?? []) {
    if (chosen.has(near.id) || block.has(near.id) || !near.solid) continue;
    if (near.touch) { block.add(near.id); continue; }
    if (!roads.length || !edges.length) continue;
    let best = { d: Infinity, from: [0, 0] as P2, to: [0, 0] as P2 };
    for (const q of near.ring) {
      const at = toLocal(o, [q[0], q[1]]);
      for (const [a, c] of edges) { const p = closest(at, a, c), d = Math.hypot(at[0] - p[0], at[1] - p[1]); if (d < best.d) best = { d, from: p, to: at }; }
    }
    if (!roads.some(([a, c]) => crosses(best.from, best.to, a, c))) block.add(near.id);
  }
  return block;
}

/** The box the site's fade rings are drawn around: the chosen buildings and their street block, as a centre and half sizes in metres. */
type SiteBox = { o: P2; w: number; h: number };
function siteBox(list: Selected[], extra: P2[] = []): SiteBox {
  const corners = [...list.flatMap((b) => [b.origin, ...(b.real?.roofs ?? []).flatMap((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]])))]), ...extra];
  const o: P2 = [(Math.min(...corners.map((p) => p[0])) + Math.max(...corners.map((p) => p[0]))) / 2, (Math.min(...corners.map((p) => p[1])) + Math.max(...corners.map((p) => p[1]))) / 2];
  const local = corners.map((p) => toLocal(o, p));
  return { o, w: Math.max(...local.map((p) => Math.abs(p[0]))), h: Math.max(...local.map((p) => Math.abs(p[1]))) };
}
/** How much the fade rings cover a point, 0 to 1: the rings lie on top of each other, each covering what is beyond its edge. */
function coverAt(box: SiteBox, at: P2) {
  const p = toLocal(box.o, at), r = Math.hypot(Math.max(0, Math.abs(p[0]) - box.w), Math.max(0, Math.abs(p[1]) - box.h));
  return 1 - SITE_RINGS.reduce((open, o, i) => (r >= SITE_FROM_M + i * SITE_RING_M ? open * (1 - o) : open), 1);
}

/** The buildings around one that are not drawn as measured, as plain blocks out to the site's edge, so the home stands in its
 *  street and not alone. Each fades exactly as the rings over the ground do, so nothing stands in the dark beyond them. */
function ghostsOf(b: Selected, skip: Set<string>, box: SiteBox) {
  const points: P3[] = [], alpha: number[] = [], faces: number[] = [];
  const add = (p: P3, a: number) => { points.push(p); alpha.push(1, 1, 1, a); return points.length - 1; };
  for (const near of b.sun?.around ?? []) {
    if (skip.has(near.id)) continue;
    const ring = near.ring.map((p) => toLocal(b.origin, [p[0], p[1]]));
    const fade = near.ring.map((p) => GHOST_ALPHA * (1 - coverAt(box, [p[0], p[1]])));
    if (!fade.some((a) => a > 0)) continue;
    ring.forEach((p, i) => {
      const j = (i + 1) % ring.length, q = ring[j];
      const k = [add([p[0], p[1], 0], fade[i]), add([q[0], q[1], 0], fade[j]), add([q[0], q[1], near.h], fade[j]), add([p[0], p[1], near.h], fade[i])];
      faces.push(k[0], k[1], k[2], k[0], k[2], k[3]);
    });
    const top = ring.map((p, i) => add([p[0], p[1], near.h], fade[i]));
    for (const t of THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), [])) faces.push(top[t[0]], top[t[1]], top[t[2]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(alpha, 4));
  g.setIndex(faces);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  material.userData.alpha = true;
  return new THREE.Mesh(g, material);
}

/** The buildings on the same street block, as they are measured, in plain tones: a flat block beside a real roof looks wrong. */
function neighboursOf(b: Selected, skip: Set<string>, block: Set<string>) {
  const g = new THREE.Group();
  g.name = "neighbours";
  for (const near of b.sun?.around ?? []) {
    if (skip.has(near.id) || !block.has(near.id) || !near.solid) continue;
    skip.add(near.id); // once, even when it is near two of the chosen buildings
    const here = (r: P3[]) => r.map((p) => [...toLocal(b.origin, [p[0], p[1]]), p[2]] as P3);
    const polys = (list: Poly[]) => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
    const roofs = polys(near.solid.roofs), walls = polys(near.solid.walls);
    walls.forEach((p) => { const m = polygon(p.ring, p.holes, "#FFFFFF"); m.userData = { part: "wall", n: normal(p.ring) }; g.add(m); });
    roofs.forEach((p) => { const m = polygon(p.ring, p.holes, "#FFFFFF"); m.userData = { part: "roof", n: normal(p.ring) }; g.add(m); });
    const line = lines(edgesOf([...walls, ...roofs]), COLORS.edge, 0.3);
    line.name = "outline";
    (line.material as THREE.Material).userData.opacity = 0.3;
    g.add(line);
  }
  return g;
}

/** The outline points of the block's buildings, lon and lat, once each. */
const blockPoints = (list: Selected[], block: Set<string>) => {
  const seen = new Set<string>(), out: P2[] = [];
  for (const b of list) for (const near of b.sun?.around ?? []) if (block.has(near.id) && !seen.has(near.id)) { seen.add(near.id); near.ring.forEach((p) => out.push([p[0], p[1]])); }
  return out;
};

/** Rings of growing opacity around the buildings: what is further out is covered. */
function fadeAround(list: Selected[], extra: P2[] = []) {
  const { o, w, h } = siteBox(list, extra);
  const hole = (r: number): P2[] => Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI, x = Math.cos(a), y = Math.sin(a);
    return toLngLat(o, [Math.sign(x) * w + x * r, Math.sign(y) * h + y * r]); // a rounded box
  });
  const world: P2[] = [[9, 46], [14, 46], [14, 50], [9, 50], [9, 46]];
  return { type: "FeatureCollection" as const, features: SITE_RINGS.map((opacity, i) => ({ type: "Feature" as const, properties: { o: opacity }, geometry: { type: "Polygon" as const, coordinates: [world, hole(SITE_FROM_M + i * SITE_RING_M).reverse()] } })) };
}

/** The ground's tiles under a box around an origin, in its metres: as fine as the photo, coarser only when the box is large. */
function tilesUnder(origin: P2, x0: number, x1: number, y0: number, y1: number) {
  const merc = (p: P2): P2 => [(p[0] * 20037508.34) / 180, Math.log(Math.tan(((90 + p[1]) * Math.PI) / 360)) * 6378137];
  const [a, c] = [merc(toLngLat(origin, [x0, y0])), merc(toLngLat(origin, [x1, y1]))];
  let z = NEIGHBOUR_TILE_ZOOM, sw = tileAt(z, a[0], a[1]), ne = tileAt(z, c[0], c[1]);
  while (z > ROOF_TILE_ZOOM.min && Math.max(ne[0] - sw[0], sw[1] - ne[1]) + 1 > NEIGHBOUR_TILES_MAX) { z--; sw = tileAt(z, a[0], a[1]); ne = tileAt(z, c[0], c[1]); }
  return { z, x: sw[0], y: ne[1], nx: ne[0] - sw[0] + 1, ny: sw[1] - ne[1] + 1, a, c };
}
const boundsOf = (points: { x: number; y: number }[]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
};
/** Asks for the tiles a chosen building's roofs will need, while the user is still picking. */
function warmRoof(b: Selected) {
  const box = boundsOf((b.real?.roofs ?? []).flatMap((r) => r.ring.map((p) => ({ x: p[0], y: p[1] }))));
  if (!box) return;
  const t = tilesUnder(b.origin, box.x0, box.x1, box.y0, box.y1);
  for (let i = 0; i < t.nx; i++) for (let j = 0; j < t.ny; j++) tile(t.z, t.x + i, t.y + j).catch(() => undefined);
}

/** The aerial photo of the ground under a building, as a texture lying on its roofs. */
function roofPhoto(b: Selected, roofs: THREE.Mesh[], redraw: () => void) {
  drapePhoto(b.origin, roofs, () => { roofs.forEach((r) => { r.userData.color = 0xffffff; }); redraw(); });
}

/** The aerial photo laid on roofs drawn around an origin, from the ground's tiles: the chosen home's and its neighbours'. */
function drapePhoto(origin: P2, roofs: THREE.Mesh[], redraw: () => void) {
  const points: { x: number; y: number }[] = [];
  for (const roof of roofs) { const at = roof.geometry.getAttribute("position"); for (let i = 0; i < at.count; i++) points.push({ x: at.getX(i), y: at.getY(i) }); }
  const bounds = boundsOf(points);
  if (!bounds) return;
  const { x0, x1, y0, y1 } = bounds, t = tilesUnder(origin, x0, x1, y0, y1), { a, c } = t;
  const photo = mosaic(t.z, t.x, t.y, t.nx, t.ny, () => undefined, () => true), box = photo.box;
  photo.done.then(() => {
    const texture = new THREE.CanvasTexture(photo.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16; // roofs are seen at an angle
    for (const roof of roofs) {
      const at = roof.geometry.getAttribute("position"), uv = new Float32Array(at.count * 2);
      for (let i = 0; i < at.count; i++) {
        const X = a[0] + ((at.getX(i) - x0) / (x1 - x0 || 1)) * (c[0] - a[0]), Y = a[1] + ((at.getY(i) - y0) / (y1 - y0 || 1)) * (c[1] - a[1]);
        uv[i * 2] = (X - box[0]) / (box[2] - box[0]); uv[i * 2 + 1] = (Y - box[1]) / (box[3] - box[1]);
      }
      roof.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const material = roof.material as THREE.MeshBasicMaterial;
      material.map = texture; material.color.set("#FFFFFF"); material.needsUpdate = true;
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

// Once a square's blocks are on the map its real roofs follow. Then the blocks stay only to be clicked: they are not drawn.
type Real = { mesh: THREE.Mesh; ids: string[]; starts: Uint32Array; shade: Float32Array; roof: Uint8Array; index: Map<string, number> };
type OnMap = { scene: THREE.Scene; at: P2; done: boolean; real?: Real };
type Spot = { id: string; square: string };

export default function HomeMap({ buildings, step, focus, onPick, open, near, face, look, onFace, onOpen, view, chosen, onToggle, editing, installed, panels, panelW, turn, onReady, marked, taken, editsOn, tool, onPaint }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const models = useRef<{ scene: THREE.Scene; at: P2; id: string; polys: Poly[]; surfaces: { s: SunSurface; poly: number }[]; skins: ReturnType<typeof skinOf>[]; ghosts: THREE.Mesh }[]>([]); // one per building, each around its own origin
  const edgeLook = useRef(new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0 })); // one for all squares
  const [loading, setLoading] = useState(0);
  const squares = useRef(new Map<string, OnMap>());
  const around = useRef<Square[]>([]); // the squares the view needs now
  const solid = useRef<{ opacity: number; visibility: "visible" | "none" }>({ opacity: 1, visibility: "visible" });
  const heights = useRef(new Map<string, number>());
  const owned = useRef<Spot[]>([]);
  const ready = useRef(false);
  const shown = useRef(0); // 0: the map's blocks, 1: the measured buildings
  const site = useRef<P2[]>([]); // the street block's outlines, lon and lat: the ground stays clear around them too
  const needle = useRef<HTMLSpanElement>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const [credits, setCredits] = useState(false);
  const [bearing, setBearing] = useState(0);
  const spot = useRef<maplibregl.Marker | null>(null);
  const pins = useRef<maplibregl.Marker[]>([]);
  const live = useRef({ onPick, buildings, step, onFace, onOpen, onToggle, editing, panels, panelW, turn, onReady, marked: editsOn ?? marked, tool, onPaint });
  live.current = { onPick, buildings, step, onFace, onOpen, onToggle, editing, panels, panelW, turn, onReady, marked: editsOn ?? marked, tool, onPaint };
  const clearDraft = useRef(() => {});
  const drawing = () => live.current.step === "review" && live.current.editing && !!live.current.onPaint && !!live.current.tool;

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
  const hidden = useRef(new Map<string, unknown>()); // the map layers the review step switched off, and how they were
  const camera = useRef<{ center: maplibregl.LngLat; zoom: number; bearing: number; pitch: number } | null>(null); // where picking stopped
  const dressAll = useRef(() => {}); // the roofs' photo, again on every real square
  const flags = useRef(new Map<string, Set<string>>()); // what each building is marked as, for the real roofs: the blocks keep theirs as feature state
  /** Colours a square's real roofs, or one building of it, from its marks and the theme. */
  const tint = (name: string, only?: string) => {
    const real = squares.current.get(name)?.real;
    if (!real) return;
    const t = TONE, colour = real.mesh.geometry.getAttribute("color") as THREE.BufferAttribute, out = colour.array as Uint8Array;
    const roofC = new THREE.Color(), wallC = new THREE.Color(), marks = real.mesh.geometry.getAttribute("mark") as THREE.BufferAttribute, marked = marks.array as Uint8Array;
    const one = (k: number) => {
      const f = flags.current.get(`${name}|${real.ids[k]}`), state = f?.has("near") ? COLORS.face : f?.has("picked") ? COLORS.roof : f?.has("hover") ? t.hover : null;
      roofC.set(state ?? t.ghost);
      wallC.set(state ?? t.block);
      if (state) wallC.multiplyScalar(0.7);
      marked.fill(state ? 255 : 0, real.starts[k], real.starts[k + 1]);
      for (let v = real.starts[k]; v < real.starts[k + 1]; v++) {
        const c = real.roof[v] ? roofC : wallC, s = real.shade[v] * 255;
        out[v * 3] = Math.min(255, c.r * s); out[v * 3 + 1] = Math.min(255, c.g * s); out[v * 3 + 2] = Math.min(255, c.b * s);
      }
    };
    if (only === undefined) real.ids.forEach((_, k) => one(k));
    else { const k = real.index.get(only); if (k === undefined) return; one(k); }
    colour.needsUpdate = true; marks.needsUpdate = true;
    map.current?.triggerRepaint();
  };
  const mark = (b: Spot, key: string, value: boolean) => {
    const m = map.current, source = homesOf(b.square), at = `${b.square}|${b.id}`;
    if (m?.getSource(source)) m.setFeatureState({ source, id: b.id }, { [key]: value }); // a square that left the map is marked again when it returns
    const f = flags.current.get(at) ?? new Set<string>();
    if (value) f.add(key); else f.delete(key);
    if (f.size) flags.current.set(at, f); else flags.current.delete(at);
    tint(b.square, b.id);
  };
  const setSolid = (change: Partial<typeof solid.current>) => {
    const m = map.current;
    Object.assign(solid.current, change);
    if (m) squares.current.forEach((_, name) => {
      if (change.opacity !== undefined) m.setPaintProperty(homesOf(name), "fill-extrusion-opacity", squares.current.get(name)?.real ? 0 : change.opacity);
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
    const list = live.current.buildings, drawn = new Set(list.map((x) => x.id));
    const o = list[0]?.origin ?? [0, 0], block = map.current && list.length ? blockOf(list, roadsNear(map.current, o), o) : new Set<string>();
    const around = blockPoints(list, block), solid = new Set([...drawn, ...block]);
    site.current = around;
    models.current = list.map((b) => {
      const { roofs, walls } = b.real ?? { roofs: [], walls: [] };
      const g = new THREE.Group(), scene = new THREE.Scene();
      const faced = (m: THREE.Mesh, poly: number) => { m.userData = { face: { building: b.id, poly }, color: (m.material as THREE.MeshBasicMaterial).color.getHex() }; g.add(m); return m; };
      walls.forEach((p, i) => { faced(polygon(p.ring, p.holes, "#FFFFFF"), roofs.length + i).userData.part = "wall"; });
      const roofMeshes = roofs.map((p, poly) => { const m = faced(polygon(p.ring, p.holes, "#FFFFFF"), poly); m.userData.part = "roof"; return m; });
      const line = lines(edgesOf([...walls, ...roofs]), COLORS.edge, 0.5);
      line.name = "outline";
      (line.material as THREE.Material).userData.opacity = 0.5;
      g.add(line);
      const skins = (b.sun?.surfaces ?? []).map((x) => skinOf(x, [...roofs, ...walls][polyOf(b, x)], b.sun?.step ?? 1));
      skins.forEach((k) => g.add(k.skin, k.cover, k.plate));
      roofPhoto(b, roofMeshes, () => map.current?.triggerRepaint());
      const ghosts = ghostsOf(b, solid, siteBox(list, around));
      ghosts.renderOrder = -1;
      g.add(ghosts);
      const neighbours = neighboursOf(b, drawn, block);
      g.add(neighbours);
      drapePhoto(b.origin, neighbours.children.filter((o) => o.userData.part === "roof") as THREE.Mesh[], () => map.current?.triggerRepaint());
      scene.add(g);
      return { scene, at: b.origin, id: b.id, polys: [...roofs, ...walls], surfaces: (b.sun?.surfaces ?? []).map((x) => ({ s: x, poly: polyOf(b, x) })), skins, ghosts };
    });
    paintTiles();
    paintGhosts();
    paintPanels();
  };

  /** The modules the design places, on the surfaces it placed them, lowest rows first. */
  const paintPanels = () => {
    models.current.forEach((x) => {
      const b = live.current.buildings.find((y) => y.id === x.id), g = x.scene.children[0] as THREE.Group | undefined;
      if (!b || !g) return;
      const old = g.getObjectByName("modules");
      if (old) { g.remove(old); empty(old as THREE.Group); }
      const out = new THREE.Group(); out.name = "modules";
      const points: P3[] = [], faces: number[] = [], edges: number[] = [], uv: number[] = [];
      for (const { s, poly } of x.surfaces) {
        const count = live.current.panels?.[surfaceKey(b, s)] ?? 0;
        if (!count || s.kind !== "roof") continue;
        for (const q of fit(x.polys[poly], s.n).slice(0, count)) {
          const k = points.length; points.push(...q); faces.push(k, k + 1, k + 2, k, k + 2, k + 3);
          q.forEach((p, i) => edges.push(...p, ...q[(i + 1) % 4]));
          // The module image is upright: a module lying on its side turns it.
          const along = (i: number) => Math.hypot(...([0, 1, 2].map((d) => q[i][d] - q[0][d])) as P3);
          uv.push(...(along(1) <= along(3) ? [0, 0, 1, 0, 1, 1, 0, 1] : [0, 0, 0, 1, 1, 1, 1, 0]));
        }
      }
      if (points.length) {
        const panels = mesh(points, faces, "#FFFFFF");
        panels.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        (panels.material as THREE.MeshBasicMaterial).map = moduleLook;
        out.add(panels);
        out.add(lines(edges, "#C9D6EA", 0.5));
        out.traverse((o) => { const mat = (o as THREE.Mesh).material as THREE.Material | undefined; if (mat) { mat.userData.opacity = o instanceof THREE.LineSegments ? 0.5 : 1; mat.transparent = shown.current < 1; mat.opacity = shown.current * mat.userData.opacity; } });
      }
      g.add(out);
    });
    map.current?.triggerRepaint();
  };


  // The colours of the measured buildings. A roof that has its photo keeps it.
  const paintGhosts = () => {
    const t = TONE;
    models.current.forEach((x) => {
      (x.ghosts.material as THREE.MeshBasicMaterial).color.set(t.ghost);
      x.scene.getObjectByName("neighbours")?.children.forEach((o) => {
        const material = (o as THREE.Mesh).material as THREE.MeshBasicMaterial, n = o.userData.n as P3;
        if (o.name === "outline") material.color.set(t.line);
        else if (!material.map) material.color.set(o.userData.part === "roof" ? lit(t.ghost, n) : litWall(t.block, n));
      });
      (x.scene.children[0] as THREE.Group).children.forEach((o) => {
        const material = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (o.name === "outline") material.color.set(t.line);
        if (!o.userData.part || material.map) return;
        const n = normal(x.polys[o.userData.face.poly].ring);
        material.color.set(o.userData.part === "roof" ? lit(t.roof, n) : t.wall);
      });
    });
  };

  // Chosen surfaces carry a colour. Everything else shows what it really is, so the eye goes to the choice.
  const paintTiles = () => {
    const picked = new Set(chosen), hot = face;
    const low = SUN_LOW, high = SUN_HIGH; // one fixed scale, so a surface keeps its colour whatever else is selected
    const dim = new THREE.Color("#0F1013"), mark = new THREE.Color("#FFFFFF");
    const look = OVERLAY;
    models.current.forEach((m) => {
      const b = live.current.buildings.find((x) => x.id === m.id);
      if (!b?.sun) return;
      const suns = b.sun.suns, moment = view.moment ? suns.findIndex((x) => x.month === view.moment?.month && x.hour === view.moment.hour) : -1;
      for (const { s: x, pixels, source, texture, cover, plate, holes, mask, fitted, fit } of m.skins) {
        const key = surfaceKey(b, x), count = x.year.length;
        // Cells with panels keep their photo under amber; free cells not chosen are hatched; chosen cells look as they are. Without a drawing a surface is all in or all out.
        const full = new Set(x.year.map((_, n) => n)), none = new Set<number>();
        const has = taken ? new Set(taken[key] ?? []) : installed.includes(key) ? full : none;
        const on = marked ? new Set(marked[key] ?? []) : picked.has(key) && !has.size ? full : none;
        const layer = (mesh: THREE.Mesh, show: (n: number) => boolean, pixels: Uint8Array, texture: THREE.DataTexture) => {
          let shown = 0;
          for (let n = 0; n < count; n++) if (show(n)) shown++;
          mesh.visible = shown > 0;
          const material = mesh.material as THREE.MeshBasicMaterial, alphaMap = shown > 0 && shown < count ? texture : null;
          if (material.alphaMap !== alphaMap) { material.alphaMap = alphaMap; material.needsUpdate = true; }
          if (alphaMap) { source.forEach((n, px) => { pixels[px * 4 + 1] = n >= 0 && show(n) ? 255 : 0; }); texture.needsUpdate = true; }
        };
        layer(plate, (n) => has.has(n), fitted, fit);
        layer(cover, (n) => !has.has(n) && !on.has(n), holes, mask);
        (plate.material as THREE.MeshBasicMaterial).color.set(look.has);
        const veil = cover.material as THREE.MeshBasicMaterial;
        veil.userData.hatch.uVeil.value.copy(look.hatch.veil); veil.userData.hatch.uInk.value.copy(look.hatch.ink);
        const over = hot?.building === b.id && hot.poly === polyOf(b, x), read = seenBits(x, suns.length);
        const rgba = x.year.map((value, i) => {
          let c = dim, alpha = 0;
          if (view.layer === "sun") {
            if (!view.moment) c = heat((value - low) / Math.max(1, high - low));
            else if (moment < 0) c = HEAT[0];
            else { const v = suns[moment].vector; c = heat(read(i, moment) ? Math.max(0, x.n[0] * v[0] + x.n[1] * v[1] + x.n[2] * v[2]) : 0); }
            alpha = 0.94;
          }
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

  // While picking, a letter marks each building, the same one as in the panel. Once chosen, the buildings are one home: no letters.
  const liftPins = useRef(() => {});
  const placePins = () => {
    const m = map.current;
    pins.current.forEach((x) => x.remove());
    pins.current = [];
    if (!m || !ready.current || step === "review") return;
    const pin = (text: string, at: P2, z: number, click: () => void) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "pin";
      tag.textContent = text;
      tag.dataset.z = String(z);
      tag.addEventListener("click", (e) => { e.stopPropagation(); click(); });
      pins.current.push(new maplibregl.Marker({ element: tag }).setLngLat(at).addTo(m));
    };
    homesIn(buildings).forEach((g, i) => pin(letter(i), g.parts[0].origin, Math.max(8, ...g.parts.map((b) => heights.current.get(b.id) ?? 0)) + 1, () => onOpen(g.home)));
    liftPins.current();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current as HTMLDivElement, style: mapStyle(), attributionControl: false, center: MUNICH, zoom: 11, pitch: 30, maxPitch: MAX_PITCH, bearing: 0,
      maxBounds: VIEW_LIMIT, clickTolerance: 8, canvasContextAttributes: { antialias: true }, reduceMotion: false, boxZoom: false, doubleClickZoom: false,
      rotateSpeed: TURN_PER_PX, pitchSpeed: -TILT_PER_PX,
      // By default tiles are cut into smaller ones when zooming in, which cuts every building along a grid.
      zoomLevelsToOverscale: 16,
    });
    map.current = m;
    // Zooming stays on the view's centre instead of chasing the pointer.
    m.dragPan.enable(PAN);
    m.scrollZoom.enable({ around: "center" });
    // Linear: by default a drag spins the map like a wheel, the opposite way below the centre and slower far from it.
    m.dragRotate.enable({ around: "center", movement: "linear" });
    // A marker has no height of its own: lift it to the roof by hand.
    liftPins.current = () => {
      const px = (512 * 2 ** m.getZoom()) / (40075016 * Math.cos((m.getCenter().lat * Math.PI) / 180)) * Math.sin((m.getPitch() * Math.PI) / 180);
      pins.current.forEach((x) => x.setOffset([0, -Number(x.getElement().dataset.z) * px]));
    };
    m.on("move", () => liftPins.current());
    m.on("rotate", () => { if (needle.current) needle.current.style.rotate = `${-m.getBearing()}deg`; setBearing(m.getBearing()); });

    m.once("load", () => { if (!live.current.onReady) locateMe(); });
    m.once("idle", () => live.current.onReady?.());
    let renderer: THREE.WebGLRenderer;
    const camera = new THREE.Camera();
    const shaper = new Worker(new URL("./solids.worker.ts", import.meta.url), { type: "module" });
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
          // Real roofs fade with the blocks they replace.
          const roofsT = solid.current.visibility === "visible" ? 1 - shown.current : 0;
          if (roofsT > 0) around.current.forEach(({ name }) => {
            const square = squares.current.get(name);
            if (!square?.done || (!square.real && edgeFade(m.getZoom()) === 0)) return;
            if (square.real) {
              const material = square.real.mesh.material as THREE.ShaderMaterial;
              square.real.mesh.visible = roofsT > 0;
              material.uniforms.opacity.value = roofsT; material.transparent = roofsT < 1; material.depthWrite = roofsT >= 1;
            }
            draw(square.scene, square.at);
          });
          if (shown.current > 0) models.current.forEach(({ scene, at }) => draw(scene, at));
        },
      });
      m.addSource("aerial", { type: "raster", tiles: [GROUND_TILES], tileSize: TILE_PX });
      // The aerial photo is the ground, in place of the base map's roads and land. Its labels stay on top.
      m.addLayer({ id: "aerial", type: "raster", source: "aerial" }, BLOCKS);

      // The edge of the prototype: dimmed outside, a yellow line, and the reason written along it.
      m.addSource(SITE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: SITE, type: "fill", source: SITE, layout: { visibility: "none" }, paint: { "fill-color": TONE.ground, "fill-opacity": 0 } }, "home-3d");
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
        const square = squares.current.get(name);
        square?.scene.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
        (square?.real?.mesh.material as THREE.Material | undefined)?.dispose(); // the lines' look is shared by every square: it stays
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
              "fill-extrusion-color": blockColour(),
              "fill-extrusion-height": ["get", "h"],
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": solid.current.opacity,
              "fill-extrusion-opacity-transition": { duration: FADE_MS, delay: 0 },
            },
          }, BLOCKS);
        }).catch(() => { asking.delete(name); failed.add(name); showMissing(); pump(); });
      };
      // The roofs' photo: for each ring, tiles around the view's centre drawn into one image. Tiles the ground already has are on the
      // roofs at once; the rest fill in as they arrive. A ring is made again once the centre moves to another of its tiles or the zoom changes.
      const rings: ({ texture: THREE.Texture; box: number[]; key: string } | null)[] = ROOF_LEVELS.map(() => null), asked = ROOF_LEVELS.map(() => "");
      const dress = (square: OnMap) => {
        const material = square.real?.mesh.material as THREE.ShaderMaterial | undefined;
        if (!material) return;
        rings.forEach((r, k) => {
          material.uniforms[`photo${k}`].value = r?.texture ?? null;
          material.uniforms[`has${k}`].value = r ? 1 : 0;
          if (r) material.uniforms[`fit${k}`].value = photoFit(square.at, r.box);
        });
      };
      dressAll.current = () => { squares.current.forEach(dress); m.triggerRepaint(); };
      const refreshPhoto = () => {
        if (live.current.step !== "pick" || m.getZoom() < HOMES_FROM_ZOOM) return;
        const c = m.getCenter(), X = ((c.lng + 180) / 360 - 0.5) * WORLD_M, Y = (0.5 - mercator(c.lng, c.lat)[1]) * WORLD_M;
        ROOF_LEVELS.forEach(({ dz, tiles }, k) => {
          const z = Math.min(ROOF_TILE_ZOOM.max, Math.max(ROOF_TILE_ZOOM.min, Math.round(m.getZoom()) + dz)), [cx, cy] = tileAt(z, X, Y);
          const key = `${z}/${cx}/${cy}`;
          if (asked[k] === key) return;
          asked[k] = key;
          const alive = () => asked[k] === key && ready.current, half = Math.floor(tiles / 2);
          let texture: THREE.CanvasTexture | null = null, queued = 0;
          const drew = () => { if (texture && !queued) queued = requestAnimationFrame(() => { queued = 0; if (texture) texture.needsUpdate = true; m.triggerRepaint(); }); };
          const made = mosaic(z, cx - half, cy - half, tiles, tiles, drew, alive);
          made.ready.then(() => {
            if (!alive()) return;
            texture = new THREE.CanvasTexture(made.canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 8;
            const old = rings[k]?.texture;
            rings[k] = { texture, box: made.box, key };
            dressAll.current();
            old?.dispose();
          });
        });
      };
      m.on("moveend", refreshPhoto);

      // Real roofs: the worker fetches and shapes them, the page only hands the result to the GPU.
      const shaping = new Set<string>(), noReal = new Set<string>();
      const pumpReal = () => {
        const c = m.getCenter();
        [...squares.current].filter(([name, s]) => s.done && !s.real && !shaping.has(name) && !noReal.has(name) && around.current.some((x) => x.name === name))
          .sort(([, a], [, b]) => Math.hypot(a.at[0] - c.lng, a.at[1] - c.lat) - Math.hypot(b.at[0] - c.lng, b.at[1] - c.lat))
          .slice(0, MAX_DETAIL_LOADS - shaping.size)
          .forEach(([name, s]) => { shaping.add(name); shaper.postMessage({ name, at: s.at }); });
      };
      shaper.onmessage = ({ data }: MessageEvent<Detail | { name: string; failed: true }>) => {
        shaping.delete(data.name);
        const square = squares.current.get(data.name);
        if ("failed" in data) { noReal.add(data.name); pumpReal(); return; }
        if (!ready.current || !square || square.real) { pumpReal(); return; }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
        g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(data.positions.length), 3, true));
        g.setAttribute("roof", new THREE.BufferAttribute(data.roof, 1)); // 0 or 1 as it is: normalised, 1 would arrive as 1/255
        g.setAttribute("mark", new THREE.BufferAttribute(new Uint8Array(data.roof.length), 1, true));
        g.setIndex(new THREE.BufferAttribute(data.index, 1));
        const mesh = new THREE.Mesh(g, roofMaterial());
        mesh.frustumCulled = false;
        square.scene.add(mesh);
        // The lines now follow the real roofs instead of the blocks' tops, and draw after them.
        const line = square.scene.children[0] as THREE.LineSegments;
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(data.lines, 3));
        line.renderOrder = 1;
        square.real = { mesh, ids: data.ids, starts: data.starts, shade: data.shade, roof: data.roof, index: new Map(data.ids.map((id, k) => [id, k])) };
        tint(data.name);
        dress(square);
        refreshPhoto(); // the map may not have moved since it loaded
        m.setPaintProperty(homesOf(data.name), "fill-extrusion-opacity", 0); // still there to be clicked
        m.triggerRepaint();
        pumpReal();
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
        pumpReal();
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
        if (live.current.step === "review") return; // the buildings are chosen: no more of the city is needed
        const ticket = ++asks;
        if (!ready.current) return;
        if (m.getZoom() < HOMES_FROM_ZOOM || live.current.step !== "pick") { around.current = []; showMissing(); return; }
        const { lng, lat } = m.getCenter(), r = LOAD_REACH_DEG;
        squaresIn(lng - r, lat - r * 0.7, lng + r, lat + r * 0.7).then((list) => {
          if (ticket !== asks || !ready.current) return;
          around.current = list.filter((s) => s.ring.some(inRegion));
          showMissing();
          pump();
          pumpReal();
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

    const W = () => m.getContainer().clientWidth, H = () => m.getContainer().clientHeight;
    const seenOf = (id: string) => models.current.find((x) => x.id === id)?.scene.userData.seen as THREE.Matrix4 | null | undefined;
    const facing = (seen: THREE.Matrix4, q: P3, n: P3) => new THREE.Vector3(q[0] + n[0], q[1] + n[1], q[2] + n[2]).applyMatrix4(seen).z < new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(seen).z;
    const clip = (seen: THREE.Matrix4, q: P3) => { const c = new THREE.Vector4(q[0], q[1], q[2], 1).applyMatrix4(seen); return { x: (c.x / c.w + 1) / 2 * W(), y: (1 - c.y / c.w) / 2 * H(), w: c.w }; };
    const onScreen = (id: string, q: P3): P2 | null => { const seen = seenOf(id); if (!seen) return null; const c = clip(seen, q); return [c.x, c.y]; };

    /** The cells inside a shape on screen that the viewer really sees: on a side turned to them, and not behind another surface. */
    const cellsIn = (shape: P2[]) => {
      const v = new THREE.Vector3(), cells: Record<string, number[]> = {};
      for (const { scene, id, polys, surfaces, skins } of models.current) {
        const seen = scene.userData.seen as THREE.Matrix4 | null, b = live.current.buildings.find((x) => x.id === id);
        if (!seen || !b) continue;
        skins.forEach(({ s, centres }, k) => {
          const poly = surfaces[k].poly;
          if (!facing(seen, polys[poly].ring[0], s.n)) return;
          const hit: number[] = [];
          for (let n = 0; n < s.year.length; n++) {
            v.set(centres[n * 3], centres[n * 3 + 1], centres[n * 3 + 2]).applyMatrix4(seen);
            const at = new maplibregl.Point((v.x + 1) / 2 * W(), (1 - v.y) / 2 * H());
            if (!inside([at.x, at.y], shape)) continue;
            const top = faceAt(at);
            if (top?.building === id && top.poly === poly) hit.push(n);
          }
          if (hit.length) cells[surfaceKey(b, s)] = hit;
        });
      }
      return cells;
    };

    /** Where a click lands in the model. It snaps to the shape's own points, then to a surface's corners, then to its edges; otherwise it is the exact point on the surface under it. */
    type Spot3 = { id: string; at: P3 };
    const pointAt = (p: maplibregl.Point): (Spot3 & { close?: boolean }) | null => {
      const near = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) <= SNAP_PX;
      const first = draft[0] && onScreen(draft[0].id, draft[0].at);
      if (draft.length >= 3 && first && near(first[0], first[1])) return { ...draft[0], close: true };
      for (const d of draft) { const s = onScreen(d.id, d.at); if (s && near(s[0], s[1])) return d; }
      let edge: { d: number; spot: Spot3 } | null = null;
      for (const { scene, id, polys, surfaces } of models.current) {
        const seen = scene.userData.seen as THREE.Matrix4 | null;
        if (!seen) continue;
        for (const { s, poly } of surfaces) {
          if (!facing(seen, polys[poly].ring[0], s.n)) continue;
          for (const ring of [polys[poly].ring, ...polys[poly].holes]) ring.forEach((q, i) => {
            const a = clip(seen, q), r = ring[(i + 1) % ring.length], c = clip(seen, r);
            if (near(a.x, a.y)) { edge = { d: -1, spot: { id, at: q } }; return; }
            const dx = c.x - a.x, dy = c.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
            const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
            if (d > SNAP_PX || (edge && edge.d <= d)) return;
            const u = (t / c.w) / ((1 - t) / a.w + t / c.w); // the screen's share along the edge, undone for perspective
            edge = { d, spot: { id, at: [q[0] + (r[0] - q[0]) * u, q[1] + (r[1] - q[1]) * u, q[2] + (r[2] - q[2]) * u] } };
          });
        }
      }
      if (edge) return (edge as { spot: Spot3 }).spot;
      const found = faceAt(p), model = models.current.find((x) => x.id === found?.building), seen = model?.scene.userData.seen as THREE.Matrix4 | null;
      const skin = model?.skins.find((_, k) => model.surfaces[k].poly === found?.poly);
      if (!model || !seen || !skin) return null;
      // Barycentric on screen, then weighted back by depth: exact on a flat surface seen in perspective.
      const [A, B, C] = skin.plane.map((q) => clip(seen, q)), det = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y) || 1;
      const l0 = ((B.y - C.y) * (p.x - C.x) + (C.x - B.x) * (p.y - C.y)) / det, l1 = ((C.y - A.y) * (p.x - C.x) + (A.x - C.x) * (p.y - C.y)) / det, l2 = 1 - l0 - l1;
      const k = [l0 / A.w, l1 / B.w, l2 / C.w], sum = k[0] + k[1] + k[2];
      return { id: model.id, at: [0, 1, 2].map((i) => (k[0] * skin.plane[0][i] + k[1] * skin.plane[1][i] + k[2] * skin.plane[2][i]) / sum) as P3 };
    };

    // The shape being drawn: points in the model, so it stays put while the map turns. Lines join point to point; clicking the first point closes it.
    let draft: Spot3[] = [], hoverAt: maplibregl.Point | null = null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("draft");
    m.getCanvasContainer().appendChild(svg);
    const drawDraft = () => {
      const on = drawing() && live.current.tool === "draw";
      if (!on || (!draft.length && !hoverAt)) { svg.innerHTML = ""; return; }
      const pts = draft.map((d) => onScreen(d.id, d.at)).filter((x): x is P2 => !!x), next = hoverAt ? pointAt(hoverAt) : null;
      const tip = next ? onScreen(next.id, next.at) : hoverAt ? [hoverAt.x, hoverAt.y] as P2 : null;
      let out = "";
      if (pts.length > 1) out += `<polyline class="line" points="${pts.map((q) => q.join(",")).join(" ")}" />`;
      if (pts.length && tip) out += `<line class="next" x1="${pts[pts.length - 1][0]}" y1="${pts[pts.length - 1][1]}" x2="${tip[0]}" y2="${tip[1]}" />`;
      pts.forEach((q, i) => { out += `<circle class="${i === 0 && next?.close ? "pt end" : "pt"}" cx="${q[0]}" cy="${q[1]}" r="${i === 0 && next?.close ? 8 : 5}" />`; });
      if (tip && !next?.close) out += `<circle class="${next ? "aim on" : "aim"}" cx="${tip[0]}" cy="${tip[1]}" r="4" />`;
      svg.innerHTML = out;
    };
    const finish = () => {
      if (draft.length >= 3) {
        const shape = draft.map((d) => onScreen(d.id, d.at)).filter((x): x is P2 => !!x), cells = cellsIn(shape), marked = live.current.marked ?? {};
        let had = 0, all = 0;
        for (const [key, list] of Object.entries(cells)) { const set = new Set(marked[key] ?? []); list.forEach((n) => { all++; if (set.has(n)) had++; }); }
        // Mostly marked inside: the shape takes it out. Mostly free: the shape adds it.
        if (all) live.current.onPaint?.(cells, had * 2 < all, true);
      }
      draft = []; drawDraft();
    };
    clearDraft.current = () => { draft = []; hoverAt = null; drawDraft(); };
    const place = (p: maplibregl.Point) => {
      const spot = pointAt(p);
      if (!spot) return;
      if (spot.close) { finish(); return; }
      const last = draft[draft.length - 1];
      if (last && last.id === spot.id && Math.hypot(last.at[0] - spot.at[0], last.at[1] - spot.at[1], last.at[2] - spot.at[2]) < 0.05) return; // a double click
      draft.push({ id: spot.id, at: spot.at }); drawDraft();
    };
    const keys = (e: KeyboardEvent) => {
      if (!(drawing() && live.current.tool === "draw") || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") { draft = []; drawDraft(); }
      if (e.key === "Enter") finish();
      if (e.key === "Backspace" && draft.length) { e.preventDefault(); draft.pop(); drawDraft(); }
    };
    addEventListener("keydown", keys);
    m.on("render", drawDraft);
    m.on("dblclick", (e) => { if (drawing() && live.current.tool === "draw") { e.preventDefault(); finish(); } });

    // Whole surfaces: a drag runs over them, and the first one decides if the stroke adds or takes out.
    const surfaceAt = (p: maplibregl.Point) => {
      const found = faceAt(p), b = live.current.buildings.find((x) => x.id === found?.building), s = b?.sun?.surfaces.find((x) => polyOf(b, x) === found?.poly);
      return b && s ? { key: surfaceKey(b, s), all: s.year.map((_, n) => n) } : null;
    };
    const hitAt = (p: maplibregl.Point): Record<string, number[]> => { const s = surfaceAt(p); return s ? { [s.key]: s.all } : {}; };
    // A stroke sends what it covered once a frame. Its first batch says it began, so the page can keep one undo step per stroke.
    let stroke: { on: boolean; last: maplibregl.Point } | null = null, batch: Record<string, number[]> = {}, flush = 0, first = false;
    const send = () => {
      flush = 0;
      if (!stroke || !Object.keys(batch).length) return;
      live.current.onPaint?.(batch, stroke.on, first);
      batch = {}; first = false;
    };
    const take = (cells: Record<string, number[]>) => {
      for (const [key, list] of Object.entries(cells)) batch[key] = [...(batch[key] ?? []), ...list];
      if (!flush) flush = requestAnimationFrame(send);
    };
    const paintTo = (p: maplibregl.Point) => {
      if (!stroke) return;
      const from = stroke.last, steps = Math.max(1, Math.ceil(from.dist(p) / 10)); // a quick stroke skips no surface
      for (let i = 1; i <= steps; i++) take(hitAt(from.add(p.sub(from).mult(i / steps))));
      stroke.last = p;
    };
    const begin = (p: maplibregl.Point) => {
      if (!drawing() || live.current.tool !== "surface") return;
      const s = surfaceAt(p);
      if (!s) return;
      stroke = { on: !live.current.marked?.[s.key]?.length, last: p }; first = true;
      take(hitAt(p));
    };
    const end = () => {
      if (!stroke) return;
      if (flush) cancelAnimationFrame(flush);
      send();
      stroke = null;
    };
    m.on("mousedown", (e) => { if (e.originalEvent.button === 0 && !e.originalEvent.ctrlKey) begin(e.point); });
    m.on("touchstart", (e) => { if (e.points.length === 1) begin(e.point); });
    m.on("touchmove", (e) => { if (stroke) paintTo(e.point); });
    m.on("touchend", end);
    addEventListener("mouseup", end);

    const under = (p: maplibregl.Point) => {
      const layers = [...squares.current.keys()].map(homesOf);
      const hit = layers.length ? m.queryRenderedFeatures(p, { layers })[0] : undefined;
      if (!hit) return undefined;
      const { id, h, lon, lat, home } = hit.properties;
      return { id: String(id), home: String(home ?? id), square: squareOf(hit.source), at: [lon, lat] as P2, height: Number(h) };
    };
    m.on("click", (e) => {
      if (live.current.step === "review") {
        if (drawing()) { if (live.current.tool === "draw") place(e.point); return; } // whole surfaces change as the drag goes
        if (!live.current.editing) return; // surfaces are changed on the roof step only
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
      if (stroke) { paintTo(e.point); return; }
      if (drawing() && live.current.tool === "draw") { hoverAt = e.point; drawDraft(); }
      if (frame || m.isMoving()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (live.current.step === "review") {
          const draw = drawing() && live.current.tool === "draw", found = live.current.editing && !draw ? faceAt(e.point) : null;
          m.getCanvas().style.cursor = draw ? "crosshair" : found ? "pointer" : "";
          live.current.onFace(found);
          return;
        }
        if (!live.current.onPick) { hover([]); m.getCanvas().style.cursor = ""; return; }
        const hit = under(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
        // A home can be several parts: all of them light up together.
        hover(hit ? [hit, ...m.querySourceFeatures(homesOf(hit.square), { filter: ["==", ["get", "home"], hit.home] }).map((f) => ({ id: String(f.id), square: hit.square })).filter((f, i, all) => f.id !== hit.id && all.findIndex((x) => x.id === f.id) === i)] : []);
      });
    });
    m.on("mouseout", () => { hover([]); hoverAt = null; drawDraft(); });
    m.on("movestart", () => hover([]));
    return () => { shaper.terminate(); removeEventListener("mouseup", end); removeEventListener("keydown", keys); ready.current = false; clearInterval(pulse); squares.current.clear(); around.current = []; m.remove(); map.current = null; };
  }, []);

  useEffect(() => { syncHomes.current(); }, [buildings]);
  // Roof photos load while the user is still picking, so nothing pops in during the move.
  const fetched = useRef(new Set<string>());
  useEffect(() => {
    for (const b of buildings) {
      if (!b.real || fetched.current.has(b.id)) continue;
      fetched.current.add(b.id);
      warmRoof(b);
    }
  }, [buildings]);
  // The search dot helps find the area; once buildings are chosen it only sits in the way.
  useEffect(() => { const dot = spot.current?.getElement(); if (dot) dot.style.display = step === "review" ? "none" : ""; }, [step]);
  useEffect(placePins, [buildings, step, open]);
  useEffect(paintTiles, [view, chosen, face, installed, marked, taken]);
  // While drawing, a left drag paints; right drag still turns and the wheel still zooms.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const on = step === "review" && editing && !!onPaint;
    // Whole surfaces take the left drag; drawing places points by click, so the map still moves by drag.
    if (on && tool === "surface") m.dragPan.disable(); else m.dragPan.enable(PAN);
    clearDraft.current();
  }, [tool, step, editing]);
  useEffect(() => { paintPanels(); }, [panels]);
  // Models are built when their sun arrives, so tiles appear without leaving the screen.
  const sunReady = buildings.filter((b) => b.sun).length;
  useEffect(() => {
    if (step !== "review" || shown.current !== 1) return;
    buildModels(); setShown(1);
    (map.current?.getSource(SITE) as maplibregl.GeoJSONSource | undefined)?.setData(fadeAround(live.current.buildings, site.current));
  }, [sunReady]);
  // A building hovered in the list lights up on the map.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !near) return;
    const parts = live.current.buildings.filter((x) => x.home === near);
    if (!parts.length) return;
    parts.forEach((b) => mark(b, "near", true));
    return () => parts.forEach((b) => mark(b, "near", false));
  }, [near]);
  useEffect(() => { if (look) frame(700, look.id); }, [look]);

  // The map stays full size behind its window, so the room is measured from the screen's edges.
  const room = () => wide() ? live.current.panelW ? { top: 130, left: live.current.panelW + 110, right: 130, bottom: 130 } : { top: 90, left: PANEL_W + 70, right: 90, bottom: 120 } : { top: 110, left: 30, right: 30, bottom: innerHeight * 0.5 };
  const areaOf = (list: Selected[]) => {
    const points = list.flatMap((b) => [b.origin, ...(b.real?.roofs ?? []).flatMap((r) => r.ring.map((p) => toLngLat(b.origin, [p[0], p[1]])))]);
    return points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
  };

  const frame = (duration: number, only?: string) => {
    const m = map.current, list = live.current.buildings.filter((b) => !only || b.home === only);
    if (!m || !list.length) return;
    const area = areaOf(list);
    // The padding stays on the map, so its centre, which it turns around, is the middle of the window.
    m.fitBounds(area, { padding: room(), absolutePadding: true, maxZoom: live.current.panelW ? 20.4 : 19.5, pitch: PITCH, bearing: live.current.turn ?? m.getBearing(), duration, easing: glide });
  };
  /** How long the camera takes to reach the chosen buildings: the usual movement when they are on screen, longer from across
   *  the city, so the flight is never a jump. Grows with the zoom to cover and the distance, at most FLY_MAX_MS. */
  const travelTime = () => {
    const m = map.current, list = live.current.buildings;
    if (!m || !list.length) return MOVE_MS;
    const area = areaOf(list), zoomIn = Math.max(0, (live.current.panelW ? 20.4 : 19.5) - m.getZoom()), km = m.getCenter().distanceTo(area.getCenter()) / 1000;
    return Math.round(Math.min(FLY_MAX_MS, MOVE_MS + Math.max(0, zoomIn - 1.5) * FLY_PER_ZOOM_MS + Math.min(km, 8) * FLY_PER_KM_MS));
  };

  // Between the steps the map's blocks fade out while the measured buildings fade in, as the camera settles on them.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const to = step === "review" ? 1 : 0, from = shown.current;
    if (to === from) return;
    const coverOutside = (t: number) => m.setPaintProperty(SITE, "fill-opacity", ["*", ["get", "o"], t]);
    // The models fade in, and the city fades out, over the last MOVE_MS of the flight: while the camera is still far they would only flicker.
    const flight = to ? travelTime() : MOVE_MS, wait = flight - MOVE_MS;
    if (to) {
      camera.current = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
      buildModels(); setShown(0); placePins(); frame(flight);
      (m.getSource(SITE) as maplibregl.GeoJSONSource).setData(fadeAround(live.current.buildings, site.current));
      m.setLayoutProperty(SITE, "visibility", "visible");
      m.setMaxPitch(REVIEW_PITCH);
      // Once it has arrived, nothing more loads. Closer is fine; further only until the whole site fits at any turn, and the centre stays on the buildings.
      m.once("moveend", () => {
        if (live.current.step !== "review") return;
        const area = areaOf(live.current.buildings), across = area.getSouthWest().distanceTo(area.getNorthEast()), pad = room(), box = m.getContainer();
        const side = Math.min(box.clientWidth - pad.left - pad.right, box.clientHeight - pad.top - pad.bottom);
        const fits = Math.log2((side * 40075016 * Math.cos((area.getCenter().lat * Math.PI) / 180)) / (512 * Math.max(1, across)));
        const zoom = m.getZoom();
        m.setMaxZoom(Math.max(zoom + 1.5, 20)); // past this the photo is only blur
        m.setMinZoom(Math.min(zoom - 0.5, fits));
        m.setTransformConstrain(leash(m, area));
      });
    } else {
      m.setTransformConstrain(null);
      m.setMinZoom(null);
      m.setMaxZoom(null);
      if (camera.current) m.easeTo({ ...camera.current, padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: MOVE_MS, easing: glide });
      m.setMaxPitch(MAX_PITCH);
      hidden.current.forEach((visibility, id) => m.setLayoutProperty(id, "visibility", visibility as "visible"));
      hidden.current.clear();
    }
    refreshSquares.current();
    setSolid({ visibility: "visible", ...(wait > 0 ? {} : { opacity: to ? 0 : 1 }) });
    const start = performance.now() + wait;
    let frameId = 0, faded = wait <= 0;
    const tick = (now: number) => {
      if (now < start) { frameId = requestAnimationFrame(tick); return; }
      if (!faded) { faded = true; setSolid({ opacity: to ? 0 : 1 }); }
      const t = Math.min(1, (now - start) / MOVE_MS), eased = glide(t);
      setShown(from + (to - from) * eased);
      coverOutside(from + (to - from) * eased);
      fadeLines.current();
      if (t < 1) { frameId = requestAnimationFrame(tick); return; }
      if (to) {
        setSolid({ visibility: "none" });
        // Nothing is drawn that nobody sees: labels, blocks and the region's edge all rest until the user goes back.
        for (const l of m.getStyle().layers) if (l.type === "symbol" || [BLOCKS, PENDING, "outside", "limit-line"].includes(l.id)) {
          hidden.current.set(l.id, m.getLayoutProperty(l.id, "visibility") ?? "visible");
          m.setLayoutProperty(l.id, "visibility", "none");
        }
      } else { clearModels(); m.setLayoutProperty(SITE, "visibility", "none"); }
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
  return (
    <>
      <div className="sheet" aria-hidden="true" />
      <div ref={box} className="map3d" role="application" aria-label="3D map of the home" />
      {loading > 0 && <div className="mapload" role="status">Loading measured buildings…</div>}
      <div className="rim" aria-hidden="true" />
      <SunLight view={view} sun={buildings.find((b) => b.sun)?.sun ?? null} bearing={bearing} />
      {step === "review" && <p className="maphint">{editing && onPaint && tool === "draw" ? "Click to place points · Click the first point to close · Backspace undoes a point" : editing && onPaint && tool === "surface" ? "Drag over surfaces · Right-drag to turn · Scroll to zoom" : "Drag to move · Right-drag or Ctrl-drag to turn · Scroll to zoom"}</p>}
      <div className="mapctl">
        {step === "pick" && <IconButton variant="glass" size="lg" label="Go to my location" onClick={locateMe}><Locate /></IconButton>}
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
