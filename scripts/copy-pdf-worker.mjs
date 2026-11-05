// Copies pdf.js's worker into public/ so the browser can load it from our own site (the CSP only allows same-site
// workers). Runs after every install, so it always matches the installed pdfjs-dist version.
import { copyFile, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const src = path.join(root, "build", "pdf.worker.min.mjs");
const dest = path.join(process.cwd(), "public", "pdf.worker.min.mjs");
await mkdir(path.dirname(dest), { recursive: true });
await copyFile(src, dest);
// Font and character-map files pdf.js needs to draw text in previews exactly.
for (const dir of ["standard_fonts", "cmaps"]) {
  await cp(path.join(root, dir), path.join(process.cwd(), "public", "pdfjs", dir), { recursive: true });
}
console.log("Copied the pdf.js worker, fonts and character maps to public/");
