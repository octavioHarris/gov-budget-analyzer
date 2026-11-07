import {
  availableYears, computeDeltas, summarizeDeltas, estimateTax, garbageFees, taxReceipt, parseMoney,
  perHousehold, commitmentSummary, commitmentsFor, outcomeDirection, householdComparison,
} from "./model.js";
import { millions, billions, pct, dollars, int, escapeHtml } from "./format.js";
import { hbars, stackedColumns, segmentedBar, tipHtml } from "./charts.js";

const $ = (id) => document.getElementById(id);
const state = { measure: "abs", view: "chart", selected: null, tlKind: "all" };
let DATA;
let INDEX;

/* ---------- data loading ---------- */
async function loadData() {
  const params = new URLSearchParams(location.search);
  // A build step can inline everything as window.__BUDGET_DATA__ = { index, cities } so the page works from file://.
  const bundled = window.__BUDGET_DATA__;
  INDEX = bundled ? bundled.index : await (await fetch("data/cities/index.json")).json();
  const entry = INDEX.find((c) => c.id === params.get("city")) || INDEX[0];
  if (bundled) return bundled.cities[entry.id];
  const res = await fetch(`data/cities/${entry.file}`);
  if (!res.ok) throw new Error(`Could not load data for ${entry.name} (${res.status})`);
  return res.json();
}

/* ---------- small helpers ---------- */
const Y = () => DATA.meta.compareYear;
const Y0 = () => DATA.meta.baseYear;

function sourceLabel(s) {
  if (s.type !== "official" || s.publisher.length < 8) return s.publisher;
  const t = s.title.replace(/^(\d{4}) Budget Notes: /, "$1 Budget Notes, ");
  return t.length > 48 ? `${t.slice(0, 46).trimEnd()}…` : t;
}
function srcLinks(ids = []) {
  const links = [...new Set(ids)]
    .map((id) => DATA.sources[id])
    .filter(Boolean)
    .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" title="${escapeHtml(s.title)}">${escapeHtml(sourceLabel(s))}</a>`);
  return links.length ? `<p class="src-links">Source: ${links.join(" · ")}</p>` : "";
}
function basisBadge(basis) {
  const map = { official: ["badge-official", "Official"], derived: ["badge-derived", "Derived"], approx: ["badge-approx", "Approx."] };
  const [cls, label] = map[basis] || map.approx;
  return `<span class="badge ${cls}">${label}</span>`;
}
function tile(label, value, sub, href) {
  const inner = `<div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ""}`;
  return href ? `<a class="tile tile-link" href="${href}">${inner}</a>` : `<div class="tile">${inner}</div>`;
}
function setRadio(groupEl, attr, value) {
  groupEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset[attr] === value)));
}

const STATUS = {
  delivered: { label: "Delivered", icon: "✓", cls: "st-good" },
  at_risk: { label: "At risk", icon: "!", cls: "st-serious" },
  not_delivered: { label: "Not delivered", icon: "✕", cls: "st-critical" },
  unverified: { label: "Not yet verified", icon: "?", cls: "st-neutral" },
  upcoming: { label: "Coming up", icon: "→", cls: "st-neutral" },
};
const statusPill = (s) => `<span class="status ${STATUS[s].cls}"><span aria-hidden="true">${STATUS[s].icon}</span> ${STATUS[s].label}</span>`;

function fmtOutcome(o, v) {
  if (!v) return "–";
  const n = Number.isInteger(v.value) ? int(v.value) : v.value.toFixed(1);
  if (o.unit === "%") return `${v.prefix ?? ""}${n}%`;
  if (o.unit === "min") return `${n} min`;
  return `${v.prefix ?? ""}${n}`;
}
const DIR = {
  improved: { label: "Better", cls: "dir-good", icon: "▲" },
  worsened: { label: "Worse", cls: "dir-bad", icon: "▼" },
  flat: { label: "No change", cls: "dir-flat", icon: "■" },
  none: { label: "No earlier figure to compare", cls: "dir-flat", icon: "" },
};
function outcomeCard(o, programName) {
  const d = outcomeDirection(o);
  return `<div class="outcome">
    ${programName ? `<div class="outcome-prog">${escapeHtml(programName)}</div>` : ""}
    <div class="outcome-metric">${escapeHtml(o.metric)}</div>
    <div class="outcome-vals">
      ${o.before ? `<span class="ov"><span class="ov-n">${fmtOutcome(o, o.before)}</span><span class="ov-p">${escapeHtml(o.before.period)}</span></span><span class="ov-arrow" aria-hidden="true">→</span>` : ""}
      <span class="ov"><span class="ov-n">${fmtOutcome(o, o.after)}</span><span class="ov-p">${escapeHtml(o.after.period)}</span></span>
      <span class="dir ${DIR[d].cls}">${DIR[d].icon ? `<span aria-hidden="true">${DIR[d].icon}</span> ` : ""}${DIR[d].label}</span>
    </div>
    <p class="small muted">${escapeHtml(o.note)}</p>
    ${srcLinks(o.sources)}
  </div>`;
}

