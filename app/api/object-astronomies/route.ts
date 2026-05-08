import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim() || "";
    const showConstellations = searchParams.get("constellations") !== "false";
    const showPlanets = searchParams.get("planets") !== "false";

    const dataDir = path.join(process.cwd(), "public", "data");

    const [starsRaw, constellationsRaw, dsosRaw, solarSystemRaw] = await Promise.all([
      fs.readFile(path.join(dataDir, "stars.json"), "utf8"),
      fs.readFile(path.join(dataDir, "constellations.json"), "utf8"),
      fs.readFile(path.join(dataDir, "dso.json"), "utf8"),
      fs.readFile(path.join(dataDir, "solar-system.json"), "utf8"),
    ]);

    let stars = JSON.parse(starsRaw);
    let dsos = JSON.parse(dsosRaw);
    let constellations = JSON.parse(constellationsRaw);
    let solarSystem = JSON.parse(solarSystemRaw);

    if (!showConstellations) constellations = [];
    if (!showPlanets) solarSystem = [];

    let searchResults: any[] = [];
    if (query.length >= 2) {
      const matchQuery = (obj: any) => obj.name?.toLowerCase().includes(query);
      
      searchResults = [
        ...solarSystem.filter(matchQuery),
        ...stars.filter(matchQuery),
        ...dsos.filter(matchQuery),
      ].slice(0, 6);
    }

    const payload = {
      // Membuang data Sol statis agar tidak tabrakan dengan ephemeris
      stars: stars.filter((s: any) => s.id !== 0 && s.name !== "Sol"),
      constellations,
      dsos,
      solarSystem,
      searchResults,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}