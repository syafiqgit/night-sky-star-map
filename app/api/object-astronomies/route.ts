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

    const [starsRaw, dsosRaw, solarSystemRaw, constellationsRaw] =
      await Promise.all([
        fs.readFile(path.join(dataDir, "stars.json"), "utf8"),
        fs.readFile(path.join(dataDir, "dso.json"), "utf8"),
        fs.readFile(path.join(dataDir, "solar-system.json"), "utf8"),
        fs.readFile(path.join(dataDir, "constellations.json"), "utf8"),
      ]);

    let stars = JSON.parse(starsRaw);
    let dsos = JSON.parse(dsosRaw);
    let solarSystem = JSON.parse(solarSystemRaw);
    let constellations = JSON.parse(constellationsRaw);

    if (!showConstellations) constellations = [];
    if (!showPlanets) solarSystem = [];

    let searchResults: any[] = [];
    if (query.length >= 2) {
      const matchQuery = (obj: any) => obj.name?.toLowerCase().includes(query);

      const matchConstellation = (con: any) => {
        const nameStr = con.name || con.id || "";
        return nameStr.toLowerCase().includes(query);
      };

      searchResults = [
        ...solarSystem.filter(matchQuery),
        // ─── PERBAIKAN: Baca RA murni dari center[0], TANPA MIRRORING ───
        ...constellations.filter(matchConstellation).map((con: any) => ({
          id: con.id,
          name: con.name,
          type: "Constellation",
          ra: con.center[0],
          dec: con.center[1],
        })),
        ...stars.filter(matchQuery),
        ...dsos.filter(matchQuery),
      ].slice(0, 6);
    }

    const payload = {
      stars: stars.filter((s: any) => s.id !== 0 && s.name !== "Sol"),
      dsos,
      solarSystem,
      constellations,
      searchResults,
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
