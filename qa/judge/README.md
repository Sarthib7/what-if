# Judge files

Judges write their verdicts here; `qa/run.ts` reads them on every run. The briefs (who judges what, how, calibration) are in [`../judges.md`](../judges.md).

## Files

| File | Written by | Counted in |
|---|---|---|
| `<component>.json` | the component reviewer | that component's judge score |
| `<component>.<persona>.json` | a persona judge (`selin`, `hackathon`, `educator`) for `product` and `visual` | that component's judge score |
| `refine.json` | the product reviewer: the three highest-impact refinements of the idea | not scored; listed in the report |

Component ids: `engine`, `rehearsal`, `mcp`, `visual`, `skill`, `product`, `docs-devex` (see `../rubric.json`). Expected files are listed per component in `rubric.json` (`judges`); the report warns about missing ones.

## Format

```json
{
  "score": 7.5,
  "notes": "What was checked, what is strong, what holds the score back, with evidence (file:line, screenshot, check id).",
  "improvements": ["Ranked, concrete: where, what, why, how to tell it worked."]
}
```

- `score` must be a number from 1 to 10. A file without a valid score, or with broken JSON, is ignored and named in the report's warnings.
- `improvements` may also be called `issues`. Items may be strings or objects (objects are shown as JSON).
- Extra fields (for example Selin's `understood`, `confused` and `wouldTry`) are allowed. The bot ignores them, but they stay in the file for the next loop's judges.

## How the score is used

- **Judge score** of a component = the mean of all its valid files, rounded to one decimal.
- **Component score** = `automatedWeight × automated + judgeWeight × judge`. The default split is 0.6 / 0.4; `product` uses 0.2 / 0.8 because it is about the idea.
- **No judge file** for a component: the judge part falls back to the automated score, so the loop never blocks.

## Freshness

Judges re-score before every counted loop (`npm run qa`). The report marks a file as **stale** when it was written before the last counted loop. Overwrite your file; do not keep old copies here. Read your previous verdict first, so the new notes can say what changed.