/* ---------- verdicts (stored per viewer, in this browser only) ---------- */
const VERDICTS = [
  { id: "worth", label: "Worth it", icon: "👍" },
  { id: "unsure", label: "Not sure", icon: "🤷" },
  { id: "not", label: "Not worth it", icon: "👎" },
];
const vKey = () => `budget-verdicts:${DATA.meta.id}:${Y()}`;
function getVerdicts() {
  try { return JSON.parse(localStorage.getItem(vKey())) || {}; } catch { return {}; }
}
function setVerdict(programId, v) {
  const all = getVerdicts();
  if (all[programId] === v) delete all[programId];
  else all[programId] = v;
  try { localStorage.setItem(vKey(), JSON.stringify(all)); } catch {}
  memVerdicts = all;
  renderDeltas();
  renderScorecard();
}
let memVerdicts = null; // fallback when storage is blocked
const verdicts = () => { const v = getVerdicts(); return Object.keys(v).length ? v : memVerdicts || {}; };

function verdictButtons(programId, compact = false) {
  const cur = verdicts()[programId];
  return `<div class="verdict ${compact ? "verdict-compact" : ""}" role="group" aria-label="Your verdict">
    ${VERDICTS.map((v) => `<button type="button" data-verdict="${v.id}" data-program="${programId}" aria-pressed="${cur === v.id}" aria-label="${v.label}" title="${v.label}"><span aria-hidden="true">${v.icon}</span> ${compact ? `<span class="v-label">${v.label}</span>` : v.label}</button>`).join("")}
  </div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-verdict]");
  if (b) setVerdict(b.dataset.program, b.dataset.verdict);
});

/* ---------- hero ---------- */
function renderHero() {
  const m = DATA.meta;
  const h = DATA.headline;
  document.title = `${m.cityName} Budget Scorecard`;
  $("brandName").textContent = `${m.cityName} Budget Scorecard`;
  $("statusLine").textContent = `${Y()} budget · updated ${m.lastUpdated}`;
  $("hero-title").textContent = `${m.cityName}'s ${Y()} budget: what you paid, where it went, and what it delivered.`;
  $("heroLede").innerHTML = `The ${escapeHtml(m.jurisdiction)} spends about <strong>${billions(h.operatingTotalB)}</strong> a year. Most of it is the same as last year, so this page skips to what <em>changed</em> and gives you what you need to judge it for yourself. ${escapeHtml(m.leader.title)}: ${escapeHtml(m.leader.name)}${m.leader.note ? ` (${escapeHtml(m.leader.note)})` : ""}.`;

  const prev = DATA.taxHistory.find((t) => t.year === Y0());
  const sum = summarizeDeltas(computeDeltas(DATA, Y0(), Y()));
  const cs = commitmentSummary(DATA);
  const iy = DATA.inYear?.lines?.[0];
  $("heroTiles").innerHTML = [
    tile("Your property tax", `+${dollars(h.avgHomeIncrease, { cents: true })}`, `a year on the average home (+${h.propertyTaxIncreasePct}%${prev ? `; last year +${prev.totalPct}%` : ""})`, "#pay"),
    tile("New money for services", millions(sum.increaseTotal, { signed: true }), `≈ ${dollars(perHousehold(DATA, sum.increaseTotal))} per household across ${sum.countUp} services; ${sum.countDown} cut`, "#where"),
    tile("Promises delivered", `${cs.counts.delivered} of ${cs.due}`, [cs.counts.at_risk && `${cs.counts.at_risk} at risk`, cs.counts.not_delivered && `${cs.counts.not_delivered} not delivered`, cs.counts.unverified && `${cs.counts.unverified} not yet verified`].filter(Boolean).join(" · "), "#deliver"),
    iy ? tile("On budget?", iy.valueM < 0 ? `${millions(-iy.valueM)} over` : `${millions(iy.valueM)} under`, `projected for the year, as of ${escapeHtml(DATA.inYear.asOf)}`, "#sustain") : "",
  ].join("");
}

