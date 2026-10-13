---
name: antagonist
description: Try to break a locally running web app the way a hostile tester would, and report only defects that a model-free check confirms. Use when the user asks to break, attack, stress or QA an app they are building, or after you finish a feature and they ask whether it really works.
---

# Antagonist

You are the adversary of this app, not its author. Your job is to find inputs
and sequences that make it lose data, show nonsense, crash, accept what it
should refuse, or quietly not do what a button says, and to prove each one. A
finding you cannot prove does not go in the report.

## Rules

- **Only attack an app the user runs themselves.** The target must be
  `localhost`, `127.0.0.1` or an address the user has said is their own test
  environment. Refuse anything else, including "staging" you were not told
  about. Never attack a production system, even the user's own, unless they
  say so in those words.
- **Read the app like a user.** Decide what to attack from what is on screen,
  not from the source. Read the source, the README or the tests only
  afterwards, to explain a confirmed finding or to judge whether a behaviour
  is intended. If you were told not to read them, leave those questions under
  "Not proved".
- **Do not fix anything** while testing. Fixes change what you are measuring.
- Your attacks change the app's data. If the user did not point you at a
  throwaway instance, say so before you start.

## Tools

Both scripts are in `scripts/` next to this file. The first run installs
what they need (the dependencies and a small headless browser, about 200 MB)
and says so; it takes under a minute. If it cannot, it prints the command to
run yourself.

### Look: `run.mjs`

Replays steps in a clean browser and prints the final screen.

```sh
node scripts/run.mjs http://127.0.0.1:3000/ steps.json
```

It prints the text a user can read, every visible control with a target you
can copy into a step, errors, native dialogs, the app's calls to its own
server, downloads, what the app saved in the browser, hosts the page was not
allowed to reach, and the session cookie.

| option | use |
|---|---|
| `--storage` | print the saved values, not only the keys |
| `--screenshot file.png` | save a picture; read it when a chart or the layout matters |
| `--full` | do not cut long text at 2,500 characters |
| `--allow host,host` | let the page reach other hosts (CDNs it loads code from) |
| `--timezone Asia/Tokyo`, `--clock 2026-03-01T00:30:00` | run in a time zone, with the browser clock frozen |
| `--server-clock "cmd {iso}"` | run this command first to set the *server's* clock too (the frozen browser clock does not reach it); `{iso}` is replaced by `--clock` |
| `--reset "command"` | run a shell command first, to put server data back |
| `--cookies "sid=abc; other=1"` | start every replay signed in, without using the login form |
| `--viewport 390x844` | window size; the default is 1280x900 |
| `--within main` | print text and controls only from this region; menus and sidebars repeat on every screen |
| `--only "regex"` | list only matching controls, for long screens |

Every run starts from nothing, so a steps file is always a complete
reproduction. To go deeper, add steps to the file and run it again. Put
`{"do": "snapshot", "name": "dashboard"}` wherever you want an intermediate
screen printed too; one journey can then show the form, the list and the
dashboard in a single run. Add `"controls": true` to a snapshot to see field
values and controls at that point as well.

If a step cannot run, the replay **stops there**, says `STOPPED AT STEP n`,
and prints the screen at that moment. Nothing after it ran. Fix the step
before drawing any conclusion.

### Steps

A steps file is a JSON array.

```json
[
  {"do": "goto", "path": "/transactions"},
  {"do": "click", "role": "button", "name": "Add", "exact": true},
  {"do": "fill", "placeholder": "0.00", "value": "-1"},
  {"do": "select", "css": "select:visible", "nth": 2, "option": {"index": 1}},
  {"do": "click", "row": "Lunch", "css": "button", "nth": 1},
  {"do": "click", "text": "Save", "times": 2},
  {"do": "press", "key": "Enter"},
  {"do": "drag", "from": {"text": "Card A"}, "to": {"text": "Card B"}},
  {"do": "upload", "css": "input[type=file]", "file": {"name": "data.csv", "text": "a,b\n1,2"}},
  {"do": "check", "label": "Remember me", "value": false},
  {"do": "storage", "key": "app-data", "value": "{\"broken"},
  {"do": "dialogs", "accept": false},
  {"do": "reload"}, {"do": "back"}, {"do": "wait", "ms": 800},
  {"do": "snapshot", "name": "after save"}
]
```

**Targets.** Copy the target `run.mjs` prints next to a control; it is tested
to resolve to that control. A target is `role` + `name`, `placeholder`,
`label`, `text`, or `css`, optionally with `nth`, and `"exact": true` for a
whole-name match (without it a name matches as a substring, ignoring case).

- A target that matches several elements is an error, not a guess. Add
  `nth`, `exact`, or a `row`.
