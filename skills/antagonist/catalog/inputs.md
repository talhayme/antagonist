# Attacks on inputs

For each field, the value to try and what must stay true afterwards.

## Numbers (amounts, quantities, prices, percentages)

| try | a working app |
|---|---|
| `0` | either refuses it or handles it everywhere (no division by zero, no "0 items" row that cannot be removed) |
| `-1`, `-0.01` | refuses a negative where it has no meaning; if accepted, totals and signs stay consistent |
| `0.1` then `0.2` | shows the sum as `0.30`, not `0.30000000000000004` |
| `0.001`, `1.005` | rounds the same way in the list, the total and the export |
| `1e308` twice, `999999999999999999999` | never shows `Infinity`, `∞`, `NaN` or scientific notation in a total |
| `1e5`, `0x10`, `١٢٣`, `1,5`, ` 5 ` | either refuses or stores what the user meant, the same everywhere |
| empty | refuses, with a message next to the field |

Check the place the number is used, not only where it is typed: totals,
averages, charts, exports. A `snapshot` step after each screen shows them in
one run; `--screenshot` shows a chart.

## Text (names, titles, descriptions, notes, search)

| try | a working app |
|---|---|
| only spaces | treats it as empty for a required field |
| 5,000 characters | stores or refuses it; the layout of other rows survives |
| `6" pipe`, `O'Brien`, `a,b`; a line break where the field is multi-line | shows it back exactly; exports and imports it exactly |
| `<b>x</b>`, `<img src=x onerror="window.__broken=1">` | shows the characters as text (`{"js": "window.__broken !== 1"}`) |
| `=1+1`, `+cmd`, `@SUM(A1)` | does not put it into an export as a live formula |
| emoji, `‮` (right-to-left override), a combining sequence | shows it; sorting and search still work |
| the same name twice | either refuses the duplicate or keeps the two apart everywhere (edit one, the other is untouched) |
| a value that looks like the app's own syntax (`null`, `undefined`, `true`, `{}`, `../`) | treats it as ordinary text |

## Dates

| try | a working app |
|---|---|
| `0001-01-01`, `9999-12-31` | refuses, or sorts, charts and groups them without breaking |
| a date in the future where only the past makes sense (and the reverse) | refuses or labels it |
| end before start | refuses |
| 29 February, 31 December / 1 January, the day clocks change | puts it in the right day, month and year in every view |
| empty | refuses for a required date |

Dates often shift by a day between the form, the list and the export because
of time zones. Compare all three, and rerun the journey with the clock just
after midnight in a zone ahead of UTC and just before it in a zone behind:
`--timezone Asia/Tokyo --clock 2026-03-01T00:30:00` and
`--timezone America/Los_Angeles --clock 2026-02-28T23:30:00`. "Today" must be
the user's today in the form's default date, in where a new record is filed,
and in the export. Put the same `timezone` and `clock` in the finding's `env`
so the proof does not depend on when it is rerun.

## Required fields and choices

- Submit with every field empty; then with exactly one filled, for each.
- For a select, the placeholder option ("Select a category") must not be
  storable.
- Change a field after a validation error and submit again: the error must
  clear, and only one record must be created.
- If a choice can be created on the fly (a new category, a new tag), create
  one that is empty, one that is only spaces, and one that duplicates an
  existing choice.
