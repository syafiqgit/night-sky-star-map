import fs from "fs";

const raw = fs.readFileSync("../public/data/stars.json", "utf-8");
const stars = JSON.parse(raw);

const fixed = stars.map((star: any, index: number) => ({
  ...star,
  id: index + 1,
}));

fs.writeFileSync("../public/data/stars.json", JSON.stringify(fixed, null, 2));

console.log("ID berhasil diurutkan ulang dari 1");
