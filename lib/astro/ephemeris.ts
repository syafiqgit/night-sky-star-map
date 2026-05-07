/**
 * Ephemeris Calculator (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto)
 * Menggunakan elemen orbit Keplerian J2000.
 */

export interface SolarSystemObject {
  id: number;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  radiusPx: number;
  phase?: number; // Khusus Bulan: 0 (Baru) hingga 1 (Purnama)
  phaseAngle?: number; // Rotasi terminator fase bulan
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function getSolarSystemObjects(time: Date): SolarSystemObject[] {
  // Hari sejak J2000.0 (1 Januari 2000, 12:00 UTC)
  const d = (time.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  const objects: SolarSystemObject[] = [];
  const obliquity = 23.4393 - 3.563e-7 * d;

  // ─── 1. MATAHARI ────────────────────────────────────────────────────────
  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = normalizeAngle(356.047 + 0.9856002585 * d);
  const E_Sun = MSun + eSun * R2D * Math.sin(MSun * D2R) * (1 + eSun * Math.cos(MSun * D2R));
  
  const xSun = Math.cos(E_Sun * D2R) - eSun;
  const ySun = Math.sin(E_Sun * D2R) * Math.sqrt(1 - eSun * eSun);
  const rSun = Math.sqrt(xSun * xSun + ySun * ySun);
  const vSun = Math.atan2(ySun, xSun) * R2D;
  const lonSun = normalizeAngle(vSun + wSun);

  const xEqSun = rSun * Math.cos(lonSun * D2R);
  const yEqSun = rSun * Math.sin(lonSun * D2R) * Math.cos(obliquity * D2R);
  const zEqSun = rSun * Math.sin(lonSun * D2R) * Math.sin(obliquity * D2R);

  let raSun = Math.atan2(yEqSun, xEqSun) * R2D;
  if (raSun < 0) raSun += 360;
  raSun /= 15;
  const decSun = Math.asin(zEqSun / rSun) * R2D;

  objects.push({ id: -1, name: "Sun", ra: raSun, dec: decSun, mag: -26.7, color: "#fbbf24", radiusPx: 9 });

  // ─── 2. BULAN & FASE BULAN ──────────────────────────────────────────────
  const LMoon = normalizeAngle(218.316 + 13.176396 * d);
  const MMoon = normalizeAngle(134.963 + 13.064993 * d);
  const FMoon = normalizeAngle(93.272 + 13.22935 * d);

  const lonMoon = LMoon + 6.289 * Math.sin(MMoon * D2R);
  const latMoon = 5.128 * Math.sin(FMoon * D2R);

  const xMoon = Math.cos(lonMoon * D2R) * Math.cos(latMoon * D2R);
  const yMoon = Math.sin(lonMoon * D2R) * Math.cos(latMoon * D2R) * Math.cos(obliquity * D2R) - Math.sin(latMoon * D2R) * Math.sin(obliquity * D2R);
  const zMoon = Math.sin(lonMoon * D2R) * Math.cos(latMoon * D2R) * Math.sin(obliquity * D2R) + Math.sin(latMoon * D2R) * Math.cos(obliquity * D2R);

  let raMoon = Math.atan2(yMoon, xMoon) * R2D;
  if (raMoon < 0) raMoon += 360;
  raMoon /= 15;
  const decMoon = Math.asin(zMoon) * R2D;

  // Hitung Fase Bulan
  const elongation = Math.acos(Math.cos(decSun * D2R) * Math.cos(decMoon * D2R) * Math.cos((raSun - raMoon) * 15 * D2R) + Math.sin(decSun * D2R) * Math.sin(decMoon * D2R));
  const phase = (1 - Math.cos(elongation)) / 2;
  
  const phaseAngle = Math.atan2(Math.sin((raSun - raMoon) * 15 * D2R) * Math.cos(decSun * D2R), Math.sin(decSun * D2R) * Math.cos(decMoon * D2R) - Math.cos(decSun * D2R) * Math.sin(decMoon * D2R) * Math.cos((raSun - raMoon) * 15 * D2R));

  objects.push({ id: -2, name: "Moon", ra: raMoon, dec: decMoon, mag: -12.7, color: "#f8fafc", radiusPx: 7, phase, phaseAngle });

  // ─── 3. PLANET TATA SURYA (Keplerian Elements) ──────────────────────────
  const earthX = -rSun * Math.cos(lonSun * D2R);
  const earthY = -rSun * Math.sin(lonSun * D2R);

  const planetsData = [
    { id: -7, name: "Mercury", N: 48.33, i: 7.00, w: 29.12, a: 0.3871, e: 0.2056, M: 168.66, n: 4.09233, color: "#a8a29e", rPx: 3.5, mag: 0.0 }, // Abu-abu
    { id: -3, name: "Venus", N: 76.68, i: 3.39, w: 54.89, a: 0.7233, e: 0.0067, M: 50.11, n: 1.60213, color: "#fdf8f5", rPx: 5.5, mag: -4.4 }, // Putih krem
    { id: -4, name: "Mars", N: 49.56, i: 1.85, w: 286.50, a: 1.5237, e: 0.0934, M: 19.37, n: 0.52402, color: "#ef4444", rPx: 4.5, mag: -1.0 }, // Merah
    { id: -5, name: "Jupiter", N: 100.46, i: 1.30, w: 273.87, a: 5.2026, e: 0.0484, M: 20.02, n: 0.08308, color: "#fdba74", rPx: 6.0, mag: -2.5 }, // Oranye
    { id: -6, name: "Saturn", N: 113.66, i: 2.48, w: 339.39, a: 9.5549, e: 0.0555, M: 317.02, n: 0.03344, color: "#fef08a", rPx: 5.0, mag: 0.4 }, // Kuning Pucat
    { id: -8, name: "Uranus", N: 74.00, i: 0.77, w: 96.66, a: 19.1817, e: 0.0473, M: 142.59, n: 0.01172, color: "#93c5fd", rPx: 3.8, mag: 5.7 }, // Biru Muda
    { id: -9, name: "Neptune", N: 131.78, i: 1.77, w: 272.84, a: 30.0583, e: 0.0086, M: 260.24, n: 0.00599, color: "#3b82f6", rPx: 3.8, mag: 7.8 }, // Biru
    { id: -10, name: "Pluto", N: 110.30, i: 17.14, w: 113.76, a: 39.4816, e: 0.2488, M: 14.88, n: 0.00396, color: "#d6d3d1", rPx: 2.5, mag: 14.0 } // Abu-abu gelap (sangat redup)
  ];

  for (const p of planetsData) {
    const M = normalizeAngle(p.M + p.n * d);
    const E = M + p.e * R2D * Math.sin(M * D2R);
    const xv = p.a * (Math.cos(E * D2R) - p.e);
    const yv = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E * D2R);
    const v = Math.atan2(yv, xv) * R2D;
    const r = Math.sqrt(xv * xv + yv * yv);

    const xh = r * (Math.cos(p.N * D2R) * Math.cos((v + p.w) * D2R) - Math.sin(p.N * D2R) * Math.sin((v + p.w) * D2R) * Math.cos(p.i * D2R));
    const yh = r * (Math.sin(p.N * D2R) * Math.cos((v + p.w) * D2R) + Math.cos(p.N * D2R) * Math.sin((v + p.w) * D2R) * Math.cos(p.i * D2R));
    const zh = r * (Math.sin((v + p.w) * D2R) * Math.sin(p.i * D2R));

    // Geocentric (Posisi relatif dari Bumi)
    const xg = xh - earthX;
    const yg = yh - earthY;
    const zg = zh;

    const xEq = xg;
    const yEq = yg * Math.cos(obliquity * D2R) - zg * Math.sin(obliquity * D2R);
    const zEq = yg * Math.sin(obliquity * D2R) + zg * Math.cos(obliquity * D2R);

    let ra = Math.atan2(yEq, xEq) * R2D;
    if (ra < 0) ra += 360;
    ra /= 15;
    const dec = Math.atan2(zEq, Math.sqrt(xEq * xEq + yEq * yEq)) * R2D;

    objects.push({ id: p.id, name: p.name, ra, dec, mag: p.mag, color: p.color, radiusPx: p.rPx });
  }

  return objects;
}