/* ---------- 1. what you pay ---------- */
function renderPay() {
  const m = DATA.meta;
  $("paySub").textContent = `Enter your home's assessed value to see your change. Renters pay property tax indirectly through rent.`;
  $("assessLabel").textContent = m.propertyTax?.assessmentLabel || "Assessed value";
  $("assessHelp").textContent = m.propertyTax?.assessmentHelp || "";
  if (!$("assess").value) $("assess").value = int(DATA.headline.avgHomeAssessment);

  const sel = $("bin");
  const bins = DATA.utilityRates?.garbageBins;
  $("binWrap").hidden = !bins;
  if (bins && !sel.options.length) {
    bins.forEach((b) => sel.add(new Option(`${b.size} (${dollars(b.fee, { cents: true })}/yr)`, b.size)));
    sel.value = bins[Math.min(1, bins.length - 1)].size;
  }
  if (!$("assess").dataset.wired) {
    $("assess").dataset.wired = "1";
    $("assess").addEventListener("input", renderCalc);
    $("assess").addEventListener("blur", () => {
      const v = parseMoney($("assess").value);
      if (Number.isFinite(v) && v > 0) $("assess").value = int(v);
    });
    sel.addEventListener("change", renderCalc);
  }
  renderCalc();
  renderHouseholdCompare();
  renderTaxHistory();
}

function renderCalc() {
  const value = parseMoney($("assess").value);
  if (!Number.isFinite(value) || value <= 0) {
    $("calcOut").innerHTML = `<p class="muted">Enter an assessed value to see your estimate.</p>`;
    return;
  }
  const t = estimateTax(DATA, value);
  const u = DATA.utilityRates;
  const gfee = u?.garbageBins ? garbageFees(DATA, $("bin").value) : null;
  const receipt = taxReceipt(DATA, t.taxAfter, Y()).slice(0, 6);
  const rest = t.taxAfter - receipt.reduce((s, r) => s + r.amount, 0);
  const totalChange = t.increase + (gfee ? gfee.increase : 0);
  $("calcOut").innerHTML = `
    <div class="muted small">Your property tax went up by about</div>
    <div class="calc-big">${dollars(t.increase, { cents: true })} <span class="muted" style="font-size:1rem;font-weight:500">/ year</span></div>
    <div class="muted small">That's ${dollars(t.monthly, { cents: true })} a month${gfee ? `, or ${dollars(totalChange, { cents: true })} a year once the garbage fee is included` : ""}.</div>
    <div class="calc-rows">
      <div class="calc-row"><span>Property tax ${Y0()}</span><span>${dollars(t.taxBefore)}</span></div>
      <div class="calc-row"><span>Property tax ${Y()}</span><span>${dollars(t.taxAfter)}</span></div>
      ${gfee ? `<div class="calc-row"><span>Garbage fee (${escapeHtml(gfee.size.toLowerCase())} bin, +${u.solidWasteIncreasePct}%)</span><span>${dollars(gfee.increase, { cents: true, signed: true })}</span></div>` : ""}
      ${u?.waterIncreasePct ? `<div class="calc-row"><span>Water rates</span><span>+${u.waterIncreasePct}%</span></div>` : ""}
    </div>
    <div class="calc-split">
      <h4>Roughly where your ${dollars(t.taxAfter)} goes</h4>
      ${receipt.map((r) => `<div class="calc-row"><span>${escapeHtml(r.name)}</span><span>${dollars(r.amount)}</span></div>`).join("")}
      <div class="calc-row"><span>Other services shown on this page</span><span>${dollars(rest)}</span></div>
      <p class="muted small" style="margin-top:8px">A rough illustration: your bill split in proportion to the net budgets of the ${DATA.programs.length} services on this page. The real levy also pays debt and corporate costs and is offset by other revenue. Excludes ${escapeHtml(DATA.meta.propertyTax?.excludes || "other taxes on your bill")}.</p>
    </div>`;
}

function renderHouseholdCompare() {
  const c = householdComparison(DATA);
  const host = $("householdCompare");
  host.innerHTML = `<h3>New spending vs. what households paid</h3>
    <p class="muted small">Per household, ${Y0()} → ${Y()}.</p><div class="chart" id="hhChart"></div>
    <p class="small" id="hhNote"></p>`;
  hbars($("hhChart"), [
    { id: "new", label: "New service spending", value: c.newSpendingPerHousehold, cls: "bar-up", valueLabel: dollars(c.newSpendingPerHousehold), tipHtml: tipHtml("New service spending per household", [`Increases across the ${DATA.programs.length} services shown, divided by ${int(DATA.meta.households)} households.`]) },
    { id: "tax", label: "Average tax increase", value: c.avgTaxIncrease, cls: "bar-neutral", valueLabel: dollars(c.avgTaxIncrease), tipHtml: tipHtml("Average home's property tax increase", ["Per the City's own example."]) },
  ], { tickFormat: (v) => dollars(v), ariaLabel: "New spending per household compared with the average tax increase", rowH: 30, barH: 16 });
  const gap = c.newSpendingPerHousehold - c.avgTaxIncrease;
  $("hhNote").innerHTML = gap > 0
    ? `New spending works out to about <strong>${dollars(gap)} more per household</strong> than the average tax increase. The difference came from reserves, other governments and other revenue (see <a href="#sustain">Does it add up?</a>). Not every household is a homeowner, and businesses pay property tax too, so this comparison only shows scale.`
    : `The average tax increase covers the new spending on these services.`;
}

