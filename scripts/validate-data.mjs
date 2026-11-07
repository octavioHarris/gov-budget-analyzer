// Checks every city dataset for structure and internal consistency. Run: npm test
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  availableYears, computeDeltas, summarizeDeltas, estimateTax, garbageFees, taxReceipt, referencedSourceIds,
  parseMoney, commitmentSummary, outcomeDirection, COMMITMENT_STATUSES, perHousehold,
} from "../src/model.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const citiesDir = join(root, "data/cities");
const index = JSON.parse(readFileSync(join(citiesDir, "index.json"), "utf8"));

let failures = 0;
let passes = 0;
const check = (cond, msg) => {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL ${msg}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Generic model checks (independent of any city)
check(parseMoney("$692,140") === 692140, "parseMoney handles $ and commas");
check(outcomeDirection({ better: "lower", before: { value: 10 }, after: { value: 8 } }) === "improved", "lower-is-better improvement");
check(outcomeDirection({ better: "higher", before: { value: 10 }, after: { value: 8 } }) === "worsened", "higher-is-better decline");
check(outcomeDirection({ better: "lower", before: null, after: { value: 8 } }) === "none", "no baseline → none");

for (const entry of index) {
  console.log(`\n${entry.name} (${entry.file})`);
  const data = JSON.parse(readFileSync(join(citiesDir, entry.file), "utf8"));
  const tag = (m) => `[${entry.id}] ${m}`;
  const m = data.meta;

  // --- structure
  check(m.id === entry.id, tag("meta.id matches index"));
  for (const k of ["cityName", "jurisdiction", "locale", "currency", "baseYear", "compareYear", "lastUpdated", "netDefinition"]) {
    check(m[k] !== undefined && m[k] !== "", tag(`meta.${k} present`));
  }
  check(m.leader?.title && m.leader?.name, tag("meta.leader has title and name"));
  check(Number.isFinite(m.households) && m.households > 0, tag("meta.households is a positive number"));
  const years = availableYears(data);
  check(years.includes(m.baseYear) && years.includes(m.compareYear), tag(`every program has ${m.baseYear} and ${m.compareYear}`));

  const ids = new Set();
  for (const p of data.programs) {
    check(!ids.has(p.id), tag(`program id "${p.id}" unique`));
    ids.add(p.id);
    check(["official", "derived", "approx"].includes(p.basis), tag(`${p.id}: basis valid`));
    check(p.sources?.length > 0, tag(`${p.id}: cites a source`));
    check(typeof p.short === "string" && p.short.length <= 26, tag(`${p.id}: short label ≤ 26 chars`));
    for (const o of p.outcomes ?? []) {
      check(["lower", "higher"].includes(o.better), tag(`${p.id}: outcome "${o.metric}" says which direction is better`));
      check(o.after && Number.isFinite(o.after.value), tag(`${p.id}: outcome "${o.metric}" has a current value`));
      check(o.sources?.length > 0, tag(`${p.id}: outcome "${o.metric}" cites a source`));
    }
  }

  for (const c of data.commitments ?? []) {
    check(COMMITMENT_STATUSES.includes(c.status), tag(`commitment "${c.id}" status valid`));
    check(c.program === null || ids.has(c.program), tag(`commitment "${c.id}" links to a known program`));
    check(c.sources?.length > 0, tag(`commitment "${c.id}" cites a source`));
  }
  const cs = commitmentSummary(data);
  check(Object.values(cs.counts).reduce((a, b) => a + b, 0) === cs.total, tag("commitment counts add up"));

  // --- sources
  const refs = referencedSourceIds(data);
  for (const id of refs) check(id in data.sources, tag(`source "${id}" defined`));
  for (const [id, s] of Object.entries(data.sources)) {
    check(/^https:\/\//.test(s.url), tag(`source "${id}" has an https URL`));
    check(refs.has(id), tag(`source "${id}" is used`));
  }

  // --- figures match what the government reported
  const rows = computeDeltas(data, m.baseYear, m.compareYear);
  for (const [id, [dm, dp]] of Object.entries(data.checks?.reportedChanges ?? {})) {
    const r = rows.find((x) => x.id === id);
    check(!!r, tag(`reported change refers to program "${id}"`));
    if (!r) continue;
    if (dm !== null) check(near(r.delta, dm, 0.2), tag(`${id}: change ${r.delta.toFixed(3)} ≈ reported ${dm}`));
    if (dp !== null) check(near(r.pct, dp, 0.15), tag(`${id}: ${r.pct.toFixed(2)}% ≈ reported ${dp}%`));
  }

  // --- arithmetic
  const h = data.headline;
  check(near(h.propertyTaxBasePct + h.cityBuildingLevyPct, h.propertyTaxIncreasePct, 1e-9), tag("tax components sum to total"));
  check(near(h.taxSupportedGrossB + h.rateSupportedGrossB, h.operatingTotalB, 0.1), tag("tax + rate supported ≈ operating total"));
  const avg = estimateTax(data, h.avgHomeAssessment);
  check(near(avg.taxAfter, h.avgHomeMunicipalTax, 0.01), tag("average-home tax reproduces"));
  if (data.checks?.avgHomeIncrease) check(near(avg.increase, data.checks.avgHomeIncrease, 1.0), tag(`average-home increase $${avg.increase.toFixed(2)} ≈ reported`));
  for (const t of data.taxHistory) check(near(t.basePct + t.levyPct, t.totalPct, 1e-9), tag(`${t.year}: tax parts sum`));
  const revSum = data.revenue.parts.reduce((s, p) => s + p.amountB, 0);
  check(near(revSum, data.revenue.totalB, 0.01), tag(`revenue parts sum ($${revSum.toFixed(2)}B)`));
  if (data.capital) check(near(data.capital.taxSupportedB + data.capital.rateSupportedB, data.capital.totalB, 0.05), tag("capital parts ≈ total"));
  for (const [size, inc] of Object.entries(data.checks?.garbageIncreases ?? {})) {
    check(near(garbageFees(data, size).increase, inc, 0.02), tag(`${size} bin increase ≈ $${inc}`));
  }
  const receipt = taxReceipt(data, 1000, m.compareYear);
  check(near(receipt.reduce((s, r) => s + r.amount, 0), 1000, 1e-6), tag("tax receipt sums to input"));
  const s = summarizeDeltas(rows);
  check(near(s.netChange, s.compareTotal - s.baseTotal, 1e-6), tag("net change consistent"));
  check(near(perHousehold(data, 1), 1e6 / m.households, 1e-9), tag("per-household conversion"));

  const dates = data.timeline.map((t) => t.date);
  check(dates.every((d, i) => i === 0 || d >= dates[i - 1]), tag("timeline in date order"));
  console.log(`  ${rows.length} programs, ${(data.commitments ?? []).length} commitments, ${Object.keys(data.sources).length} sources`);
}

console.log(failures ? `\n${failures} check(s) failed, ${passes} passed` : `\nAll ${passes} checks passed`);
process.exit(failures ? 1 : 0);
