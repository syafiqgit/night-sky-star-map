import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim() || "";
    const showConstellations = searchParams.get("constellations") !== "false";
    const showPlanets = searchParams.get("planets") !== "false";
    const showMinorBodies = searchParams.get("minorBodies") !== "false";
    const showSatellites = searchParams.get("satellites") !== "false";
    const showMeteorShowers = searchParams.get("meteorShowers") !== "false";

    const dataDir = path.join(process.cwd(), "public", "data");

    // ─── PERBAIKAN: Tambahkan minor-bodies.json ke dalam Promise.all ───
    // Menggunakan catch fallback agar API tetap aman jika file belum tersedia
    const [
      starsRaw,
      dsosRaw,
      solarSystemRaw,
      constellationsRaw,
      minorBodiesRaw,
      satellitesRaw,
      meteorShowersRaw,
    ] = await Promise.all([
      fs.readFile(path.join(dataDir, "stars.json"), "utf8"),
      fs.readFile(path.join(dataDir, "dso.json"), "utf8"),
      fs.readFile(path.join(dataDir, "solar-system.json"), "utf8"),
      fs.readFile(path.join(dataDir, "constellations.json"), "utf8"),
      fs
        .readFile(path.join(dataDir, "minor-bodies.json"), "utf8")
        .catch(() => "[]"),
      fs
        .readFile(path.join(dataDir, "satellites.json"), "utf8")
        .catch(() => "[]"),
      fs
        .readFile(path.join(dataDir, "meteor-showers.json"), "utf8")
        .catch(() => "[]"),
    ]);

    let stars = JSON.parse(starsRaw);
    let dsos = JSON.parse(dsosRaw);
    let solarSystem = JSON.parse(solarSystemRaw);
    let constellations = JSON.parse(constellationsRaw);
    let minorBodies = JSON.parse(minorBodiesRaw);
    let satellites = JSON.parse(satellitesRaw);
    let meteorShowers = JSON.parse(meteorShowersRaw);

    if (!showConstellations) constellations = [];
    if (!showPlanets) solarSystem = [];
    if (!showMinorBodies) minorBodies = [];
    if (!showSatellites) satellites = [];
    if (!showSatellites) meteorShowers = [];

    let searchResults: any[] = [];
    if (query.length >= 2) {
      const matchQuery = (obj: any) => obj.name?.toLowerCase().includes(query);

      const matchConstellation = (con: any) => {
        const nameStr = con.name || con.id || "";
        return nameStr.toLowerCase().includes(query);
      };

      // ─── PERBAIKAN: Masukkan minorBodies ke dalam daftar pencarian ───
      searchResults = [
        ...solarSystem.filter(matchQuery),
        ...minorBodies.filter(matchQuery), // Komet dan Asteroid akan muncul di hasil pencarian
        ...constellations.filter(matchConstellation).map((con: any) => ({
          id: con.id,
          name: con.name,
          type: "Constellation",
          ra: con.center[0],
          dec: con.center[1],
        })),
        ...stars.filter(matchQuery),
        ...dsos.filter(matchQuery),
        ...satellites.filter(matchQuery),
        ...meteorShowers.filter(matchQuery),
      ].slice(0, 6);
    }

    // ─── PERBAIKAN: Sertakan minorBodies pada objek payload balikan ───
    const payload = {
      stars: stars.filter((s: any) => s.id !== 0 && s.name !== "Sol"),
      dsos,
      solarSystem,
      constellations,
      minorBodies,
      searchResults,
      satellites,
      meteorShowers,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