function renderTaxHistory() {
  const hist = DATA.taxHistory;
  $("taxHistoryTitle").textContent = `Property tax increases, ${hist[0].year}–${hist[hist.length - 1].year}`;
  const cols = hist.map((t) => ({
    label: String(t.year),
    total: t.totalPct,
    totalLabel: `${t.totalPct}%`,
    parts: [
      { value: t.basePct, cls: "bar-base", name: "General increase" },
      { value: t.levyPct, cls: "bar-levy", name: "Dedicated levy" },
    ],
    ariaLabel: `${t.year}: ${t.totalPct}% total, ${t.basePct}% general plus ${t.levyPct}% levy, about ${dollars(t.avgHomeIncrease)} on the average home`,
    tipHtml: tipHtml(`${t.year}: ${t.totalPct}% total`, [`General: ${t.basePct}%`, `Levy: ${t.levyPct}%`, `Average home: +${dollars(t.avgHomeIncrease)}`]),
  }));
  const host = $("taxHistory");
  host.innerHTML = "";
  const legend = document.createElement("div");
  legend.className = "legend-inline";
  legend.innerHTML = `<span style="--sw:var(--s1)">General increase</span><span style="--sw:var(--s6)">${escapeHtml(DATA.meta.propertyTax?.levyName || "Dedicated levy")}</span>`;
  const chart = document.createElement("div");
  host.append(legend, chart);
  stackedColumns(chart, cols, { tickFormat: (v) => `${v}%`, ariaLabel: "Property tax increase by year", height: 200 });
  const foot = document.createElement("p");
  foot.className = "chart-foot";
  foot.innerHTML = `${escapeHtml(DATA.taxHistoryNote || "")} ${srcLinks(hist.flatMap((t) => t.sources))}`;
  host.appendChild(foot);
}

/* ---------- 2. where it went ---------- */
function renderDeltas() {
  const rows = computeDeltas(DATA, Y0(), Y(), state.measure === "pct" ? "pct" : "abs");
  const sum = summarizeDeltas(rows);
  if (!state.selected) state.selected = sum.biggest.id;
  $("whereSub").textContent = `Change in each service's ${DATA.meta.jurisdiction}-funded (net) budget, ${Y0()} → ${Y()}. Select a service to see what the money bought, how it performed, and to give your verdict.`;

  const fmt = {
    abs: (r) => [r.delta, millions(r.delta, { signed: true })],
    hh: (r) => { const v = perHousehold(DATA, r.delta); return [v, dollars(v, { signed: true })]; },
    pct: (r) => [r.pct, pct(r.pct)],
  }[state.measure];
  const tick = {
    abs: (v) => (v === 0 ? "0" : millions(v, { signed: true })),
    hh: (v) => (v === 0 ? "$0" : dollars(v, { signed: true })),
    pct: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`,
  }[state.measure];
  const V = verdicts();
  const items = rows.map((r) => {
    const [value, valueLabel] = fmt(r);
    const vd = VERDICTS.find((v) => v.id === V[r.id]);
    return {
      id: r.id,
      label: vd ? `${r.short} ${vd.icon}` : r.short,
      value,
      valueLabel,
      cls: r.delta >= 0 ? "bar-up" : "bar-down",
      ariaLabel: `${r.name}: ${millions(r.delta, { signed: true })}, ${pct(r.pct)}${vd ? `, you rated: ${vd.label}` : ""}. Select for details.`,
      tipHtml: tipHtml(r.name, [
        `${Y0()}: ${millions(r.base)} → ${Y()}: ${millions(r.compare)}`,
        `Change: ${millions(r.delta, { signed: true })} (${pct(r.pct)})`,
        `Per household: ${dollars(perHousehold(DATA, r.delta), { signed: true })}`,
      ]),
    };
  });

  $("deltaChart").hidden = state.view !== "chart";
  $("deltaTable").hidden = state.view !== "table";
  if (state.view === "chart") {
    hbars($("deltaChart"), items, {
      selectedId: state.selected,
      onSelect: (id) => { state.selected = id; renderDeltas(); if (window.innerWidth < 880) $("programDetail").scrollIntoView({ behavior: "smooth", block: "start" }); },
      tickFormat: tick,
      ariaLabel: `Change in net budget by service, ${Y0()} to ${Y()}`,
    });
  } else {
    $("deltaTable").innerHTML = `<table>
      <thead><tr><th>Service</th><th class="num">${Y0()}</th><th class="num">${Y()}</th><th class="num">Change</th><th class="num">%</th><th class="num">Per household</th><th>Data</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${millions(r.base)}</td><td class="num">${millions(r.compare)}</td><td class="num">${millions(r.delta, { signed: true })}</td><td class="num">${pct(r.pct)}</td><td class="num">${dollars(perHousehold(DATA, r.delta), { signed: true })}</td><td>${basisBadge(r.basis)}</td></tr>`).join("")}
      <tr><td><strong>Total of these ${rows.length}</strong></td><td class="num"><strong>${millions(sum.baseTotal)}</strong></td><td class="num"><strong>${millions(sum.compareTotal)}</strong></td><td class="num"><strong>${millions(sum.netChange, { signed: true })}</strong></td><td class="num"><strong>${pct((sum.netChange / sum.baseTotal) * 100)}</strong></td><td class="num"><strong>${dollars(perHousehold(DATA, sum.netChange), { signed: true })}</strong></td><td></td></tr>
      </tbody></table>`;
  }

  const top2 = [...rows].filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
  const topShare = sum.increaseTotal > 0 ? (top2.reduce((t, r) => t + r.delta, 0) / sum.increaseTotal) * 100 : 0;
  $("deltaFoot").innerHTML =
    `Net budgets rose by ${millions(sum.increaseTotal)} and fell by ${millions(-sum.decreaseTotal)}. ` +
    (top2.length === 2 && rows.length > 3 ? `<strong>${escapeHtml(top2[0].short)} and ${escapeHtml(top2[1].short)} alone got ${Math.round(topShare)}% of the new money.</strong>` : "");

  renderDetail(rows.find((r) => r.id === state.selected) || rows[0]);
}

