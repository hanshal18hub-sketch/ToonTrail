import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const assetDir = "dist/assets";
const files = await readdir(assetDir);
const cssFile = files.find((file) => file.endsWith(".css"));
const jsFile = files.find((file) => file.endsWith(".js"));

if (!cssFile || !jsFile) throw new Error("Missing built CSS or JavaScript asset");

const css = await readFile(join(assetDir, cssFile), "utf8");
const js = (await readFile(join(assetDir, jsFile), "utf8")).replaceAll("</script>", "<\\/script>");
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="ToonTrail helps readers discover, track, and safely find manga, manhwa, and manhua."><meta name="robots" content="index,follow"><meta property="og:title" content="ToonTrail"><meta property="og:description" content="Find it. Read it. Never lose your place."><title>ToonTrail — Manga, Manhwa & Manhua</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`;

const template = await readFile("server/worker-template.js", "utf8");
const catalogSeedText = await readFile("data/catalog-seed.json", "utf8");
const catalogSeed = JSON.parse(catalogSeedText);
const catalogSeedVersion = createHash("sha256").update(catalogSeedText).digest("hex").slice(0,16);
const worker = template
  .replace("__TOONTRAIL_HTML__", () => JSON.stringify(html))
  .replace("__TOONTRAIL_CATALOG_SEED__", () => JSON.stringify(catalogSeed))
  .replace("__TOONTRAIL_CATALOG_SEED_VERSION__", () => JSON.stringify(catalogSeedVersion));

await mkdir("dist/server", { recursive: true });
await writeFile("dist/server/index.js", worker);
