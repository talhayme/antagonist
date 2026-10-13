# Attacks on sequence and state

## Twice

- Double-click every button that creates, pays, sends or deletes
  (`"times": 2`). One record, one message, one deletion.
- Press Enter in a form and click its button in the same step sequence.
- Submit, go back, submit again.

A double-click on the same spot is something users do. If the second click
lands on a different thing because the page moved under the pointer (the row
below slides up after a delete), that is the app's doing, not the tool's.

## In the middle

- Open a form, fill half, reload: the app must not save a half-record, and
  must not crash on return.
- Open an edit form for a record, delete that record another way (or in the
  list behind the dialog), then save the form.
- Start a multi-step flow and use Back at each step. Then jump straight to
  the last step's address without the earlier ones.
- Close a dialog with Escape, with the Cancel button and by clicking outside:
  none of them may save.

## Empty and full

- Every screen with no data at all: no `NaN`, `undefined`, `Invalid Date` or
  division by zero in summaries and charts.
- Delete the last remaining record of each kind and look at every screen.
- Enter fifty records quickly (repeat steps): the list, the totals and the
  export still agree.

## Order

- Sort by each column with mixed values (negative numbers, empty text,
  accented and upper/lower-case names): the order must be the one the header
  promises.
- Reorder or move between lists with a `drag` step, reload, and compare. Drag
  onto the first, the last and an empty list.
- Rename something to the name of something else.

## Addresses

- Open an address for a record that does not exist (`/items/999999`,
  `/items/abc`). A working app says so; it does not show a blank page or an
  empty form that can be saved.
- Open a deep address directly in a fresh browser, without navigating from
  the home screen.
