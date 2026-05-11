const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function normalizeAngle(angle: number) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Iterative Kepler Solver (Newton-Raphson)
 * Digunakan untuk mencari Eccentric Anomaly (E) dari Mean Anomaly (M) dan Eccentricity (e)
 */
function solveKepler(M_deg: number, e: number): number {
  let M_rad = M_deg * D2R;
  let E_rad = M_rad; // Initial guess

  // Biasanya 3-5 iterasi sudah sangat cukup untuk presisi astronomi
  for (let i = 0; i < 5; i++) {
    let deltaE =
      (E_rad - e * Math.sin(E_rad) - M_rad) / (1 - e * Math.cos(E_rad));
    E_rad -= deltaE;
  }

  return E_rad * R2D;
}

export interface PlanetData {
  parent: any;
  id: number;
  name: string;
  N: number;
  i: number;
  w: number;
  a: number;
  e: number;
  M: number;
  n: number;
  color: string;
  rPx: number;
  mag: number;
}

export interface SolarSystemObject {
  id: number;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  radiusPx: number;
  phase?: number;
  phaseAngle?: number;
}

export function getSolarSystemObjects(
  time: Date,
  solarSystemData: PlanetData[] = [],
): SolarSystemObject[] {
  const d = (time.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  const objects: SolarSystemObject[] = [];
  const obliquity = 23.4393 - 3.563e-7 * d;

  // 1. Hitung Posisi Matahari & Bumi
  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = normalizeAngle(356.047 + 0.9856002585 * d);
  const E_Sun = solveKepler(MSun, eSun);

  const xSun = Math.cos(E_Sun * D2R) - eSun;
  const ySun = Math.sin(E_Sun * D2R) * Math.sqrt(1 - eSun * eSun);
  const rSun = Math.sqrt(xSun * xSun + ySun * ySun);
  const vSun = Math.atan2(ySun, xSun) * R2D;
  const lonSun = normalizeAngle(vSun + wSun);

  // Vektor Heliocentris Bumi (Kebalikan dari Matahari terhadap Bumi)
  const earthX = -rSun * Math.cos(lonSun * D2R);
  const earthY = -rSun * Math.sin(lonSun * D2R);
  const earthZ = 0;

  // Map untuk menyimpan posisi Heliocentris Planet (untuk referensi Satelit)
  const helioPositions = new Map<
    string,
    { xh: number; yh: number; zh: number }
  >();

  // Tambahkan Matahari ke output
  const xEqSun = rSun * Math.cos(lonSun * D2R);
  const yEqSun = rSun * Math.sin(lonSun * D2R) * Math.cos(obliquity * D2R);
  const zEqSun = rSun * Math.sin(lonSun * D2R) * Math.sin(obliquity * D2R);
  let raSun = Math.atan2(yEqSun, xEqSun) * R2D;
  if (raSun < 0) raSun += 360;
  objects.push({
    id: 0,
    name: "Sol",
    ra: raSun / 15,
    dec: Math.asin(zEqSun / rSun) * R2D,
    mag: -26.7,
    color: "#fbbf24",
    radiusPx: 9,
  });

  // 2. Pisahkan Planet dan Satelit
  const planets = solarSystemData.filter((p) => !p.parent);
  const moons = solarSystemData.filter((p) => p.parent);

  // 3. Proses Planet Utama
  for (const p of planets) {
    const pos = calculateHelioVector(p, d);
    helioPositions.set(p.name, pos);

    const geoPos = convertToGeocentric(
      pos.xh,
      pos.yh,
      pos.zh,
      earthX,
      earthY,
      earthZ,
      obliquity,
    );
    objects.push({
      id: p.id,
      name: p.name,
      ...geoPos,
      mag: p.mag,
      color: p.color,
      radiusPx: p.rPx,
    });
  }

  // 4. Proses Satelit (Moons)
  for (const m of moons) {
    const parentPos = helioPositions.get(m.parent!);
    if (!parentPos) continue;

    // Hitung posisi relatif satelit terhadap planet (Planetocentric)
    const moonRelPos = calculateHelioVector(m, d);

    // Vektor Heliocentris Satelit = Vektor Planet + Vektor Satelit
    const xh = parentPos.xh + moonRelPos.xh;
    const yh = parentPos.yh + moonRelPos.yh;
    const zh = parentPos.zh + moonRelPos.zh;

    const geoPos = convertToGeocentric(
      xh,
      yh,
      zh,
      earthX,
      earthY,
      earthZ,
      obliquity,
    );
    objects.push({
      id: m.id,
      name: m.name,
      ...geoPos,
      mag: m.mag,
      color: m.color,
      radiusPx: m.rPx,
    });
  }

  return objects;
}

/**
 * Helper: Hitung Vektor Heliocentris / Planetocentris
 */
function calculateHelioVector(p: PlanetData, d: number) {
  const M = normalizeAngle(p.M + p.n * d);
  const E = solveKepler(M, p.e);
  const xv = p.a * (Math.cos(E * D2R) - p.e);
  const yv = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E * D2R);
  const v = Math.atan2(yv, xv) * R2D;
  const r = Math.sqrt(xv * xv + yv * yv);

  const xh =
    r *
    (Math.cos(p.N * D2R) * Math.cos((v + p.w) * D2R) -
      Math.sin(p.N * D2R) * Math.sin((v + p.w) * D2R) * Math.cos(p.i * D2R));
  const yh =
    r *
    (Math.sin(p.N * D2R) * Math.cos((v + p.w) * D2R) +
      Math.cos(p.N * D2R) * Math.sin((v + p.w) * D2R) * Math.cos(p.i * D2R));
  const zh = r * (Math.sin((v + p.w) * D2R) * Math.sin(p.i * D2R));

  return { xh, yh, zh };
}

/**
 * Helper: Konversi Heliocentris ke Geocentris RA/Dec
 */
function convertToGeocentric(
  xh: number,
  yh: number,
  zh: number,
  ex: number,
  ey: number,
  ez: number,
  obl: number,
) {
  const xg = xh - ex;
  const yg = yh - ey;
  const zg = zh - ez;

  const xEq = xg;
  const yEq = yg * Math.cos(obl * D2R) - zg * Math.sin(obl * D2R);
  const zEq = yg * Math.sin(obl * D2R) + zg * Math.cos(obl * D2R);

  let ra = Math.atan2(yEq, xEq) * R2D;
  if (ra < 0) ra += 360;
  const dec = Math.atan2(zEq, Math.sqrt(xEq * xEq + yEq * yEq)) * R2D;

  return { ra: ra / 15, dec };
}
