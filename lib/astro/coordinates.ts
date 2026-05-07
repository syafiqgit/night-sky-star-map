// ─── Constants ────────────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Koordinat ekuatorial bintang */
export interface Equatorial {
  /** Right Ascension dalam Jam (0–24) */
  ra: number;
  /** Declination dalam Derajat (−90 – +90) */
  dec: number;
}

/** Lokasi pengamat di permukaan Bumi */
export interface Observer {
  /** Lintang dalam Derajat (−90 – +90, positif = Utara) */
  lat: number;
  /** Bujur dalam Derajat (−180 – +180, positif = Timur) */
  lon: number;
}

/** Koordinat horizontal hasil konversi */
export interface Horizontal {
  /** Ketinggian di atas cakrawala dalam Derajat (−90 – +90) */
  altitude: number;
  /** Azimuth diukur dari Utara searah jarum jam, dalam Derajat (0 – 360) */
  azimuth: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalisasi nilai ke rentang [0, modulus).
 * Aman untuk nilai negatif (berbeda dengan operator % di JS).
 */
function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * Clamp nilai ke rentang [min, max].
 * Digunakan sebelum asin/acos agar tidak melempar NaN akibat floating-point drift.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hitung Local Sidereal Time (LST) untuk lokasi dan waktu tertentu.
 *
 * @param date - Waktu observasi (UTC)
 * @param lon  - Bujur pengamat dalam Derajat
 * @returns LST dalam Jam (0–24)
 */
export function calculateLST(date: Date, lon: number): number {
  // Hari sejak J2000.0 (1 Jan 2000, 12:00 TT)
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0;

  // Greenwich Mean Sidereal Time (GMST) dalam Jam
  const gmst = mod(18.697_374_558 + 24.065_709_824_419_08 * d, 24);

  // Local Sidereal Time: tambahkan offset longitude (15°/jam)
  return mod(gmst + lon / 15, 24);
}

/**
 * Konversi koordinat ekuatorial ke koordinat horizontal (alt-az).
 *
 * Menggunakan formula standar astronomi sferis:
 *   sin(alt) = sin(lat)·sin(dec) + cos(lat)·cos(dec)·cos(H)
 *   cos(Az)  = [sin(dec) − sin(lat)·sin(alt)] / [cos(lat)·cos(alt)]
 *
 * @param star     - Koordinat ekuatorial bintang
 * @param observer - Lokasi pengamat
 * @param date     - Waktu observasi (UTC)
 * @returns Koordinat horizontal dalam Derajat
 */
export function equatorialToHorizontal(
  star: Equatorial,
  observer: Observer,
  date: Date,
): Horizontal {
  // ── 1. Hitung Julian Date & hari sejak J2000.0 ───────────────────────────
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0;

  // ── 2. GMST → LST (dalam Jam) ────────────────────────────────────────────
  const gmst = mod(18.697_374_558 + 24.065_709_824_419_08 * d, 24);
  const lst = mod(gmst + observer.lon / 15, 24);

  // ── 3. Hour Angle (H) dalam Radian ───────────────────────────────────────
  // H = LST − RA; dikalikan 15 untuk konversi Jam → Derajat
  const hAngle = (lst - star.ra) * 15 * DEG_TO_RAD;

  // ── 4. Konversi input ke Radian ───────────────────────────────────────────
  const decRad = star.dec * DEG_TO_RAD;
  const latRad = observer.lat * DEG_TO_RAD;

  // ── 5. Hitung Altitude ────────────────────────────────────────────────────
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hAngle);

  const alt = Math.asin(clamp(sinAlt, -1, 1));

  // ── 6. Hitung Azimuth ─────────────────────────────────────────────────────
  const cosAlt = Math.cos(alt);

  // Hindari pembagian dengan nol saat pengamat di tepat kutub (lat = ±90°)
  const cosAz =
    cosAlt > 1e-10
      ? (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
        (Math.cos(latRad) * cosAlt)
      : Math.sin(decRad) >= 0
        ? 1 // Bintang di arah kutub Utara
        : -1; // Bintang di arah kutub Selatan

  let az = Math.acos(clamp(cosAz, -1, 1));

  // Koreksi kuadran: jika sin(H) > 0, azimuth berada di kuadran Barat (180°–360°)
  if (Math.sin(hAngle) > 0) {
    az = 2 * Math.PI - az;
  }

  // ── 7. Kembalikan dalam Derajat ───────────────────────────────────────────
  return {
    altitude: alt * RAD_TO_DEG,
    azimuth: az * RAD_TO_DEG,
  };
}
