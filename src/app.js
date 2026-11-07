import {
  availableYears, computeDeltas, summarizeDeltas, estimateTax, garbageFees, taxReceipt, parseMoney,
} from "./model.js";
import { millions, billions, pct, dollars, int, escapeHtml } from "./format.js";
import { hbars, stackedColumns, segmentedBar, tipHtml } from "./charts.js";

const $ = (id) => document.getElementById(id);
const state = { measure: "abs", view: "chart", selected: null, tlKind: "all" };
let DATA;

async function loadData() {
  // A build step can inline the dataset as window.__BUDGET_DATA__ so the page works from file://.
  if (window.__BUDGET_DATA__) return window.__BUDGET_DATA__;
  const res = await fetch("data/toronto-budget.json");
  if (!res.ok) throw new Error(`Could not load data (${res.status})`);
  return res.json();
}

/* ---------- helpers ---------- */
function srcLinks(ids = []) {
  const links = ids
    .map((id) => DATA.sources[id])
    .filter(Boolean)
    .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" title="${escapeHtml(s.title)}">${escapeHtml(sourceLabel(s))}</a>`);
  return links.length ? `<p class="src-links">Source: ${links.join(" · ")}</p>` : "";
}
function sourceLabel(s) {
  if (s.publisher !== "City of Toronto") return s.publisher;
  const t = s.title.replace(/^\d{4} Budget Notes: /, (m) => `${m.slice(0, 4)} Budget Notes, `);
  return t.length > 48 ? `${t.slice(0, 46).trimEnd()}…` : t;
}
function basisBadge(basis) {
  const map = { official: ["badge-official", "Official"], derived: ["badge-derived", "Derived"], approx: ["badge-approx", "Approx."] };
  const [cls, label] = map[basis] || map.approx;
  return `<span class="badge ${cls}">${label}</span>`;
}
function tile(label, value, sub) {
  return `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ""}</div>`;
}
function setRadio(groupEl, attr, value) {
  groupEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset[attr] === value)));
}

/* ---------- hero ---------- */
function renderHero() {
  const h = DATA.headline;
  const prev = DATA.taxHistory.find((t) => t.year === DATA.meta.baseYear);
  $("statusLine").textContent = `${DATA.meta.compareYear} budget · final · updated ${DATA.meta.lastUpdated}`;
  $("heroTiles").innerHTML = [
    tile("Operating budget", billions(h.operatingTotalB), `${billions(h.taxSupportedGrossB, 2)} tax-supported + ${billions(h.rateSupportedGrossB, 2)} water &amp; garbage`),
    tile("Property tax increase", `${h.propertyTaxIncreasePct}%`, `<span class="tile-delta">${dollars(h.avgHomeIncrease2026, { cents: true })}/yr</span> on the average home. Last year: ${prev ? prev.totalPct + "%" : "n/a"}`),
    tile("Gap that had to be closed", millions(h.openingGapM), "Closing it with tax alone would have meant a ~27% increase"),
    tile("10-year capital plan", billions(h.capital10yrB), `${billions(h.capital2026B)} of it in ${DATA.meta.compareYear}. Largest in City history`),
  ].join("");
}

