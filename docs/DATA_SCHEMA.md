# City data schema

Each city is one JSON file in `data/cities/`, listed in `data/cities/index.json`. The page has no
city-specific code: everything it shows comes from this file. Start from `data/cities/_template.json`.

Amounts: program and gap figures are in **$ millions** (`...M`), large totals in **$ billions** (`...B`),
household figures in plain dollars. Years are strings inside `net` and numbers everywhere else.

## Required

| Key | What it holds |
|---|---|
| `meta` | City name, jurisdiction, `leader` (title + name of the incumbent), `households` (for per-household figures), `baseYear` / `compareYear`, `lastUpdated`, `netDefinition`, `methodNote`, `propertyTax` labels, `budgetProcess` |
| `headline` | Operating total, tax increase (total / base / levy), the average home's assessment, tax and increase (used to calibrate the tax calculator) |
| `taxHistory[]` | One row per year: `totalPct`, `basePct`, `levyPct`, `avgHomeIncrease` |
| `programs[]` | The services to compare (aim for the 8–15 large, resident-facing ones). See below |
| `revenue` | `totalB` and `parts[]` that sum to it |
| `gapClosing` | `openingGapM`, a `note`, and `measures[]` (`kind`: `cut` or `reserve`) |
| `timeline[]` | Dated events, `kind`: `process` · `effect` · `tracking` · `upcoming`, in date order |
| `sources` | `{ id: { title, publisher, type, url } }`; `type` is `official` · `news` · `political` · `advocacy` · `commentary` · `reference` |

## Programs

```jsonc
{
  "id": "police", "name": "Police Department", "short": "Police",   // short ≤ 26 chars, used on charts
  "what": "One plain-language sentence.",
  "net": { "2025": 1339.0, "2026": 1432.9 },                       // $M, city-funded share
  "gross": 1704.3,                                                  // optional, $M including outside money
  "basis": "official",            // official | derived (earlier year back-calculated) | approx (rounded, from news)
  "basisNote": "Which document each number came from.",
  "highlights": ["What the change pays for."],
  "outcomes": [ ... ],            // optional, see below
  "sources": ["s_police_notes"]
}
```

### Outcomes (did the service get better?)

```jsonc
{
  "metric": "Average response to the most urgent calls",
  "unit": "min",                  // min | % | anything else is shown as a plain number
  "better": "lower",              // which direction counts as improvement
  "before": { "period": "2024", "value": 17.1 },   // optional; without it the page says "no earlier figure"
  "after":  { "period": "2025", "value": 14.1 },
  "note": "Caveats: definitions, timing, what is excluded.",
  "sources": ["..."]
}
```

### Commitments (did they do what they said?)

```jsonc
{ "id": "fare-cap", "program": "ttc",            // or null for city-wide promises
  "promise": "What was promised, with its deadline",
  "status": "delivered",                           // delivered | at_risk | not_delivered | unverified | upcoming
  "evidence": "What public evidence shows.", "sources": ["..."] }
```

Use `unverified` whenever you can't find public evidence either way. The page says plainly that
"not yet verified" is not the same as "broken."

## Optional

`utilityRates` (garbage bins, water %), `capital`, `inYear` (`lines[]` of projected variance;
negative = overspend), `outlook` (next year's opening gap), `taxHistoryNote`.

## Checks

`checks.reportedChanges` lists the change the government itself reported for each program
(`[dollarsM, percent]`, either may be `null`). `npm test` confirms the stored figures reproduce them.
This catches typos and back-calculation errors. `checks.avgHomeIncrease` and
`checks.garbageIncreases` do the same for the tax calculator.
