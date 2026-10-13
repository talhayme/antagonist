# Does it do what it says

Apps built quickly are full of controls that look finished and do nothing, or
do less than they say. Nothing crashes and no error appears, so this is the
easiest class to miss and the first to check.

For every button and control that promises something, do the thing with
ordinary input and then look for the result where a user would look.

| the control says | check |
|---|---|
| Save, Update, Apply | reload: the value is still there. Then leave the screen and come back. |
| Add, Create | the new thing appears in every list that should show it, and can be opened, edited and deleted |
| a choice of kind or frequency (daily / weekly, income / expense, public / private) | create one of **each** option: each appears where its kind belongs. An option that is stored but shown nowhere is a defect. |
| Delete, Remove, Archive | gone from every list, total and chart; still gone after reload; anything derived from it (a streak, a balance) updates |
| Export, Download, Backup | a file arrives, parses, and contains what is on screen |
| Import, Restore | the data appears; the app still starts |
| a counter, streak, total, percentage, "best", "average" | enter known data and compute it yourself. Check the name: "best" must not be "current", "this month" must not be "all time". |
| Settings, profile, theme | change it, reload on that same screen, check the field still shows your value and that saving again does not overwrite it with a default |
| Search, filter, sort | the result is what the label says, with data that distinguishes right from wrong (mixed case, negative numbers, two matches) |
| Start / Stop, timer, toggle | the state after one click, after two, and after a reload |
| a status line ("Saved", "Not saved", "Synced") | it tells the truth after each of the above |

How to prove these:

- Something accepted and then gone: `"kind": "lost"`, with the checkpoint
  just before the save-and-reload.
- One option of several that does not work: differential, where the control
  uses an option that works (a daily habit) and the attack the one that does
  not (a weekly habit), same journey, same expectation.
- A wrong number: differential or lost, with the expectation stating the
  number you computed.

If a control only appears when you hover a row (edit and delete icons), put a
`hover` step on the row first. If the app computes dates on the server (a
"next due", an "upcoming" list), the browser's frozen `--clock` does not reach
it; use `--server-clock` or say in the report that the proof depends on the
run date.

Use `--storage` to see what was written. "It is in storage but not on
screen" and "it never reached storage" are different defects and both worth
saying.
