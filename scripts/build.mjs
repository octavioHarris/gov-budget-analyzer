// Bundles the site into one self-contained file: dist/index.html
// (CSS, JS modules and the JSON dataset inlined). Works from file:// and on any static host.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// Concatenate modules in dependency order, dropping import/export syntax.
const order = ["src/format.js", "src/model.js", "src/charts.js", "src/app.js"];
const stripModules = (src) =>
  src
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, "");
const js = order.map((f) => `// ---- ${f}\n${stripModules(read(f))}`).join("\n");

const index = JSON.parse(read("data/cities/index.json"));
const cities = Object.fromEntries(index.map((c) => [c.id, JSON.parse(read(`data/cities/${c.file}`))]));
const data = JSON.stringify({ index, cities });
let html = read("index.html");
html = html.replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${read("styles.css")}\n</style>`);
html = html.replace(
  /<script type="module" src="src\/app.js"><\/script>/,
  () => `<script>window.__BUDGET_DATA__ = ${data.replace(/</g, "\\u003c")};</script>\n<script>\n(() => {\n${js}\n})();\n</script>`,
);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), html);
console.log(`Wrote dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
