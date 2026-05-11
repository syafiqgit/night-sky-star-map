import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

/**
 * KONFIGURASI
 * MAGNITUDE_LIMIT 6.5 adalah batas standar visibilitas mata telanjang di langit yang sangat gelap.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAGNITUDE_LIMIT = 6.5;
const INPUT_FILE = path.join(__dirname, "../public/data/hyg.csv");
const OUTPUT_FILE = path.join(__dirname, "../public/data/stars.json");

// Pastikan direktori output tersedia
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Struktur data yang dioptimasi untuk Frontend
interface Star {
  id: number;
  ra: number; // Right Ascension dalam derajat (0-360)
  dec: number; // Declination dalam derajat
  mag: number; // Apparent Magnitude
  name: string | null; // Proper name (e.g., Sirius)
  sciName: string | null; // Bayer/Flamsteed (e.g., Alp CMa)
  bv: number | null; // Color Index (untuk suhu & warna)
  dist: number | null; // Distance dalam Light Years
  con: string | null; // Constellation abbreviation
}

const stars: Star[] = [];
let processedCount = 0;

console.log("--- Memulai Preprocessing Database Bintang ---");

fs.createReadStream(INPUT_FILE)
  .pipe(csv())
  .on("data", (row) => {
    processedCount++;
    const mag = parseFloat(row.mag);

    // Filter berdasarkan batas kecerahan agar file JSON tidak terlalu berat
    if (mag <= MAGNITUDE_LIMIT) {
      /**
       * OPTIMASI 1: Konversi RA
       * Di database asli, RA dalam format jam (0-24).
       * Kita konversi ke derajat (0-360) dengan mengalikan 15 agar frontend lebih ringan.
       */
      const raDegrees = parseFloat(row.ra) * 15;

      /**
       * OPTIMASI 2: Konversi Jarak
       * Database asli menggunakan Parsecs. Kita konversi ke Tahun Cahaya (LY).
       * 1 Parsec = ~3.26156 Light Years.
       */
      const distanceLY = row.dist
        ? parseFloat((parseFloat(row.dist) * 3.26156).toFixed(2))
        : null;

      stars.push({
        id: parseInt(row.id),
        ra: parseFloat(raDegrees.toFixed(4)),
        dec: parseFloat(parseFloat(row.dec).toFixed(6)),
        mag: mag,
        name: row.proper || null,
        sciName: row.bf || null,
        bv: row.ci ? parseFloat(row.ci) : null,
        dist: distanceLY,
        con: row.con || null,
      });
    }

    if (processedCount % 20000 === 0) {
      console.log(`Memproses... ${processedCount} baris diperiksa.`);
    }
  })
  .on("end", () => {
    try {
      // Urutkan berdasarkan magnitudo (paling terang duluan)
      // Ini berguna agar jika kita ingin membatasi render, kita merender bintang paling terang dulu.
      stars.sort((a, b) => a.mag - b.mag);

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars));

      const fileSizeMB = (
        fs.statSync(OUTPUT_FILE).size /
        (1024 * 1024)
      ).toFixed(2);

      console.log("\n--- Ekstraksi Selesai ---");
      console.log(`Total baris diperiksa : ${processedCount}`);
      console.log(`Bintang diekstrak     : ${stars.length}`);
      console.log(`Ukuran file akhir     : ${fileSizeMB} MB`);
      console.log(`Lokasi file           : ${OUTPUT_FILE}`);
    } catch (err) {
      console.error("Gagal menulis file JSON:", err);
    }
  })
  .on("error", (err) => {
    console.error("Gagal membaca file CSV:", err);
  });
