import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "../icons");
const svgPath = path.join(iconsDir, "src/icon.svg");
const svgBuffer = readFileSync(svgPath);

const sizes = [16, 32, 48, 128];

await Promise.all(
  sizes.map((size) =>
    sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon${size}.png`))
  )
);

console.log(`Generated icons: ${sizes.join(", ")}`);
