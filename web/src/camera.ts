import * as maplibregl from "maplibre-gl";

// One rate everywhere on the screen, as in a CAD viewer: the same drag always turns the view the same amount.
export const TURN_PER_PX = 0.4;
export const TILT_PER_PX = 0.3;
/** Keeps the view's centre on the buildings and the zoom in the map's range. Turning is never limited. */
export const leash = (m: maplibregl.Map, area: maplibregl.LngLatBounds) => (at: maplibregl.LngLat, zoom: number) => ({
  center: new maplibregl.LngLat(Math.min(area.getEast(), Math.max(area.getWest(), at.lng)), Math.min(area.getNorth(), Math.max(area.getSouth(), at.lat))),
  zoom: Math.min(m.getMaxZoom(), Math.max(m.getMinZoom(), zoom)),
});
