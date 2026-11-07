// Checks the dataset for internal consistency. Run: npm test
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  availableYears, computeDeltas, summarizeDeltas, estimateTax, garbageFees, taxReceipt, referencedSourceIds, parseMoney,
} from "../src/model.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/toronto-budget.json"), "utf8"));

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { failures++; console.error(`  FAIL ${msg}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("Structure");
const { baseYear, compareYear } = data.meta;
const years = availableYears(data);
check(years.includes(baseYear) && years.includes(compareYear), `every program has ${baseYear} and ${compareYear} figures`);
const ids = new Set();
for (const p of data.programs) {
  check(!ids.has(p.id), `program id "${p.id}" is unique`);
  ids.add(p.id);
  check(["official", "derived", "approx"].includes(p.basis), `${p.id}: basis is a known value`);
  check(p.sources?.length > 0, `${p.id}: cites at least one source`);
  check(typeof p.short === "string" && p.short.length <= 26, `${p.id}: has a short label`);
}

console.log("Sources");
const refs = referencedSourceIds(data);
for (const id of refs) check(id in data.sources, `source "${id}" is defined`);
for (const [id, s] of Object.entries(data.sources)) {
  check(/^https:\/\//.test(s.url), `source "${id}" has an https URL`);
  check(refs.has(id), `source "${id}" is referenced somewhere`);
}

console.log("Reported changes match the stored figures");
// Each entry: the change the City reported in its 2026 Budget Notes ($M, %).
const reported = {
  police: [93.8, 7.0], paramedics: [34.929, 24.9], fire: [null, 1.8], shelter: [15.266, 6.9],
  housing: [15.759, 2.7], tchc: [2.519, null], children: [1.817, 1.8], health: [null, 10.1],
  library: [19.834, 7.8], parks: [19.9, 5.6], transportation: [-25.046, -7.6], ttc: [94, null],
};
const rows = computeDeltas(data, baseYear, compareYear);
for (const [id, [dm, dp]] of Object.entries(reported)) {
  const r = rows.find((x) => x.id === id);
  if (dm !== null) check(near(r.delta, dm, 0.2), `${id}: change ${r.delta.toFixed(3)} ≈ reported ${dm}`);
  if (dp !== null) check(near(r.pct, dp, 0.15), `${id}: ${r.pct.toFixed(2)}% ≈ reported ${dp}%`);
}

console.log("Headline arithmetic");
const h = data.headline;
check(near(h.propertyTaxBasePct + h.cityBuildingLevyPct, h.propertyTaxIncreasePct, 1e-9), "0.7% + 1.5% = 2.2%");
check(near(h.taxSupportedGrossB + h.rateSupportedGrossB, h.operatingTotalB, 0.1), "tax + rate supported ≈ $18.9B");
const avg = estimateTax(data, h.avgHomeAssessment);
check(near(avg.tax2026, h.avgHomeMunicipalTax2026, 0.01), `average-home 2026 tax = $${avg.tax2026.toFixed(2)}`);
check(near(avg.increase, h.avgHomeIncrease2026, 1.0), `average-home increase $${avg.increase.toFixed(2)} ≈ City's $${h.avgHomeIncrease2026}`);
for (const t of data.taxHistory) check(near(t.basePct + t.levyPct, t.totalPct, 1e-9), `${t.year}: ${t.basePct}% + ${t.levyPct}% = ${t.totalPct}%`);

const revSum = data.revenue2026.parts.reduce((s, p) => s + p.amountB, 0);
check(near(revSum, data.revenue2026.totalB, 0.01), `revenue parts sum to $${revSum.toFixed(2)}B`);
check(near(data.capital.taxSupportedB + data.capital.rateSupportedB, data.capital.totalB, 0.05), "capital tax + rate ≈ total");

console.log("Utility fees");
const small = garbageFees(data, "Small");
const xl = garbageFees(data, "Extra large");
check(near(small.increase, 11.49, 0.02), `small bin increase $${small.increase.toFixed(2)} ≈ City's $11.49`);
check(near(xl.increase, 21.97, 0.02), `XL bin increase $${xl.increase.toFixed(2)} ≈ City's $21.97`);

console.log("Model helpers");
const receipt = taxReceipt(data, 1000, compareYear);
check(near(receipt.reduce((s, r) => s + r.amount, 0), 1000, 1e-6), "tax receipt sums to the input amount");
check(parseMoney("$692,140") === 692140, "parseMoney handles $ and commas");
const s = summarizeDeltas(rows);
check(near(s.netChange, s.compareTotal - s.baseTotal, 1e-6), "summary net change is consistent");
check(rows[0].delta >= rows[rows.length - 1].delta, "deltas are sorted largest first");

console.log("Timeline");
const dates = data.timeline.map((t) => t.date);
check(dates.every((d, i) => i === 0 || d >= dates[i - 1]), "timeline is in date order");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
