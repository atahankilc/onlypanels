// Plain geometry in metres around a local origin: x east, y north, z up.
export type P2 = [number, number];
export type P3 = [number, number, number];

const RAD = Math.PI / 180;
const M_PER_DEG = 111320;

export const toLocal = (o: P2, p: P2): P2 => [(p[0] - o[0]) * M_PER_DEG * Math.cos(o[1] * RAD), (p[1] - o[1]) * M_PER_DEG];
export const toLngLat = (o: P2, p: P2): P2 => [o[0] + p[0] / (M_PER_DEG * Math.cos(o[1] * RAD)), o[1] + p[1] / M_PER_DEG];

export const area = (r: P2[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export const centre = (r: P2[]): P2 => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

const newell = (r: P3[]): P3 => r.reduce<P3>((n, p, i) => { const q = r[(i + 1) % r.length]; return [n[0] + (p[1] - q[1]) * (p[2] + q[2]), n[1] + (p[2] - q[2]) * (p[0] + q[0]), n[2] + (p[0] - q[0]) * (p[1] + q[1])]; }, [0, 0, 0]);
/** The plane's normal, pointing up. */
export function normal(r: P3[]): P3 {
  const n = newell(r), l = Math.hypot(...n) || 1, s = n[2] < 0 ? -1 : 1;
  return [(n[0] / l) * s, (n[1] / l) * s, (n[2] / l) * s];
}

export function inside(p: P2, r: P2[]) {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) hit = !hit;
  }
  return hit;
}
