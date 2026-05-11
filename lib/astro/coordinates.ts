// ─── Constants ────────────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Equatorial {
  ra: number; // Derajat (0 – 360)
  dec: number; // Derajat (-90 – +90)
}

export interface Observer {
  lat: number; // Derajat (-90 – +90)
  lon: number; // Derajat (-180 – +180)
}

export interface Horizontal {
  altitude: number;
  azimuth: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Menghitung Local Sidereal Time (LST).
 */
export function calculateLST(date: Date, lon: number): number {
  // Julian Date untuk tengah hari 1 Jan 2000 adalah 2451545.0
  // getTime() / 86.4e6 + 2440587.5 adalah konversi standar Unix Epoch ke JD
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0;

  // Formula GMST (Greenwich Mean Sidereal Time) presisi menengah
  const gmst = mod(18.697_374_558 + 24.065_709_824_419_08 * d, 24);

  return mod(gmst + lon / 15, 24);
}

/**
 * Konversi Equatorial ke Horizontal (Alt-Az).
 * Versi ini diperbaiki menggunakan atan2 untuk akurasi kuadran dan stabilitas kutub.
 */
export function equatorialToHorizontal(
  star: Equatorial,
  observer: Observer,
  date: Date,
): Horizontal {
  const lst = calculateLST(date, observer.lon);

  // 1. Hitung Hour Angle (H) dalam Radian
  // H = LST - RA. LST dikali 15 agar menjadi derajat.
  const hAngleDeg = mod(lst * 15 - star.ra, 360);
  const hRad = hAngleDeg * DEG_TO_RAD;
  const decRad = star.dec * DEG_TO_RAD;
  const latRad = observer.lat * DEG_TO_RAD;

  // 2. Hitung Altitude (Ketinggian)
  // sin(alt) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(H)
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hRad);

  const altRad = Math.asin(clamp(sinAlt, -1, 1));

  // 3. Hitung Azimuth menggunakan atan2 (Lebih akurat & stabil)
  // Rumus komponen y dan x untuk mendapatkan azimuth dari Utara (0°) ke Timur (90°)
  // y = -sin(H)cos(dec)
  // x = cos(lat)sin(dec) - sin(lat)cos(dec)cos(H)
  const y = -Math.sin(hRad) * Math.cos(decRad);
  const x =
    Math.cos(latRad) * Math.sin(decRad) -
    Math.sin(latRad) * Math.cos(decRad) * Math.cos(hRad);

  let azDeg = Math.atan2(y, x) * RAD_TO_DEG;

  // Normalisasi azimuth ke 0-360 derajat
  azDeg = mod(azDeg, 360);

  return {
    altitude: altRad * RAD_TO_DEG,
    azimuth: azDeg,
  };
}