/* ---------- deltas ---------- */
function renderDeltas() {
  const { baseYear, compareYear } = DATA.meta;
  const rows = computeDeltas(DATA, baseYear, compareYear, state.measure);
  const sum = summarizeDeltas(rows);
  if (!state.selected) state.selected = sum.biggest.id;

  $("changesSub").textContent = `Change in each service's City-funded (net) budget, ${baseYear} → ${compareYear}. Tap a bar for details.`;
  const isPct = state.measure === "pct";
  const items = rows.map((r) => ({
    id: r.id,
    label: r.short,
    value: isPct ? r.pct : r.delta,
    valueLabel: isPct ? pct(r.pct) : millions(r.delta, { signed: true }),
    cls: r.delta >= 0 ? "bar-up" : "bar-down",
    ariaLabel: `${r.name}: ${millions(r.delta, { signed: true })}, ${pct(r.pct)}. Select for details.`,
    tipHtml: tipHtml(r.name, [
      `${baseYear}: ${millions(r.base)} → ${compareYear}: ${millions(r.compare)}`,
      `Change: ${millions(r.delta, { signed: true })} (${pct(r.pct)})`,
    ]),
  }));

  $("deltaChart").hidden = state.view !== "chart";
  $("deltaTable").hidden = state.view !== "table";
  if (state.view === "chart") {
    hbars($("deltaChart"), items, {
      selectedId: state.selected,
      onSelect: (id) => { state.selected = id; renderDeltas(); },
      tickFormat: (v) => (isPct ? `${v > 0 ? "+" : ""}${Math.round(v)}%` : v === 0 ? "0" : millions(v, { signed: true })),
      ariaLabel: `Change in net budget by program, ${baseYear} to ${compareYear}`,
    });
  } else {
    $("deltaTable").innerHTML = `<table>
      <thead><tr><th>Service</th><th class="num">${baseYear}</th><th class="num">${compareYear}</th><th class="num">Change</th><th class="num">%</th><th>Data</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${millions(r.base)}</td><td class="num">${millions(r.compare)}</td><td class="num">${millions(r.delta, { signed: true })}</td><td class="num">${pct(r.pct)}</td><td>${basisBadge(r.basis)}</td></tr>`).join("")}
      <tr><td><strong>Total of these ${rows.length}</strong></td><td class="num"><strong>${millions(sum.baseTotal)}</strong></td><td class="num"><strong>${millions(sum.compareTotal)}</strong></td><td class="num"><strong>${millions(sum.netChange, { signed: true })}</strong></td><td class="num"><strong>${pct((sum.netChange / sum.baseTotal) * 100)}</strong></td><td></td></tr>
      </tbody></table>`;
  }

  const top2 = [...rows].sort((a, b) => b.delta - a.delta).slice(0, 2);
  const topShare = ((top2[0].delta + top2[1].delta) / sum.increaseTotal) * 100;
  $("deltaFoot").innerHTML =
    `Across these ${rows.length} services, net budgets rose by ${millions(sum.increaseTotal)} and fell by ${millions(-sum.decreaseTotal)}. ` +
    `<strong>${escapeHtml(top2[0].short)} and ${escapeHtml(top2[1].short)} alone account for ${Math.round(topShare)}% of the new money.</strong>`;

  renderDetail(rows.find((r) => r.id === state.selected) || rows[0]);
}

function renderDetail(r) {
  const { baseYear, compareYear } = DATA.meta;
  const hl = r.highlights.length ? `<ul>${r.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : `<p class="muted">No specific new items were itemized for this service in the sources we used.</p>`;
  $("programDetail").innerHTML = `<div class="detail">
    <div class="detail-head"><h3>${escapeHtml(r.name)}</h3>${basisBadge(r.basis)}</div>
    <p class="muted small">${escapeHtml(r.what)}</p>
    <div class="detail-nums">
      <div><div class="l">${baseYear} net</div><div class="n">${millions(r.base)}</div></div>
      <div><div class="l">${compareYear} net</div><div class="n">${millions(r.compare)}</div></div>
      <div><div class="l">Change</div><div class="n">${millions(r.delta, { signed: true })}</div><div class="l">${pct(r.pct)}</div></div>
    </div>
    ${r.gross2026 ? `<p class="small">Total ${compareYear} spending including money from other sources (gross): <strong>${millions(r.gross2026)}</strong>.</p>` : ""}
    <h4 class="small" style="margin:.4rem 0">What changed</h4>
    ${hl}
    <p class="small muted">${escapeHtml(r.basisNote)}</p>
    ${srcLinks(r.sources)}
  </div>`;
}

