import {
  Horizon,
  MakeTime,
  Observer as AstroObserver, // Alias agar tidak bentrok dengan interface lokal
  SiderealTime,
} from "astronomy-engine";

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Menghitung Local Sidereal Time (LST) dalam satuan Jam (0 - 24).
 * Menggunakan model dari astronomy-engine.
 */
export function calculateLST(date: Date, lon: number): number {
  const astroTime = MakeTime(date);
  const gmst = SiderealTime(astroTime);
  const lst = (gmst + lon / 15) % 24;
  return lst < 0 ? lst + 24 : lst;
}

/**
 * Konversi Equatorial (RA/Dec) ke Horizontal (Alt-Az).
 * Menggunakan komputasi presisi tinggi yang mencakup refraksi atmosfer standar.
 */
export function equatorialToHorizontal(
  star: Equatorial,
  observer: Observer,
  date: Date,
): Horizontal {
  const astroTime = MakeTime(date);

  // 1. Bungkus data observer lokal ke instance resmi AstroObserver (height diset 0 meter)
  const engineObserver = new AstroObserver(observer.lat, observer.lon, 0);

  // 2. astronomy-engine meminta nilai RA dalam satuan Jam (Hours: 0-24)
  const raHours = star.ra / 15;

  // 3. Oper argumen dengan urutan yang tepat: (time, observer, ra, dec, refraction)
  const targetHorizon = Horizon(
    astroTime,
    engineObserver,
    raHours,
    star.dec,
    "normal", // "normal" mengaktifkan koreksi pembiasan atmosfer
  );

  return {
    altitude: targetHorizon.altitude,
    azimuth: targetHorizon.azimuth,
  };
}
