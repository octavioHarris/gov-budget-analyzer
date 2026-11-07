# Toward a budget scorecard for any city

**Goal:** a voter in any municipality, including a small town with a low-turnout election, can see in
ten minutes how the incumbents handled the budget: what residents pay differently, where new money
went, whether promises were delivered, and whether the books add up.

## What already works

- **No city-specific code.** Everything comes from one JSON file per city (`data/cities/<id>.json`,
  schema in `DATA_SCHEMA.md`). Add a file and an index entry, and a city picker appears.
- **Validation as the quality bar.** `npm test` checks structure, arithmetic, source links, and that the
  stored numbers reproduce the changes the government itself reported.
- **Static output.** `npm run build` produces one HTML file. Hosting is free, it works offline, and
  there is no backend to maintain.

## The hard part is data, not code

Budgets are published as PDFs in inconsistent formats, with divisions renamed and regrouped between
years. Small towns often publish one scanned document. A realistic pipeline:

1. **Collect.** Point at the adopted budget, the prior year's budget, and any performance or
   variance reports.
2. **Extract.** An LLM-assisted extractor drafts the city JSON: program nets, stated changes,
   promises, outcome measures. Every number carries a page-level citation.
3. **Verify.** A human reviewer checks each figure against its citation. `checks.reportedChanges` and
   the validator catch most extraction slips. Nothing is published unverified.
4. **Refresh.** Re-run when the next budget, variance report or performance report comes out. Commitment
   statuses move from `unverified` to `delivered` / `not_delivered` as evidence appears.

## Principles to protect

- **Facts first, and the verdict belongs to the voter.** The page reports figures and evidence and lets
  users rate each change themselves. It never gives an overall grade for the incumbent.
- **Show uncertainty.** Use the `official` / `derived` / `approx` badges and the `unverified` status;
  never fill a gap with a guess.
- **Symmetry.** Cuts and increases, kept and broken promises get the same treatment and prominence.
- **Every number links to its source.**

## Possible next steps

| Step | Why |
|---|---|
| Add a second, very different city (e.g. a 20k-person town) | Proves the schema generalizes before it hardens |
| Extraction tool (PDF → draft city JSON with citations) | Data entry is the bottleneck for small places |
| Candidate / incumbent view | Tie commitments to who proposed them and how councillors voted |
| Peer comparison (per-capita spending, tax change vs. similar cities) | Gives voters a yardstick |
| Shareable per-service cards and scorecard images | How this actually reaches voters |
| Multi-year view (a whole term, not one budget) | Elections judge a term |
| Neutral governance (open corrections process, published methodology) | Trust across the political spectrum |