/* ---------- gap ---------- */
function renderGap() {
  const g = DATA.gapClosing;
  $("gapSub").textContent = g.note;
  const items = [
    { id: "gap", label: "The opening gap", value: g.openingGapM, cls: "bar-neutral", valueLabel: millions(g.openingGapM), tipHtml: tipHtml("Opening gap", ["Cost of keeping services running minus expected revenue."]) },
    ...g.measures.map((m, i) => ({
      id: `m${i}`,
      label: m.label,
      value: m.amountM,
      cls: m.kind === "reserve" ? "bar-reserve" : "bar-cut",
      valueLabel: millions(m.amountM),
      tipHtml: tipHtml(m.label, [m.detail]),
    })),
  ];
  const c = $("gapChart");
  c.innerHTML = "";
  const legend = document.createElement("div");
  legend.className = "legend-inline";
  legend.innerHTML = `<span style="--sw:var(--cut)">Savings &amp; cuts</span><span style="--sw:var(--reserve)">Drawn from reserves (savings accounts)</span><span style="--sw:var(--neutral)">Size of the gap</span>`;
  const host = document.createElement("div");
  c.append(legend, host);
  hbars(host, items, { tickFormat: (v) => (v === 0 ? "0" : millions(v)), ariaLabel: "Measures used to close the budget gap" });
  $("gapFoot").innerHTML = `Amounts overlap and come from different sources, so they don't add up to the gap. ${srcLinks([...new Set(g.measures.flatMap((m) => m.sources))])}`;
  const rev = DATA.revenue2026.parts.find((p) => p.label.startsWith("Reserves"));
  $("gapReserveShare").innerHTML = `In ${DATA.meta.compareYear}, about <strong>${billions(rev.amountB)}</strong> (roughly ${Math.round((rev.amountB / DATA.revenue2026.totalB) * 100)}% of the operating budget) comes from reserves, about $400M more than the year before. That's the main reason the 2027 budget already starts with a large gap.`;
}

/* ---------- calculator ---------- */
function renderCalc() {
  const sel = $("bin");
  if (!sel.options.length) {
    DATA.utilityRates2026.garbageBins.forEach((b) => sel.add(new Option(`${b.size} (${dollars(b.fee2026, { cents: true })}/yr)`, b.size)));
    sel.value = "Medium";
    $("assess").addEventListener("input", renderCalc);
    $("assess").addEventListener("blur", () => {
      const v = parseMoney($("assess").value);
      if (Number.isFinite(v) && v > 0) $("assess").value = int(v);
    });
    sel.addEventListener("change", renderCalc);
  }
  const value = parseMoney($("assess").value);
  if (!Number.isFinite(value) || value <= 0) {
    $("calcOut").innerHTML = `<p class="muted">Enter an assessed value to see your estimate.</p>`;
    return;
  }
  const t = estimateTax(DATA, value);
  const gfee = garbageFees(DATA, sel.value);
  const yr = DATA.meta.compareYear;
  const receipt = taxReceipt(DATA, t.tax2026, yr).slice(0, 6);
  const rest = t.tax2026 - receipt.reduce((s, r) => s + r.amount, 0);
  $("calcOut").innerHTML = `
    <div class="muted small">Your City property tax went up by about</div>
    <div class="calc-big">${dollars(t.increase, { cents: true })} <span class="muted" style="font-size:1rem;font-weight:500">/ year</span></div>
    <div class="muted small">That's ${dollars(t.monthly, { cents: true })} a month.</div>
    <div class="calc-rows">
      <div class="calc-row"><span>City property tax ${yr - 1}</span><span>${dollars(t.tax2025)}</span></div>
      <div class="calc-row"><span>City property tax ${yr}</span><span>${dollars(t.tax2026)}</span></div>
      <div class="calc-row"><span>Garbage fee change (${escapeHtml(gfee.size.toLowerCase())} bin, +${DATA.utilityRates2026.solidWasteIncreasePct}%)</span><span>${dollars(gfee.increase, { cents: true, signed: true })}</span></div>
      <div class="calc-row"><span>Water rates</span><span>+${DATA.utilityRates2026.waterIncreasePct}%</span></div>
    </div>
    <div class="calc-split">
      <h4>Roughly where your ${dollars(t.tax2026)} goes</h4>
      ${receipt.map((r) => `<div class="calc-row"><span>${escapeHtml(r.name)}</span><span>${dollars(r.amount)}</span></div>`).join("")}
      <div class="calc-row"><span>Everything else shown on this page</span><span>${dollars(rest)}</span></div>
      <p class="muted small" style="margin-top:8px">A rough illustration: your bill split in proportion to the net budgets of the ${DATA.programs.length} services on this page. The real tax levy also pays debt and corporate costs and is offset by other revenue. Excludes the provincial education tax on your bill.</p>
    </div>`;
}

