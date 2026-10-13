# Attacks on data as it moves

## What is entered must be what is shown, summed and saved

- Enter a few records with ordinary values and compute the totals yourself.
  Compare with every place the app shows a total, a count or an average.
- Filter or search, then compare the visible total with the visible rows.
  A total that ignores the filter (or a filter that hides rows the total
  still counts) is a defect only if the screen presents it as the filtered
  total.
- Edit a record, then check every screen that showed the old value.
- Delete a record, then check totals, charts and anything that referred to
  it (a category in use, a card in a column).

## Reload

After every kind of change (create, edit, delete, reorder, settings), reload
and compare. Whatever the user was told was saved must still be there, and
nothing they discarded may come back.

## Export

Check the export's contents, not only that a file arrived: `download_contains`
proves it kept what is on screen, `download_absent` that it did not leak
something. A common defect is an export that silently omits a whole section
(the journal, the notes) that the user needs to move to another device.

Export after entering values with a quote, a comma, a line break and a
leading `=`. The file must parse (`download_is_csv`), keep each value in its
own field, and must not turn user text into a formula
(`{"download_is_csv": {"no_formulas": true}}`).

If the app can import, export and import the same file: the data must come
back identical, and importing twice must not silently duplicate everything
unless the app says it will.

## Import

Use the `upload` step. Give the importer: an empty file, a file of the wrong kind, a valid file with
one broken row in the middle, a file with an extra column, and its own export
with one value changed to the wrong type. A working app refuses the file or
the row with a message and leaves existing data intact. It must not end up
half-imported or unable to start.

## Saved data the app did not write

Apps that keep data in the browser read it back on start. Run `run.mjs
--storage` after entering some data to see the real shape, then use the
`storage` step to set one key to: text that is not JSON (`{"broken`), JSON of the wrong
shape (`"a string"`, `[]`, `null`), and a valid value with one field removed.

A working app starts, tells the user or falls back to empty, and stays
usable. A blank page that survives a reload is a defect: the user cannot
recover without developer tools. A logged error with a working screen is
not.

Rate this **low** unless you can show an ordinary way to reach the bad state
(the app's own older format, an interrupted save, a failed import). Say which
it is.