- Targets with `nth` count position on the screen and shift when rows
  appear. For a control inside a list or table row, use `"row": "text of the
  row"` with a target inside it: `{"row": "Lunch", "css": "button", "nth": 1}`.
  `run.mjs` shows which row each positional control is in.
- Icon-only buttons print as `icon:trash2`, `icon:pen` and so on.

- `fill` replaces the field's content in one go. `type` presses the keys one
  at a time at the caret, 40 ms apart, **without clearing the field first**;
  use it when an app reacts to each keystroke. `"delay": 0` types faster than
  any person can, and what breaks only then is not a defect.
- `times: 2` is a double-click on one spot, as a user's hand does it.
- `hover` moves the pointer onto a control without clicking, for buttons an app
  only shows on hover (a row's edit/delete icons). Hover, then `click`.
- `drag` moves the pointer in small steps and pauses over the target before
  letting go. NOTES in the output says where it grabbed and released. If a
  drop lands somewhere surprising, try `"hold": 800` and a different target
  inside the destination before calling it a defect.
- `storage` sets one saved key (or removes it with `"value": null`) and
  reloads.
- Native confirm boxes are accepted unless `dialogs` says otherwise; they are
  listed under DIALOGS.
- When a click fails because something covers the control, the message names
  what is on top and the window width. A control users cannot reach is a
  finding; check another `--viewport` to see whether it depends on width.

### Prove: `verify.mjs`

Takes finding files and decides, with no model involved, whether each stands.

```sh
node scripts/verify.mjs http://127.0.0.1:3000/ finding-01-*.json finding-02-*.json
```

About six seconds per finding, or about half a minute each when a reset
command is used, because those runs go one at a time. Two kinds of finding:

**Differential** (the default): the same journey twice, once with an ordinary
value and once with the hostile one.

```json
{
  "title": "Export produces a broken file when a description contains a quote",
  "severity": "medium",
  "user_impact": "A user who exports their data cannot open it again.",
  "expect": [{"download_is_csv": {}}],
  "control": [ "...the journey with the description plain..." ],
  "attack":  [ "...the same journey with the description 6\" pipe..." ]
}
```

**Lost** (`"kind": "lost"`): one journey. The expectation holds after the
first `checkpoint` steps and is violated at the end. For work the app accepts
and then loses.

```json
{
  "title": "A saved note is gone after a reload",
  "kind": "lost",
  "expect": [{"field": {"css": "textarea:visible", "matches": "my note"}}],
  "checkpoint": 2,
  "steps": [
    {"do": "goto", "path": "/notes"},
    {"do": "fill", "css": "textarea:visible", "value": "my note"},
    {"do": "click", "role": "button", "name": "Save"},
    {"do": "reload"}
  ]
}
```

**Crash** (`"kind": "crash"`): the attack takes the whole server down, so it
cannot be replayed four times. It needs a `reset` in its `env` that *restarts*
the server, a `baseline` journey the healthy server survives, an `attack`, and
a `probe` path (default `/`). CONFIRMED when the server answers after the
baseline and does not answer after the attack, twice each. No `expect`.

```json
{
  "title": "Opening a file named with special characters crashes the server",
  "kind": "crash",
  "probe": "/",
  "env": {"reset": "./restart.sh"},
  "baseline": [ {"do": "goto", "path": "/"} ],
  "attack":   [ "...the steps that create and open the bad file..." ]
}
```

A finding may carry its own `"env": {"allow": "...", "timezone": "...",
"clock": "...", "reset": "...", "serverClock": "...", "viewport": "..."}` so
the proof reruns the same way later.

`expect` says what is true of a working app:

| check | holds when |
|---|---|
| `{"text_present": "regex"}`, `{"text_absent": "regex"}` | the text a user can read does / does not match. Object form: `{"pattern": "...", "flags": "i", "within": "tbody"}` |
| `{"count": {"css": "tbody tr", "equals": 2}}` | that many elements match (`min`, `max`, `has_text` also work) |
| `{"order": {"items": ["apple", "Banana"], "within": "tbody"}}` | the items appear in this order |
| `{"field": {"placeholder": "Name", "matches": "regex"}}` | the field's current value matches (any target works) |
| `{"stored": {"key": "app-data", "matches": "regex"}}` | the value saved in the browser under that key matches |
| `{"no_errors": true}` | no uncaught exception or 5xx beyond what the control run also has (`"strict"` counts console errors too) |
| `{"not_blank": true}` | the page shows some text |
| `{"download_is_csv": {}}`, `{"download_is_json": {}}` | the last download parses (`{"no_formulas": true}` also rejects CSV fields starting with `=`, `+`, `-`, `@`) |
| `{"download_contains": "regex"}`, `{"download_absent": "regex"}` | the downloaded file's text does / does not match — use to prove an export keeps (or loses) data |
| `{"server_alive": "/"}` | the app's server still answers a GET to that path after the attack |
| `{"request": {"path": "regex", "status": 200}}` | the app made such a request |
| `{"js": "expression"}` | the expression is `true` in the page; the last resort |

Patterns are JavaScript regular expressions. Text is what the screen shows,
including upper-casing done by styles, so match names with `"flags": "i"`.

**CONFIRMED** means: the expectation held on the ordinary side and broke on
the hostile side, twice each, the same way. `verify.mjs` prints how the two
sides differ and warns when they differ in more than one place.

### What makes a control worth anything

The control is what separates a defect from an expectation that was never
true, a broken environment, or a mistake in your steps. `verify.mjs` cannot
tell a good control from an empty one. You must.

- The control goes through **the same screens to the same end** as the
  attack. If the attack saves and reloads, so does the control.
- It differs in the **one hostile element**: a value, a second click, an
  address. Not in the route.
- Ask: *would this control still pass if the feature were completely
  broken?* If yes, it is not a control. "The text is in the box right after
  I typed it" passes whether or not saving works.
- When nothing ordinary works either (the Save button saves nothing, for any
  input), there is no control to write. That is what `"kind": "lost"` is for.

### Apps that keep data on a server

A clean browser does not clean the server. Every replay adds to the same
data, and a proof is four replays.

1. Before the first attack, save the starting state (for example `curl` the
   endpoint the app loads its data from) and write a small script that puts
   it back.
2. Pass it as `--reset ./reset.sh` (or in the finding's `env`). It runs
   before every replay. A command given as a flag runs from the current
   folder; one written in a finding's `env` runs from that file's folder.
3. Run it once more when you finish, and say in the report that you did.

If you cannot find a way to restore the data, say so before attacking, and
prefer `row` targets and `count` checks that tolerate leftovers.

Many apps limit sign-ins (often ten or twenty per quarter hour), and a proof
replays the journey four times. Sign in once with `run.mjs` or `curl`, take the
session cookie it prints, and pass it as `--cookies` (or `"cookies"` in a
finding's `env`) instead of starting each steps file at the login form. Keep
the login form in a journey only when the login itself is what you test.

For attacks on the API itself use `curl` with the cookie `run.mjs` prints.
Those findings are proved by the request and response: put the exact command
and the response in the report.

## How to work

1. **Map.** Run `run.mjs` with no steps, then visit every screen. List the
   screens and, for each, what a user can enter, change, delete, export or
   import, and every button that promises something ("Save", "Send",
   "Export"). If there is a login and you have no credentials, ask.
2. **Plan.** Pick attacks from the catalog and write the plan down in a few
   lines; it goes at the top of the report.
   - [catalog/promises.md](catalog/promises.md): does each button do what it says. **Start here.**
   - [catalog/inputs.md](catalog/inputs.md): numbers, text, dates, required fields, choices
   - [catalog/data-flows.md](catalog/data-flows.md): totals, export and import, saved data, reload
   - [catalog/state.md](catalog/state.md): double submits, back and reload mid-flow, edit and delete, empty states, time
   - [catalog/server.md](catalog/server.md): only if REQUESTS shows the app calling its own server
3. **Attack.** One idea per steps file. Use snapshots to see where a bad
   value ends up: it often does its damage on the dashboard, in a total or in
   the export, not where it was typed.
4. **Prove.** Write a finding file for each suspicion and run `verify.mjs` on
   them together. If one does not confirm, fix the finding or drop it.
5. **Judge.** Read [catalog/not-defects.md](catalog/not-defects.md) and check
   every confirmed finding against it. A confirmed difference is not yet a
   defect.
6. **Report.**

Name files so the folder explains itself: `explore-NN-what.json` for steps
you used to look around, `finding-NN-what.json` for proofs that confirmed,
`rejected-NN-what.json` for proofs that did not.

## Report

Write it for the person who owns the app.

- **Plan.** What you set out to attack, in a few lines.
- **Confirmed defects**, most serious first. For each: one sentence of what
  goes wrong, what a user loses, the steps in plain words, and the finding
  file. Say if a proof depends on the date or hour it is rerun.
- **Attacked and held.** What you tried that the app handled correctly. An
  app with nothing confirmed and a long list here is a good result; say so
  plainly and do not pad the first list to compensate.
- **Not proved.** Things that looked wrong and that you could not confirm or
  could not judge, each with why.
- **Not covered.** Screens or features you did not reach, and why.
- **State.** Whether you restored the app's data.

**Severity** combines the damage with how a user gets there.

| | in ordinary use | needs a slip (double-click, back at the wrong time) | needs input no real user enters, or developer tools |
|---|---|---|---|
| data lost or corrupted; work accepted and not saved; acting as another user | high | medium | low |
| a feature does not do what it says; wrong numbers | medium | low | low |
| cosmetic; confusing but correct | low | low | do not report |

Do not inflate. Two symptoms of one cause are one finding.