function renderDetail(r) {
  const hl = r.highlights.length ? `<ul>${r.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : `<p class="muted small">No specific new items were itemized for this service in the sources we used.</p>`;
  const promises = commitmentsFor(DATA, r.id);
  const outcomes = r.outcomes ?? [];
  $("programDetail").innerHTML = `<div class="detail">
    <div class="detail-head"><h3>${escapeHtml(r.name)}</h3>${basisBadge(r.basis)}</div>
    <p class="muted small">${escapeHtml(r.what)}</p>
    <div class="detail-nums">
      <div><div class="l">${Y0()} net</div><div class="n">${millions(r.base)}</div></div>
      <div><div class="l">${Y()} net</div><div class="n">${millions(r.compare)}</div></div>
      <div><div class="l">Change</div><div class="n">${millions(r.delta, { signed: true })}</div><div class="l">${pct(r.pct)} · ${dollars(perHousehold(DATA, r.delta), { signed: true })}/household</div></div>
    </div>
    ${r.gross ? `<p class="small">Total ${Y()} spending including money from other sources (gross): <strong>${millions(r.gross)}</strong>.</p>` : ""}
    <h4 class="detail-h">What the money is for</h4>
    ${hl}
    <h4 class="detail-h">Promises</h4>
    ${promises.length ? `<ul class="promises promises-compact">${promises.map((c) => `<li>${statusPill(c.status)}<span>${escapeHtml(c.promise)}</span></li>`).join("")}</ul>` : `<p class="muted small">No specific promise was tied to this service's change.</p>`}
    <h4 class="detail-h">Results</h4>
    ${outcomes.length ? outcomes.map((o) => outcomeCard(o)).join("") : `<p class="muted small">No published performance measure found for this service yet.</p>`}
    <div class="verdict-box">
      <h4 class="detail-h">Your verdict on this change</h4>
      ${verdictButtons(r.id)}
    </div>
    <p class="small muted">${escapeHtml(r.basisNote)}</p>
    ${srcLinks(r.sources)}
  </div>`;
}

/* ---------- 3. did it deliver ---------- */
function renderDeliver() {
  const cs = commitmentSummary(DATA);
  const order = ["delivered", "at_risk", "not_delivered", "unverified", "upcoming"];
  $("promiseSummary").innerHTML = order
    .filter((s) => cs.counts[s])
    .map((s) => `<div class="ps ${STATUS[s].cls}"><span class="ps-n">${cs.counts[s]}</span><span class="ps-l"><span aria-hidden="true">${STATUS[s].icon}</span> ${STATUS[s].label}</span></div>`)
    .join("");
  const progName = Object.fromEntries(DATA.programs.map((p) => [p.id, p.short]));
  const sorted = [...DATA.commitments].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  $("promiseList").innerHTML = sorted.map((c) => `<li>
      ${statusPill(c.status)}
      <div>
        <div class="promise-text">${escapeHtml(c.promise)}${c.program ? ` <span class="muted small">· ${escapeHtml(progName[c.program])}</span>` : ""}</div>
        <div class="small muted">${escapeHtml(c.evidence)}</div>
        ${srcLinks(c.sources)}
      </div></li>`).join("");
  const withOutcomes = DATA.programs.filter((p) => p.outcomes?.length);
  $("outcomeList").innerHTML = withOutcomes.flatMap((p) => p.outcomes.map((o) => outcomeCard(o, p.name))).join("") ||
    `<p class="muted">No service results have been added for this budget yet.</p>`;
}

/* ---------- 4. does it add up ---------- */
function renderSustain() {
  const g = DATA.gapClosing;
  $("gapSub").textContent = g.note;
  $("gapTitle").textContent = `How the ${millions(g.openingGapM)} gap was closed`;
  const items = [
    { id: "gap", label: "The opening gap", value: g.openingGapM, cls: "bar-neutral", valueLabel: millions(g.openingGapM), tipHtml: tipHtml("Opening gap", ["Cost of keeping services running minus expected revenue."]) },
    ...g.measures.map((m, i) => ({
      id: `m${i}`, label: m.label, value: m.amountM, cls: m.kind === "reserve" ? "bar-reserve" : "bar-cut",
      valueLabel: millions(m.amountM), tipHtml: tipHtml(m.label, [m.detail]),
    })),
  ];
  const c = $("gapChart");
  c.innerHTML = "";
  const legend = document.createElement("div");
  legend.className = "legend-inline";
  legend.innerHTML = `<span style="--sw:var(--cut)">Savings &amp; cuts (permanent)</span><span style="--sw:var(--reserve)">Drawn from reserves (one-time)</span><span style="--sw:var(--neutral)">Size of the gap</span>`;
  const host = document.createElement("div");
  c.append(legend, host);
  hbars(host, items, { tickFormat: (v) => (v === 0 ? "0" : millions(v)), ariaLabel: "Measures used to close the budget gap" });
  $("gapFoot").innerHTML = `Amounts overlap and come from different sources, so they don't add up to the gap. Savings tend to last; reserve draws have to be found again next year. ${srcLinks(g.measures.flatMap((m) => m.sources))}`;

  const iy = DATA.inYear;
  if (iy) {
    const stat = (l) => `<div class="stat"><div class="l">${escapeHtml(l.label)}</div><div class="n ${l.valueM < 0 ? "over" : "under"}"><span aria-hidden="true">${l.valueM < 0 ? "▲" : "▼"}</span> ${millions(Math.abs(l.valueM), { digits: 1 })}</div><div class="s ${l.valueM < 0 ? "over" : "under"}">${l.valueM < 0 ? "projected over budget" : "projected under budget"}</div></div>`;
    $("inYear").innerHTML = `<h3>Is ${Y()} on budget?</h3>
      <p class="muted small">Projected year-end result as of ${escapeHtml(iy.asOf)}.</p>
      <div class="stat-row">${iy.lines.map(stat).join("")}</div>
      ${iy.priorYear ? `<p class="small">For comparison: ${escapeHtml(iy.priorYear.label)}, ${millions(Math.abs(iy.priorYear.valueM), { digits: 1 })} ${iy.priorYear.valueM < 0 ? "over" : "under"}.</p>` : ""}
      <p class="small muted">${escapeHtml(iy.note)}</p>
      ${srcLinks([...iy.sources, ...(iy.priorYear?.sources ?? [])])}`;
  }
  const o = DATA.outlook;
  if (o) {
    $("outlook").innerHTML = `<h3>The ${o.year} budget starts in a hole</h3>
      <p class="muted small">Estimated opening shortfall before any decisions</p>
      <div class="outlook-range">${billions(o.gapLowB)}–${billions(o.gapHighB)}</div>
      <ul class="small">${o.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
      ${srcLinks(o.sources)}`;
  }

  const r = DATA.revenue;
  $("revenueTitle").textContent = `Where the ${billions(r.totalB)} comes from (${r.year})`;
  const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--neutral)"];
  const parts = r.parts.map((p, i) => ({
    label: p.label, value: p.amountB, color: colors[i % colors.length], darkInk: i === 3, neutralInk: i === r.parts.length - 1,
    inner: `${Math.round((p.amountB / r.totalB) * 100)}%`,
    ariaLabel: `${p.label}: ${billions(p.amountB, 2)}, ${Math.round((p.amountB / r.totalB) * 100)}%`,
    tipHtml: tipHtml(p.label, [`${billions(p.amountB, 2)} · ${Math.round((p.amountB / r.totalB) * 100)}% of ${billions(r.totalB)}`]),
  }));
  segmentedBar($("revenueBar"), parts, { total: r.totalB, ariaLabel: `Where the ${billions(r.totalB)} operating budget comes from` });
  $("revenueLegend").innerHTML = r.parts.map((p, i) => `<li><span class="sw" style="background:${colors[i % colors.length]}"></span><span>${escapeHtml(p.label)}</span><span class="amt">${billions(p.amountB, 2)}</span></li>`).join("");
  $("revenueFoot").innerHTML = `${escapeHtml(r.note)} ${srcLinks(r.parts.flatMap((p) => p.sources))}`;

  const cap = DATA.capital;
  $("capitalTiles").innerHTML = cap ? [
    tile("10-year capital plan", billions(cap.totalB), `${billions(cap.taxSupportedB)} tax-supported · ${billions(cap.rateSupportedB)} water &amp; waste`),
    tile("Spent fixing what exists", `${cap.stateOfGoodRepairPct}%`, "of the 10-year plan is repairs (\"state of good repair\")"),
    cap.unfundedB ? tile("Planned but not funded", billions(cap.unfundedB), escapeHtml(cap.unfundedLabel || "")) : "",
  ].join("") : "";
}

