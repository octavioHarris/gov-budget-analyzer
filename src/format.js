// Number formatting helpers. Program values are stored in $ millions.

const nf = (opts) => new Intl.NumberFormat("en-CA", opts);

export function millions(m, { signed = false, digits } = {}) {
  const abs = Math.abs(m);
  let out;
  if (abs >= 1000) out = `$${nf({ maximumFractionDigits: digits ?? 2 }).format(abs / 1000)}B`;
  else if (abs >= 10) out = `$${nf({ maximumFractionDigits: digits ?? 0 }).format(abs)}M`;
  else out = `$${nf({ maximumFractionDigits: digits ?? 1 }).format(abs)}M`;
  const sign = m < 0 ? "−" : signed && m > 0 ? "+" : "";
  return sign + out;
}

export function billions(b, digits = 1) {
  return `$${nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(b)}B`;
}

export function pct(p, { signed = true, digits = 1 } = {}) {
  const sign = p < 0 ? "−" : signed && p > 0 ? "+" : "";
  return `${sign}${nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(p))}%`;
}

export function dollars(d, { cents = false, signed = false } = {}) {
  const s = nf({ minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(Math.abs(d));
  const sign = d < 0 ? "−" : signed && d > 0 ? "+" : "";
  return `${sign}$${s}`;
}

export function int(n) {
  return nf({ maximumFractionDigits: 0 }).format(n);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
