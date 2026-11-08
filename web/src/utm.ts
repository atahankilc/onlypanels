// WGS84 and UTM zone 32 (ETRS89, EPSG:25832), the grid Bavaria's building models are drawn in. Krüger's series,
// to a millimetre over the region, so the page needs no projection library.
const A_ = 6378137, F = 1 / 298.257222101, K0 = 0.9996, E0 = 500000, LON0 = 9;
const n = F / (2 - F), n2 = n * n, n3 = n2 * n;
const A = (A_ / (1 + n)) * (1 + n2 / 4 + (n2 * n2) / 64);
const alpha = [n / 2 - (2 * n2) / 3 + (5 * n3) / 16, (13 * n2) / 48 - (3 * n3) / 5, (61 * n3) / 240];
const beta = [n / 2 - (2 * n2) / 3 + (37 * n3) / 96, n2 / 48 + n3 / 15, (17 * n3) / 480];
const delta = [2 * n - (2 * n2) / 3 - 2 * n3, (7 * n2) / 3 - (8 * n3) / 5, (56 * n3) / 15];
const rad = Math.PI / 180, c = (2 * Math.sqrt(n)) / (1 + n);

export function toUtm(lon: number, lat: number): [number, number] {
  const s = Math.sin(lat * rad), dl = (lon - LON0) * rad;
  const t = Math.sinh(Math.atanh(s) - c * Math.atanh(c * s));
  const xi = Math.atan(t / Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta, nn = xi;
  for (let j = 1; j <= 3; j++) { e += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); nn += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [E0 + K0 * A * e, K0 * A * nn];
}

export function toLonLat(x: number, y: number): [number, number] {
  const xi = y / (K0 * A), eta = (x - E0) / (K0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  return [LON0 + Math.atan(Math.sinh(ep) / Math.cos(xp)) / rad, phi / rad];
}