/* ---------- 5. scorecard ---------- */
function renderScorecard() {
  const rows = computeDeltas(DATA, Y0(), Y());
  const V = verdicts();
  $("verdictList").innerHTML = rows.map((r) => `<li>
      <div class="vl-name"><strong>${escapeHtml(r.short)}</strong><span class="muted small">${millions(r.delta, { signed: true })} · ${pct(r.pct)}</span></div>
      ${verdictButtons(r.id, true)}
    </li>`).join("");

  const rated = rows.filter((r) => V[r.id]);
  const by = (v) => rows.filter((r) => V[r.id] === v);
  const money = (xs) => xs.reduce((s, r) => s + Math.max(0, r.delta), 0);
  const sum = summarizeDeltas(rows);
  const cs = commitmentSummary(DATA);
  const iy = DATA.inYear?.lines?.[0];
  const t = estimateTax(DATA, parseMoney($("assess").value) || DATA.headline.avgHomeAssessment);

  const lines = [
    `My ${DATA.meta.cityName} ${Y()} budget scorecard`,
    `Property tax: +${dollars(t.increase, { cents: true })}/yr for my home (+${DATA.headline.propertyTaxIncreasePct}%)`,
    `Promises delivered: ${cs.counts.delivered} of ${cs.due} (${cs.counts.unverified} not yet verified, ${cs.counts.at_risk} at risk)`,
    iy ? `On budget: ${iy.valueM < 0 ? `${millions(-iy.valueM)} over` : `${millions(iy.valueM)} under`} (projected, ${DATA.inYear.asOf})` : null,
    ...VERDICTS.map((v) => { const xs = by(v.id); return xs.length ? `${v.label}: ${xs.map((r) => r.short).join(", ")}` : null; }),
  ].filter(Boolean);

  $("scoreSummary").innerHTML = `<h3>Your summary</h3>
    ${rated.length === 0 ? `<p class="muted">Rate a few services to build your scorecard.</p>` : `
      <div class="score-tally">
        ${VERDICTS.map((v) => `<div class="stat"><div class="n"><span aria-hidden="true">${v.icon}</span> ${by(v.id).length}</div><div class="l">${v.label}</div></div>`).join("")}
      </div>
      <p class="small">You rated <strong>${rated.length} of ${rows.length}</strong> services. Of the ${millions(sum.increaseTotal)} in increases, you judged
        <strong>${millions(money(by("worth")))}</strong> worth it and <strong>${millions(money(by("not")))}</strong> not worth it.
        ${sum.countDown ? (() => { const cuts = rows.filter((r) => r.delta < 0); const ok = cuts.filter((r) => V[r.id] === "worth"); const bad = cuts.filter((r) => V[r.id] === "not"); return ok.length || bad.length ? `Of the cuts, you agreed with ${ok.length} and disagreed with ${bad.length}.` : ""; })() : ""}</p>`}
    <h4 class="detail-h">The facts to weigh</h4>
    <div class="calc-row"><span>Your tax change</span><span>+${dollars(t.increase, { cents: true })}/yr</span></div>
    <div class="calc-row"><span>Promises delivered</span><span>${cs.counts.delivered} of ${cs.due}</span></div>
    ${iy ? `<div class="calc-row"><span>On budget (projected)</span><span>${iy.valueM < 0 ? `${millions(-iy.valueM)} over` : `${millions(iy.valueM)} under`}</span></div>` : ""}
    ${DATA.outlook ? `<div class="calc-row"><span>Next year's starting gap</span><span>${billions(DATA.outlook.gapLowB)}–${billions(DATA.outlook.gapHighB)}</span></div>` : ""}
    <div class="score-actions">
      <button type="button" class="btn" id="copyScore">Copy my scorecard</button>
      ${rated.length ? `<button type="button" class="btn btn-ghost" id="resetScore">Clear ratings</button>` : ""}
    </div>
    <p class="small muted" id="copyMsg" aria-live="polite"></p>`;
  $("copyScore").onclick = async () => {
    const text = `${lines.join("\n")}\n${location.href.split("#")[0]}`;
    try { await navigator.clipboard.writeText(text); $("copyMsg").textContent = "Copied to clipboard."; }
    catch { $("copyMsg").textContent = text; }
  };
  if ($("resetScore")) $("resetScore").onclick = () => {
    try { localStorage.removeItem(vKey()); } catch {}
    memVerdicts = {};
    renderDeltas();
    renderScorecard();
  };
}

/* ---------- timeline ---------- */
const KIND_LABEL = { process: "Decision", effect: "Takes effect", tracking: "Check-up", upcoming: "Coming up" };
const KIND_COLOR = { process: "var(--s1)", effect: "var(--s3)", tracking: "var(--s2)", upcoming: "var(--axis)" };
function renderTimeline() {
  $("processNote").textContent = DATA.meta.budgetProcess || "";
  const today = DATA.meta.lastUpdated.slice(0, 7);
  let placedToday = false;
  const html = [];
  DATA.timeline.forEach((t) => {
    if (!placedToday && t.date.slice(0, 7) > today) {
      html.push(`<li class="tl-today">Today · ${escapeHtml(DATA.meta.lastUpdated)}</li>`);
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

/* ---------- sources ---------- */
function renderSources() {
  const TYPE = { official: "Government", news: "News", political: "Politician's office", advocacy: "Advocacy group", commentary: "Commentary", reference: "Reference" };
  const entries = Object.values(DATA.sources).sort((a, b) => (a.type === "official" ? 0 : 1) - (b.type === "official" ? 0 : 1) || a.title.localeCompare(b.title));
  $("sourceList").innerHTML = entries.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a> <span class="pub">${escapeHtml(s.publisher)}</span><span class="source-type">${TYPE[s.type] || s.type}</span></li>`).join("");
  $("netDef").textContent = DATA.meta.netDefinition;
  $("methodNote").textContent = DATA.meta.methodNote || "";
  $("footUpdated").textContent = `Data last updated ${DATA.meta.lastUpdated}. ${DATA.meta.status} Independent explainer, not affiliated with the ${DATA.meta.jurisdiction}.`;
}

