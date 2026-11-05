// Turns a photo into the sign-in page background: compressed WebP files in public/images, plus the small
// settings file src/lib/landing-image.json that the page reads.
//
//   npm run image:landing -- "C:\path\to\bunge-tower.jpg" --credit "Photo: Jane Doe, CC BY-SA 4.0" --alt "Bunge Tower, Nairobi"
//
// --credit is shown on the page. Use it whenever the licence needs attribution (Creative Commons does); leave it out
// for a photo that is yours. Only use photos you took or that are licensed for reuse.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const input = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!input) {
  console.error('Usage: npm run image:landing -- <photo.jpg> [--credit "Photo: Name, licence"] [--alt "Description"]');
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "images");
await mkdir(outDir, { recursive: true });

/** Largest quality that keeps the file under the size budget. */
async function encode(width, maxBytes, file) {
  const base = sharp(input).rotate().resize({ width, withoutEnlargement: true });
  let buf;
  for (let quality = 78; quality >= 40; quality -= 6) {
    buf = await base.clone().webp({ quality, effort: 5 }).toBuffer();
    if (buf.length <= maxBytes) break;
  }
  await writeFile(path.join(outDir, file), buf);
  console.log(`${file}: ${(buf.length / 1024).toFixed(0)} KB (${width}px wide)`);
}

await encode(1920, 450 * 1024, "landing.webp"); // desktop
await encode(900, 200 * 1024, "landing-sm.webp"); // phones

const settings = {
  image: { src: "/images/landing.webp", srcSm: "/images/landing-sm.webp", alt: flag("alt") ?? "", credit: flag("credit") ?? "" },
};
await writeFile(path.join(process.cwd(), "src", "lib", "landing-image.json"), JSON.stringify(settings, null, 2) + "\n");
console.log("Updated src/lib/landing-image.json");
