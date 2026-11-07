# Toronto Budget Explained

A plain-language, one-page visualizer of **what changed** in the City of Toronto's budget from one year
to the next, written for the average voter rather than budget analysts.

Most of an $18.9B budget is the same every year. People can only focus on so much, so the page
skips the full line-by-line budget and covers six questions:

1. **Who got more, who got less?** A diverging bar chart of the year-over-year change in each major
   service's City-funded (net) budget. Tap a service to see what the money buys, before/after
   figures and the source documents. You can switch between dollars and percent, or open a table view.
2. **How was the gap closed?** The $1.34B opening shortfall, and the cuts, efficiencies and reserve
   draws used to close it. Permanent savings and one-time reserve money are shown in different colours.
3. **What does it cost me?** A property-tax calculator: enter your MPAC assessed value to see your
   increase, your garbage-fee change, and a rough split of your bill across services. It also shows the
   tax-increase history under the current mayor.
4. **Where does the money come from?** Revenue mix (property tax is under a third) and the 10-year
   capital plan.
5. **When does it happen?** A timeline covering the decision process (staff → Mayor → Council under
   strong-mayor rules) and the dates changes reach residents (fare cap, library hours, new rates),
   with a "today" marker and upcoming 2027 milestones.
6. **Is it on track, and what's next?** In-year variance (projected overspend) and the 2027 outlook.

Every number cites its source. Program figures carry a badge:
**Official** (both years taken from City documents), **Derived** (2025 back-calculated from the change
the City reported), or **Approx.** (rounded figures from news coverage).

## Running it

No dependencies, no framework.

```bash
npm start          # serves the site at http://localhost:8000 (python3 http.server)
npm test           # validates the dataset (arithmetic, sources, reported changes)
npm run build      # test + bundle everything into a single self-contained dist/index.html
```

`dist/index.html` is one file that opens straight from disk and can be dropped on any static host
(e.g. GitHub Pages).

## Project layout

```
index.html                 page structure
styles.css                 design tokens (light + dark), layout
src/model.js               pure calculations (deltas, tax estimate, fees), shared with tests
src/charts.js              small SVG charts (bars, stacked columns, segmented bar) + tooltips
src/format.js              number formatting
src/app.js                 renders each section from the data
data/toronto-budget.json   the dataset: every figure, with source ids
scripts/validate-data.mjs  consistency checks (run by npm test)
scripts/build.mjs          single-file bundler
scripts/fetch_open_data.py lists/downloads the City's budget datasets from Toronto Open Data
```

## Updating for the 2027 budget

The page is driven entirely by `data/toronto-budget.json`:

1. Add a `"2027"` value to each program's `net` object, and update `basis`, `basisNote`,
   `highlights` and `sources`.
2. Set `meta.baseYear` to `2026` and `meta.compareYear` to `2027`; update `headline`, `gapClosing`,
   `revenue2026`, `taxHistory`, `timeline` and `inYear`.
3. Update the expected changes in `scripts/validate-data.mjs`, then run `npm run build`.

The best primary sources are each division's **Budget Notes** (toronto.ca/budget) and the Council
decision on the budget. `scripts/fetch_open_data.py` can pull the City's machine-readable budget files.

## Caveats

- The 13 services shown are the large, resident-facing ones. The full budget also includes debt
  service, corporate accounts and smaller divisions.
- "Net" is the City-funded share after each program's own revenue. A drop in net can come from either
  a cut or new outside revenue, so it does not by itself mean less service.
- The "where your tax goes" split is illustrative: it is proportional to the net budgets of the shown
  services, not an official tax receipt.
- Figures were compiled in November 2026 from City documents and news coverage. Corrections are welcome.

This is an independent, non-partisan project and is not affiliated with the City of Toronto.