/* ---------- controls ---------- */
function wireControls() {
  document.querySelectorAll("[data-measure]").forEach((b) => b.addEventListener("click", () => {
    state.measure = b.dataset.measure; setRadio(b.parentElement, "measure", state.measure); renderDeltas();
  }));
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.view; setRadio(b.parentElement, "view", state.view); renderDeltas();
  }));
  document.querySelectorAll("#tlFilter [data-kind]").forEach((b) => b.addEventListener("click", () => {
    state.tlKind = b.dataset.kind; setRadio(b.parentElement, "kind", state.tlKind); renderTimeline();
  }));

  if (INDEX.length > 1) {
    $("cityPickWrap").hidden = false;
    INDEX.forEach((c) => $("cityPick").add(new Option(c.name, c.id)));
    $("cityPick").value = DATA.meta.id;
    $("cityPick").addEventListener("change", (e) => {
      const u = new URL(location.href);
      u.searchParams.set("city", e.target.value);
      location.href = u.toString();
    });
  }

  const root = document.documentElement;
  try { const saved = localStorage.getItem("theme"); if (saved) root.dataset.theme = saved; } catch {}
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
    raf = requestAnimationFrame(() => { renderDeltas(); renderHouseholdCompare(); renderTaxHistory(); renderSustain(); });
  });
}

async function main() {
  try {
    DATA = await loadData();
  } catch (e) {
    $("main").insertAdjacentHTML("afterbegin", `<div class="wrap card" style="margin-top:24px">Couldn't load budget data: ${escapeHtml(e.message)}. If you opened this file directly, run <code>npm start</code> or open <code>dist/index.html</code>.</div>`);
    return;
  }
  const years = availableYears(DATA);
  if (!years.includes(Y0()) || !years.includes(Y())) console.warn("Configured years missing from program data", years);
  wireControls();
  renderHero();
  renderPay();
  renderDeltas();
  renderDeliver();
  renderSustain();
  renderScorecard();
  renderTimeline();
  renderSources();
}

main();