function renderTaxHistory() {
  const cols = DATA.taxHistory.map((t) => ({
    label: String(t.year),
    total: t.totalPct,
    totalLabel: `${t.totalPct}%`,
    parts: [
      { value: t.basePct, cls: "bar-base", name: "General increase" },
      { value: t.levyPct, cls: "bar-levy", name: "City Building Fund levy" },
    ],
    ariaLabel: `${t.year}: ${t.totalPct}% total, ${t.basePct}% general plus ${t.levyPct}% levy, about ${dollars(t.avgHomeIncrease)} on the average home`,
    tipHtml: tipHtml(`${t.year}: ${t.totalPct}% total`, [`General: ${t.basePct}%`, `City Building levy: ${t.levyPct}%`, `Average home: +${dollars(t.avgHomeIncrease)}`]),
  }));
  const host = $("taxHistory");
  host.innerHTML = "";
  const legend = document.createElement("div");
  legend.className = "legend-inline";
  legend.innerHTML = `<span style="--sw:var(--s1)">General increase</span><span style="--sw:var(--s6)">City Building Fund levy</span>`;
  const chart = document.createElement("div");
  host.append(legend, chart);
  stackedColumns(chart, cols, { tickFormat: (v) => `${v}%`, ariaLabel: "Property tax increase by year" });
  const foot = document.createElement("p");
  foot.className = "chart-foot";
  foot.innerHTML = `${DATA.meta.compareYear} was an election year; the increase was the smallest of Chow's term. ${srcLinks(["s_launch_release"])}`;
  host.appendChild(foot);
}

/* ---------- revenue ---------- */
function renderRevenue() {
  const r = DATA.revenue2026;
  const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--neutral)"];
  const darkInk = [false, false, false, true, false, false];
  const parts = r.parts.map((p, i) => ({
    label: p.label,
    value: p.amountB,
    color: colors[i],
    darkInk: darkInk[i],
    neutralInk: i === 5,
    inner: `${Math.round((p.amountB / r.totalB) * 100)}%`,
    ariaLabel: `${p.label}: ${billions(p.amountB, 2)}, ${Math.round((p.amountB / r.totalB) * 100)}%`,
    tipHtml: tipHtml(p.label, [`${billions(p.amountB, 2)} · ${Math.round((p.amountB / r.totalB) * 100)}% of ${billions(r.totalB)}`]),
  }));
  segmentedBar($("revenueBar"), parts, { total: r.totalB, ariaLabel: `Where the ${billions(r.totalB)} operating budget comes from` });
  $("revenueLegend").innerHTML = r.parts
    .map((p, i) => `<li><span class="sw" style="background:${colors[i]}"></span><span>${escapeHtml(p.label)}</span><span class="amt">${billions(p.amountB, 2)}</span></li>`)
    .join("");
  $("revenueFoot").innerHTML = `${escapeHtml(r.note)} ${srcLinks([...new Set(r.parts.flatMap((p) => p.sources))])}`;

  const c = DATA.capital;
  $("capitalTiles").innerHTML = [
    tile("Capital plan, 2026–2035", billions(c.totalB), `${billions(c.taxSupportedB)} tax-supported · ${billions(c.rateSupportedB)} water &amp; waste`),
    tile("Spent fixing what exists", `${c.stateOfGoodRepairPct}%`, "of the 10-year plan is repairs (\"state of good repair\")"),
    tile("Transit expansion not funded", billions(c.unfundedTransitExpansionB), "Planned projects with no money attached yet"),
  ].join("");
}

/* ---------- timeline ---------- */
const KIND_LABEL = { process: "Decision", effect: "Takes effect", tracking: "Check-up", upcoming: "Coming up" };
const KIND_COLOR = { process: "var(--s1)", effect: "var(--s3)", tracking: "var(--s2)", upcoming: "var(--axis)" };
function renderTimeline() {
  const today = DATA.meta.lastUpdated.slice(0, 7);
  let placedToday = false;
  const html = [];
  DATA.timeline.forEach((t) => {
    if (!placedToday && t.date.slice(0, 7) > today) {
      html.push(`<li class="tl-today" aria-label="Today">Today · ${escapeHtml(DATA.meta.lastUpdated)}</li>`);
      placedToday = true;
    }
    const hidden = state.tlKind !== "all" && state.tlKind !== t.kind;
    html.push(`<li class="tl-item ${t.kind}" ${hidden ? "hidden" : ""} style="--dot:${KIND_COLOR[t.kind]}">
      <span class="tl-dot" aria-hidden="true"></span>
      <div class="tl-date">${escapeHtml(t.label)}<span class="tl-kind">${KIND_LABEL[t.kind]}</span></div>
      <div class="tl-title">${escapeHtml(t.title)}</div>
      <p class="tl-detail">${escapeHtml(t.detail)}</p>
    </li>`);
  });
  $("timeline").innerHTML = html.join("");
}

