// Small hand-rolled SVG charts. No dependencies.
import { escapeHtml } from "./format.js";

const SVG = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/* ---------- tooltip ---------- */
const tip = () => document.getElementById("tooltip");
export function showTip(evt, html) {
  const t = tip();
  if (!t) return;
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = t.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (evt.clientX === undefined || (evt.clientX === 0 && evt.clientY === 0)) {
    const b = evt.target.getBoundingClientRect();
    x = b.left + 12;
    y = b.bottom + 6;
  }
  if (x + r.width > W - 8) x = W - r.width - 8;
  if (y + r.height > H - 8) y = Math.max(8, y - r.height - pad * 2);
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${y}px`;
}
export function hideTip() {
  const t = tip();
  if (t) t.hidden = true;
}

/* A bar with a 4px rounded data-end and a square baseline end. */
function barPath(x0, x1, y, h, r = 4) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  const rr = Math.min(r, w, h / 2);
  if (x1 >= x0) {
    return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
  }
  return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}

function niceStep(span, target = 5) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

function measureText(svg, text, cls) {
  const t = el("text", { class: cls, x: -9999, y: -9999 }, svg);
  t.textContent = text;
  const w = t.getComputedTextLength ? t.getComputedTextLength() : text.length * 7;
  t.remove();
  return w;
}

/**
 * Horizontal bar chart that handles negative values (diverging around zero).
 * items: [{ id, label, value, valueLabel, cls, tipHtml, ariaLabel }]
 */
export function hbars(container, items, opts = {}) {
  const { selectedId = null, onSelect = null, tickFormat = (v) => String(v), rowH = 34, barH = 18 } = opts;
  container.innerHTML = "";
  const width = Math.max(300, container.clientWidth || 640);
  const svg = el("svg", { role: "img", "aria-label": opts.ariaLabel || "Bar chart" }, container);

  const narrow = width < 560;
  const labelW = narrow ? 0 : Math.min(240, Math.max(...items.map((d) => measureText(svg, d.label, "cat-label"))) + 16);
  const valueW = Math.max(...items.map((d) => measureText(svg, d.valueLabel, "value-label"))) + 10;
  const labelRow = narrow ? 18 : 0;
  const rh = rowH + labelRow;
  const top = 6;
  const axisH = 22;
  const height = top + items.length * rh + axisH;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const vals = items.map((d) => d.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const plotL = labelW + (lo < 0 ? valueW : 0);
  const plotR = width - (hi > 0 ? valueW : 8);
  const span = hi - lo || 1;
  const x = (v) => plotL + ((v - lo) / span) * (plotR - plotL);

  // gridlines + ticks
  const step = niceStep(span, narrow ? 3 : 5);
  const g = el("g", {}, svg);
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const xx = x(v);
    el("line", { class: Math.abs(v) < 1e-9 ? "baseline" : "grid", x1: xx, x2: xx, y1: top, y2: height - axisH }, g);
    const t = el("text", { class: "tick-label", x: xx, y: height - 6, "text-anchor": "middle" }, g);
    t.textContent = tickFormat(v);
  }

  items.forEach((d, i) => {
    const y0 = top + i * rh;
    const by = y0 + labelRow + (rowH - barH) / 2;
    const row = el("g", { class: `bar-row${d.id === selectedId ? " is-selected" : ""}` }, svg);
    el("rect", { class: "bar-bg", x: 0, y: y0 + 1, width, height: rh - 2, rx: 6 }, row);
    const lbl = el("text", {
      class: "cat-label",
      x: narrow ? 4 : labelW - 12,
      y: narrow ? y0 + 14 : by + barH / 2 + 4.5,
      "text-anchor": narrow ? "start" : "end",
    }, row);
    lbl.textContent = d.label;
    const p = barPath(x(0), x(d.value), by, barH);
    if (p) el("path", { d: p, class: d.cls }, row);
    const vt = el("text", {
      class: "value-label",
      x: d.value >= 0 ? x(d.value) + 6 : x(d.value) - 6,
      y: by + barH / 2 + 4.5,
      "text-anchor": d.value >= 0 ? "start" : "end",
    }, row);
    vt.textContent = d.valueLabel;

    const hit = el("rect", { class: "bar-hit", x: 0, y: y0, width, height: rh }, row);
    if (onSelect) {
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
    }
    hit.setAttribute("aria-label", d.ariaLabel || `${d.label}: ${d.valueLabel}`);
    if (d.tipHtml) {
      hit.addEventListener("pointermove", (e) => showTip(e, d.tipHtml));
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("focus", (e) => showTip(e, d.tipHtml));
      hit.addEventListener("blur", hideTip);
    }
    if (onSelect) {
      hit.addEventListener("click", () => onSelect(d.id));
      hit.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(d.id);
        }
      });
    }
  });
  return svg;
}

/**
 * Stacked columns with a value label on the cap.
 * cols: [{ label, parts: [{ value, cls, name }], total, totalLabel, tipHtml }]
 */
export function stackedColumns(container, cols, opts = {}) {
  container.innerHTML = "";
  const width = Math.max(260, container.clientWidth || 400);
  const height = opts.height || 220;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": opts.ariaLabel || "Column chart" }, container);
  const top = 26, bottom = 26, left = 34, right = 8;
  const max = Math.max(...cols.map((c) => c.total)) * 1.08;
  const y = (v) => height - bottom - (v / max) * (height - top - bottom);
  const step = niceStep(max, 4);
  for (let v = 0; v <= max; v += step) {
    el("line", { class: v === 0 ? "baseline" : "grid", x1: left, x2: width - right, y1: y(v), y2: y(v) }, svg);
    const t = el("text", { class: "tick-label", x: left - 6, y: y(v) + 4, "text-anchor": "end" }, svg);
    t.textContent = opts.tickFormat ? opts.tickFormat(v) : v;
  }
  const band = (width - left - right) / cols.length;
  const colW = Math.min(56, band * 0.5);
  cols.forEach((c, i) => {
    const cx = left + band * i + band / 2;
    let acc = 0;
    const g = el("g", {}, svg);
    c.parts.forEach((p, j) => {
      const y0 = y(acc);
      const y1 = y(acc + p.value);
      const isTop = j === c.parts.length - 1;
      const gap = j > 0 ? 2 : 0; // 2px surface gap between stacked segments
      const h = Math.max(0, y0 - y1 - gap);
      const yy = y1;
      const r = isTop ? Math.min(4, h / 2) : 0;
      const x0 = cx - colW / 2, x1 = cx + colW / 2;
      const d = `M${x0},${yy + h}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x1 - r}Q${x1},${yy} ${x1},${yy + r}V${yy + h}Z`;
      el("path", { d, class: p.cls }, g);
      acc += p.value;
    });
    const vt = el("text", { class: "value-label", x: cx, y: y(c.total) - 8, "text-anchor": "middle" }, g);
    vt.textContent = c.totalLabel;
    const lt = el("text", { class: "tick-label", x: cx, y: height - 6, "text-anchor": "middle" }, g);
    lt.textContent = c.label;
    const hit = el("rect", { class: "bar-hit", x: cx - band / 2, y: top, width: band, height: height - top - bottom, tabindex: 0 }, g);
    hit.setAttribute("aria-label", c.ariaLabel || `${c.label}: ${c.totalLabel}`);
    hit.addEventListener("pointermove", (e) => showTip(e, c.tipHtml));
    hit.addEventListener("pointerleave", hideTip);
    hit.addEventListener("focus", (e) => showTip(e, c.tipHtml));
    hit.addEventListener("blur", hideTip);
  });
  return svg;
}

/** Tall segmented bar (one whole split into parts). parts: [{label, value, color, darkInk, tipHtml, inner}] */
export function segmentedBar(container, parts, { total, ariaLabel } = {}) {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "segbar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", ariaLabel || "Segmented bar");
  const sum = total ?? parts.reduce((s, p) => s + p.value, 0);
  parts.forEach((p) => {
    const seg = document.createElement("div");
    seg.style.flex = `${p.value / sum} 1 0`;
    seg.style.background = p.color;
    if (p.darkInk) seg.classList.add("dark-ink");
    if (p.neutralInk) seg.classList.add("neutral-ink");
    seg.tabIndex = 0;
    seg.setAttribute("aria-label", p.ariaLabel || p.label);
    seg.addEventListener("pointermove", (e) => showTip(e, p.tipHtml));
    seg.addEventListener("pointerleave", hideTip);
    seg.addEventListener("focus", (e) => showTip(e, p.tipHtml));
    seg.addEventListener("blur", hideTip);
    bar.appendChild(seg);
    // Label only if it fits: measured after layout.
    requestAnimationFrame(() => {
      const label = p.inner;
      seg.textContent = label;
      if (seg.scrollWidth > seg.clientWidth) seg.textContent = "";
    });
  });
  container.appendChild(bar);
}

export function tipHtml(title, lines = []) {
  return `<strong>${escapeHtml(title)}</strong>${lines.map((l) => escapeHtml(l)).join("<br>")}`;
}
