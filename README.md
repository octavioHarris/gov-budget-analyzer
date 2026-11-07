# Budget Scorecard

A plain-language, one-page tool that helps voters **evaluate** their city's budget: what they're paying
differently, where the new money went, whether promises were delivered, and whether the numbers add up.
It starts with the City of Toronto's 2026 budget, but the code works for any city: each city is one data file.

## What's on the page

1. **What you pay.** A tax calculator (enter your assessed value, pick your garbage bin), a comparison of
   new spending per household against the average tax increase, and the tax-increase history.
2. **Where it went.** The year-over-year change in each service's net budget, shown as total $, per household
   or percent. Select a service to see what the money is for, the promises attached to it, its measured
   results, and to give your own verdict.
3. **Did it deliver?** A promise tracker (Delivered · At risk · Not delivered · Not yet verified · Coming up) and
   before/after service results (response times, ridership, shelter capacity...).
4. **Does it add up?** How the opening gap was closed (permanent savings vs. one-time reserve draws), whether
   the year is on budget, next year's starting gap, the revenue mix and the capital plan.
5. **Your scorecard.** Your ratings of each change, alongside the key facts, with a "copy my scorecard" button.
   Ratings stay in your browser.
6. **Timeline and sources.** When decisions were made and when residents feel them. Every number links to its source.

## Running it

No dependencies, no framework.

```bash
npm start          # http://localhost:8000
npm test           # validates every city's data (structure, arithmetic, sources, reported changes)
npm run build      # test + bundle into one self-contained dist/index.html
```

`dist/index.html` opens straight from disk and can be dropped on any static host (e.g. GitHub Pages).
Use `?city=<id>` to pick a city once there is more than one.

## Adding a city or a new budget year

- **New city:** copy `data/cities/_template.json` to `data/cities/<id>.json`, fill it in, add it to
  `data/cities/index.json`, and run `npm test`. The full schema is in [`docs/DATA_SCHEMA.md`](docs/DATA_SCHEMA.md).
- **New year (e.g. Toronto 2027):** add `"2027"` to each program's `net`, bump `meta.baseYear` / `compareYear`,
  update the headline, promises, outcomes, timeline and `checks.reportedChanges`, then `npm run build`.
- `scripts/fetch_open_data.py` lists and downloads Toronto's machine-readable budget files.

[`docs/PLATFORM.md`](docs/PLATFORM.md) covers the plan for making this a general platform for any city.

## Project layout

```
index.html                  page structure (city-agnostic)
styles.css                  design tokens (light + dark), layout
src/model.js                pure calculations (deltas, per-household, tax, promises, outcomes), shared with tests
src/charts.js               small SVG charts + tooltips
src/app.js                  renders every section from the city data
src/format.js               number formatting
data/cities/index.json      list of cities
data/cities/toronto.json    Toronto 2025 → 2026, with every figure's source
data/cities/_template.json  starting point for a new city
scripts/validate-data.mjs   data checks (npm test)
scripts/build.mjs           single-file bundler
docs/                       schema and platform notes
```

## Caveats

- "Net" is the city-funded share after each program's own revenue. A drop can come from a cut or from new
  outside revenue.
- Per-household figures divide by the household count to show scale; they are not what any one household pays.
- "Not yet verified" means no public evidence was found either way. It does not mean broken.
- Toronto figures were compiled in November 2026 from City documents, service reports and news coverage.
  Corrections are welcome.

Independent and non-partisan; not affiliated with any government.
