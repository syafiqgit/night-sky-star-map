import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

/**
 * CONFIGURATION
 * MAGNITUDE_LIMIT: 6.5 (Batas visibilitas mata telanjang di lokasi gelap sempurna).
 * Semakin kecil angka ini, semakin sedikit bintang yang diproses (performa meningkat).
 */
const MAGNITUDE_LIMIT = 6.5;
const INPUT_FILE = '../public/data/hyg.csv';
const OUTPUT_FILE = '../public/data/stars.json';

// Pastikan folder output ada
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
  name: string | null;
}

const stars: Star[] = [];
let processedCount = 0;

console.log('--- Star Database Preprocessing Start ---');

fs.createReadStream(INPUT_FILE)
  .pipe(csv())
  .on('data', (row) => {
    processedCount++;
    const mag = parseFloat(row.mag);

    // Filter berdasarkan magnitudo
    if (mag <= MAGNITUDE_LIMIT) {
      stars.push({
        id: parseInt(row.id),
        ra: parseFloat(row.ra),   // Unit: Jam (0-24)
        dec: parseFloat(row.dec), // Unit: Derajat (-90 to 90)
        mag: mag,
        name: row.proper || null  // Nama populer (misal: Sirius, Betelgeuse)
      });
    }

    if (processedCount % 20000 === 0) {
      console.log(`Scanning... ${processedCount} rows checked.`);
    }
  })
  .on('end', () => {
    try {
      // Menggunakan JSON.stringify tanpa spasi (minified) untuk menghemat ukuran file
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars));
      
      const fileSizeKiloBytes = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
      
      console.log('--- Success ---');
      console.log(`Total rows checked: ${processedCount}`);
      console.log(`Stars extracted: ${stars.length}`);
      console.log(`Output file: ${OUTPUT_FILE} (${fileSizeKiloBytes} KB)`);
    } catch (err) {
      console.error('Critical error writing file:', err);
    }
  })
  .on('error', (err) => {
    console.error('Error reading CSV:', err);
  });