import {
  Equator,
  Illumination,
  JupiterMoons,
  MakeTime,
  Observer,
} from "astronomy-engine";

// Kita definisikan literal type Body secara eksplisit agar bebas error di semua versi TypeScript
type AstroBody =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto";

export interface PlanetData {
  parent?: string | null;
  id: number;
  name: string;
  color?: string;
  rPx?: number;
  radiusPx?: number;
  mag?: number;
  // Membiarkan sisa properti fleksibel agar tidak bentrok dengan masukan data lamamu
  [key: string]: any;
}

export interface SolarSystemObject {
  id: number;
  name: string;
  ra: number; // Derajat (0 - 360)
  dec: number; // Derajat (-90 - 90)
  mag: number;
  color: string;
  radiusPx: number;
  parent?: string | null;
  phase?: number; // Fraksi iluminasi (0.0 - 1.0)
  phaseAngle?: number;
}

// Peta nama fleksibel (mendukung bahasa Indonesia & Inggris) ke standar Body astronomy-engine
const BODY_NAME_MAP: Record<string, AstroBody> = {
  matahari: "Sun",
  sol: "Sun",
  sun: "Sun",
  bulan: "Moon",
  luna: "Moon",
  moon: "Moon",
  merkurius: "Mercury",
  mercury: "Mercury",
  venus: "Venus",
  bumi: "Earth",
  earth: "Earth",
  mars: "Mars",
  yupiter: "Jupiter",
  jupiter: "Jupiter",
  saturnus: "Saturn",
  saturn: "Saturn",
  uranus: "Uranus",
  neptunus: "Neptune",
  neptune: "Neptune",
  pluto: "Pluto",
};

// Instansiasi aman Observer global di posisi atas agar terhindar dari TDZ
const defaultObserver = new Observer(-6.1751, 106.8272, 0);

/**
 * Mendapatkan posisi real-time tata surya menggunakan ketepatan tinggi Astronomy Engine
 */
export function getSolarSystemObjects(
  time: Date,
  solarSystemData: PlanetData[] = [],
  customObserverCoords?: { lat: number; lon: number },
): SolarSystemObject[] {
  const astroTime = MakeTime(time);
  const objects: SolarSystemObject[] = [];

  // Gunakan observer dari parameter jika ada, jika tidak gunakan defaultObserver
  const currentObserver = customObserverCoords
    ? new Observer(customObserverCoords.lat, customObserverCoords.lon, 0)
    : defaultObserver;

  // Peta referensi koordinat geocentris planet induk untuk fallback posisi satelit
  const parentPositions = new Map<string, { ra: number; dec: number }>();

  // Salin array agar tidak memutasi data asli
  const allTargets = [...solarSystemData];

  // Pastikan Matahari (Sun) selalu disisipkan jika belum ada
  if (!allTargets.some((p) => BODY_NAME_MAP[p.name?.toLowerCase()] === "Sun")) {
    allTargets.unshift({
      id: 0,
      name: "Sun",
      color: "#fbbf24",
      radiusPx: 9,
      mag: -26.7,
    });
  }

  // Loop komputasi posisi ephemeris
  for (const item of allTargets) {
    const rawNameKey = item.name?.toLowerCase() || "";
    const stdBody = BODY_NAME_MAP[rawNameKey];

    // --- LOGIKA A: Pemrosesan Objek Utama (Matahari, Bulan, Planet) ---
    if (stdBody && stdBody !== "Earth") {
      try {
        // astronomy-engine butuh casting parameter Body string literal
        const eq = Equator(
          stdBody as any,
          astroTime,
          currentObserver,
          true,
          true,
        );
        const illum = Illumination(stdBody as any, astroTime);
        const mag = item.mag !== undefined ? item.mag : illum.mag;

        // Output aslinya Jam (Hours 0-24), kita konversi ke Derajat (0-360)
        const raDegrees = eq.ra * 15;

        parentPositions.set(item.name, { ra: raDegrees, dec: eq.dec });

        objects.push({
          id: item.id,
          name: item.name === "Sun" ? "Sol" : item.name,
          ra: raDegrees,
          dec: eq.dec,
          mag: mag,
          color: item.color || "#ffffff",
          radiusPx: item.rPx ?? item.radiusPx ?? 4,
          parent: item.parent,
          phase: illum.phase_fraction,
          phaseAngle: illum.phase_angle,
        });
        continue;
      } catch (e) {
        // Jika gagal hitung, lewati ke fallback di bawah
      }
    }

    // --- LOGIKA B: Pemrosesan Akurat Satelit Galilea Jupiter ---
    if (item.parent?.toLowerCase().includes("jupiter")) {
      try {
        const jMoons = JupiterMoons(astroTime);
        let targetMoon: any = null;
        if (rawNameKey.includes("io")) targetMoon = jMoons.io;
        else if (rawNameKey.includes("europa")) targetMoon = jMoons.europa;
        else if (rawNameKey.includes("ganymede")) targetMoon = jMoons.ganymede;
        else if (rawNameKey.includes("callisto")) targetMoon = jMoons.callisto;

        if (targetMoon) {
          const jupEq = Equator(
            "Jupiter" as any,
            astroTime,
            currentObserver,
            true,
            true,
          );
          // Konversi vektor geosentris satelit ke pergeseran sudut RA/Dec
          const raOffset = (targetMoon.x / 1000) * 15;
          const decOffset = targetMoon.y / 1000;

          objects.push({
            id: item.id,
            name: item.name,
            ra: (jupEq.ra * 15 + raOffset + 360) % 360,
            dec: jupEq.dec + decOffset,
            mag: item.mag ?? 5.0,
            color: item.color || "#cbd5e1",
            radiusPx: item.rPx ?? item.radiusPx ?? 2,
            parent: item.parent,
          });
          continue;
        }
      } catch {}
    }

    // --- LOGIKA C: Fallback Satelit/Bulan Lain (Diletakkan di dekat planet induk) ---
    if (item.parent) {
      const parentCoord = parentPositions.get(item.parent);
      if (parentCoord) {
        // Menggeser posisi satelit sedikit agar mengorbit planet induknya secara rapi
        const offsetMultiplier = ((item.id % 5) + 1) * 0.05;
        objects.push({
          id: item.id,
          name: item.name,
          ra: (parentCoord.ra + offsetMultiplier + 360) % 360,
          dec: parentCoord.dec + offsetMultiplier * 0.5,
          mag: item.mag ?? 8.0,
          color: item.color || "#94a3b8",
          radiusPx: item.rPx ?? item.radiusPx ?? 2,
          parent: item.parent,
        });
      }
    }
  }

  return objects;
}
