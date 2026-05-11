import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── DAFTAR 20 RASI BINTANG PILIHAN (WHITELIST) ───────────────────────────────
const TARGET_20_IDS = new Set([
  "Ori", // Orion
  "UMa", // Ursa Major
  "UMi", // Ursa Minor
  "Cas", // Cassiopeia
  "Cyg", // Cygnus
  "CMa", // Canis Major
  "Cru", // Crux
  "Peg", // Pegasus
  "Ari", // Aries
  "Tau", // Taurus
  "Gem", // Gemini
  "Cnc", // Cancer
  "Leo", // Leo
  "Vir", // Virgo
  "Lib", // Libra
  "Sco", // Scorpius
  "Sgr", // Sagittarius
  "Cap", // Capricornus
  "Aqr", // Aquarius
  "Psc", // Pisces
]);

const INPUT_LINES = path.join(
  __dirname,
  "../public/data/constellations-lines.json",
);
const INPUT_NAMES = path.join(
  __dirname,
  "../public/data/constellations-names.json",
);
const OUTPUT_FILE = path.join(__dirname, "../public/data/constellations.json");

async function mergeTargetConstellations() {
  try {
    console.log("--- Memulai Ekstraksi 20 Rasi Bintang Pilihan ---");

    const linesData = JSON.parse(fs.readFileSync(INPUT_LINES, "utf8"));
    const namesData = JSON.parse(fs.readFileSync(INPUT_NAMES, "utf8"));

    const mergedData = [];

    for (const nameFeature of namesData.features) {
      const id = nameFeature.id;

      // Filter ketat hanya untuk 20 rasi terpilih
      if (TARGET_20_IDS.has(id)) {
        const lineFeature = linesData.features.find((f: any) => f.id === id);

        if (lineFeature) {
          mergedData.push({
            id: id,
            name: nameFeature.properties.name || id,
            center: nameFeature.geometry.coordinates,
            lines: lineFeature.geometry.coordinates,
          });
        }
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedData));

    const fileSizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
    console.log(`Berhasil! ${mergedData.length} rasi bintang diekstrak.`);
    console.log(`Output: ${OUTPUT_FILE} (${fileSizeKB} KB)`);
  } catch (error) {
    console.error("Gagal memproses data rasi bintang:", error);
  }
}

mergeTargetConstellations();
