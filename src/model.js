// Pure data functions: no DOM. Imported by the app and by the test script.

/** Years that every program has a net figure for, ascending. */
export function availableYears(data) {
  const sets = data.programs.map((p) => new Set(Object.keys(p.net)));
  const all = [...sets[0]].filter((y) => sets.every((s) => s.has(y)));
  return all.map(Number).sort((a, b) => a - b);
}

/**
 * Year-over-year change for each program.
 * Returns rows sorted by the chosen measure, largest increase first.
 */
export function computeDeltas(data, baseYear, compareYear, measure = "abs") {
  const rows = data.programs.map((p) => {
    const base = p.net[String(baseYear)];
    const compare = p.net[String(compareYear)];
    const delta = compare - base;
    const pct = base === 0 ? 0 : (delta / base) * 100;
    return { ...p, base, compare, delta, pct };
  });
  const key = measure === "pct" ? "pct" : "delta";
  return rows.sort((a, b) => b[key] - a[key]);
}

export function summarizeDeltas(rows) {
  const up = rows.filter((r) => r.delta > 0);
  const down = rows.filter((r) => r.delta < 0);
  const sum = (xs, k) => xs.reduce((s, r) => s + r[k], 0);
  return {
    increaseTotal: sum(up, "delta"),
    decreaseTotal: sum(down, "delta"),
    netChange: sum(rows, "delta"),
    baseTotal: sum(rows, "base"),
    compareTotal: sum(rows, "compare"),
    countUp: up.length,
    countDown: down.length,
    biggest: [...rows].sort((a, b) => b.delta - a.delta)[0],
  };
}

/** Effective municipal tax rate implied by the City's own average-home example. */
export function municipalRate(data) {
  const h = data.headline;
  return h.avgHomeMunicipalTax2026 / h.avgHomeAssessment;
}

/**
 * Estimate a homeowner's municipal property tax (excludes the provincial education portion).
 * Toronto assessments are frozen at 2016 values, so the same assessment applies both years.
 */
export function estimateTax(data, assessed) {
  const rate = municipalRate(data);
  const pct = data.headline.propertyTaxIncreasePct / 100;
  const tax2026 = assessed * rate;
  const tax2025 = tax2026 / (1 + pct);
  const increase = tax2026 - tax2025;
  return { tax2025, tax2026, increase, monthly: increase / 12 };
}

export function garbageFees(data, size) {
  const u = data.utilityRates2026;
  const bin = u.garbageBins.find((b) => b.size === size) ?? u.garbageBins[1];
  const fee2025 = bin.fee2026 / (1 + u.solidWasteIncreasePct / 100);
  return { size: bin.size, fee2026: bin.fee2026, fee2025, increase: bin.fee2026 - fee2025 };
}

/**
 * Rough "tax receipt": split an amount across the shown programs in proportion to their net budgets.
 * Illustrative only: the real levy also pays debt and corporate costs and is offset by other revenue.
 */
export function taxReceipt(data, amount, year) {
  const rows = data.programs.map((p) => ({ id: p.id, name: p.name, net: p.net[String(year)] }));
  const total = rows.reduce((s, r) => s + r.net, 0);
  return rows
    .map((r) => ({ ...r, share: r.net / total, amount: (amount * r.net) / total }))
    .sort((a, b) => b.amount - a.amount);
}

export function parseMoney(str) {
  const n = Number(String(str).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Every source id referenced anywhere in the dataset. */
export function referencedSourceIds(data) {
  const ids = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (k === "sources" && Array.isArray(val)) val.forEach((s) => ids.add(s));
        else if (k !== "sources") walk(val);
      }
    }
  };
  walk(data);
  return ids;
}
