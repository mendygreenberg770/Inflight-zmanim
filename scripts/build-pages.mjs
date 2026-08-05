/**
 * Assemble a Cloudflare Pages "advanced mode" deployment from the OpenNext
 * Workers build:  static assets at the root + the worker as a _worker.js/
 * directory. Run after `opennextjs-cloudflare build`; deploy with
 * `npm run deploy:pages`.
 *
 * Note: @opennextjs/cloudflare officially targets Workers — this packaging
 * relies on Pages' _worker.js directory support and its automatic ASSETS
 * binding, which matches what the OpenNext worker expects.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const openNext = ".open-next";
const out = "pages-dist";

if (!existsSync(join(openNext, "worker.js"))) {
  console.error("Run `npx opennextjs-cloudflare build` first — .open-next/worker.js not found.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "_worker.js"), { recursive: true });

// Static assets at the Pages root (served via the automatic ASSETS binding)
cpSync(join(openNext, "assets"), out, { recursive: true });

// Worker entry + everything it imports, as a _worker.js directory
cpSync(join(openNext, "worker.js"), join(out, "_worker.js", "index.js"));
for (const entry of readdirSync(openNext, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== "assets") {
    cpSync(join(openNext, entry.name), join(out, "_worker.js", entry.name), {
      recursive: true,
    });
  }
}

console.log(`Pages bundle assembled in ${out}/`);