/* ---------- in-year + outlook ---------- */
function renderNext() {
  const iy = DATA.inYear;
  const stat = (label, m, sub) => `<div class="stat"><div class="l">${label}</div><div class="n ${m < 0 ? "over" : "under"}">${m < 0 ? "▲ " : "▼ "}${millions(Math.abs(m), { digits: 1 })}</div><div class="s ${m < 0 ? "over" : "under"}">${m < 0 ? "projected over budget" : "projected under budget"}</div>${sub ? `<div class="l">${sub}</div>` : ""}</div>`;
  $("inYear").innerHTML = `<h3>Is ${DATA.meta.compareYear} on track?</h3>
    <p class="muted small">Projected year-end result as of ${escapeHtml(iy.asOf)}.</p>
    <div class="stat-row">
      ${stat("Tax-supported services", iy.taxSupportedProjectedM)}
      ${stat("of which TTC", iy.ttcProjectedM)}
      ${stat("Water &amp; garbage", iy.rateSupportedProjectedM)}
    </div>
    <p class="small">${escapeHtml(iy.note)}</p>
    ${srcLinks(iy.sources)}`;

  const o = DATA.outlook2027;
  $("outlook").innerHTML = `<h3>The 2027 budget starts in a hole</h3>
    <p class="muted small">Estimated opening shortfall before any decisions</p>
    <div class="outlook-range">${billions(o.gapLowB)}–${billions(o.gapHighB)}</div>
    <ul class="small">${o.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    <p class="small muted">When the 2027 budget is released, this page will compare it against 2026 the same way.</p>
    ${srcLinks(o.sources)}`;
}

/* ---------- sources ---------- */
function renderSources() {
  const TYPE = { official: "City document", news: "News", political: "Mayor's office", advocacy: "Advocacy group", commentary: "Commentary", reference: "Reference" };
  const entries = Object.values(DATA.sources).sort((a, b) => (a.type === "official" ? 0 : 1) - (b.type === "official" ? 0 : 1) || a.title.localeCompare(b.title));
  $("sourceList").innerHTML = entries
    .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a> <span class="pub">${escapeHtml(s.publisher)}</span><span class="source-type">${TYPE[s.type] || s.type}</span></li>`)
    .join("");
  $("netDef").textContent = DATA.meta.netDefinition;
  $("footUpdated").textContent = `Data last updated ${DATA.meta.lastUpdated}. ${DATA.meta.status} Independent explainer, not affiliated with the City of Toronto.`;
}

/* ---------- controls ---------- */
function wireControls() {
  document.querySelectorAll("[data-measure]").forEach((b) =>
    b.addEventListener("click", () => {
      state.measure = b.dataset.measure;
      setRadio(b.parentElement, "measure", state.measure);
      renderDeltas();
    }));
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      state.view = b.dataset.view;
      setRadio(b.parentElement, "view", state.view);
      renderDeltas();
    }));
  document.querySelectorAll("#tlFilter [data-kind]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tlKind = b.dataset.kind;
      setRadio(b.parentElement, "kind", state.tlKind);
      renderTimeline();
    }));

  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.dataset.theme = saved;
  } catch {}
  $("themeToggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  });

  let w = window.innerWidth;
  let raf;
  window.addEventListener("resize", () => {
    if (window.innerWidth === w) return;
    w = window.innerWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderCharts);
  });
}

function renderCharts() {
  renderDeltas();
  renderGap();
  renderTaxHistory();
  renderRevenue();
}

async function main() {
  try {
    DATA = await loadData();
  } catch (e) {
    $("main").insertAdjacentHTML("afterbegin", `<div class="wrap card" style="margin-top:24px">Couldn't load budget data: ${escapeHtml(e.message)}. If you opened this file directly, run <code>npm start</code> or open <code>dist/index.html</code>.</div>`);
    return;
  }
  const years = availableYears(DATA);
  if (!years.includes(DATA.meta.baseYear) || !years.includes(DATA.meta.compareYear)) {
    console.warn("Configured years missing from program data", years);
  }
  wireControls();
  renderHero();
  renderCharts();
  renderCalc();
  renderTimeline();
  renderNext();
  renderSources();
}

main();
