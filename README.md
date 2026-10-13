# Antagonist

**Your agent built it. Antagonist tries to break it, and tells you only what it can prove.**

Antagonist is an agent skill. It turns your coding agent into a hostile tester
for the web app you are building: it reads the app the way a user does, attacks
it with the inputs and sequences that break apps (a `#` in a name, a double
click, a reload in the middle of a save, a date just after midnight), and
reports only the defects that a check with no model in it confirms.

```sh
npx skills add talhayme/antagonist
```

Then ask your agent:

```text
Use antagonist on http://localhost:3000
```

## Why another testing tool

Agents are good at writing an app and bad at doubting it. Asked "does it
work?", they try the happy path and say yes. Asked to look for bugs, they
report plausible ones that are not there.

Antagonist fixes the second problem first. The agent may suspect anything, but
a suspicion becomes a finding only after a small script, with no model
involved, replays it in a clean browser and agrees:

- **A control and an attack.** The same journey twice: once with an ordinary
  value, once with the hostile one. The finding stands only when the ordinary
  journey passes the check and the hostile one fails it, twice each, the same
  way. A broken environment, a wrong expectation or a mistake in the agent's
  own steps fails the control, so it never reaches you.
- **Saved and lost.** For work the app accepts and then drops: the check holds
  at a checkpoint and fails after the save and reload.
- **Crashed.** For an attack that takes the whole server down: the server
  answers after an ordinary journey and stops answering after the attack.

Every finding is a JSON file you can rerun yourself:

```sh
node scripts/verify.mjs http://localhost:3000/ finding-01-hash-in-name-wipes-note.json
```

## What it looks for

The agent starts from what the screen promises and works outwards. The catalog
it follows lives in [`skills/antagonist/catalog`](skills/antagonist/catalog):

- **Buttons that do not do what they say.** Save that does not save, a choice
  that is stored and shown nowhere, "Make a copy" that copies nothing, a
  "best streak" that is really the current one.
- **Inputs.** Zero, negative and enormous numbers; quotes, `#`, `=` and
  emoji in names; names that differ only by case; dates at month end, in other
  time zones and just after midnight.
- **Data on the move.** Totals that do not add up, exports that drop rows or
  break on a quote, imports that silently skip what they cannot read, saved
  data the app cannot read back.
- **Sequence.** Double clicks, Back and reload in the middle of a flow, editing
  something that was deleted behind the dialog, empty and full states.
- **The app's own API.** Requests without a session, another user's ids, wrong
  types, references to things that do not exist.
- **What is not a defect.** Its own tool artefacts, errors the app handled,
  features that need a service you did not configure, and behaviour a label
  says is intended. The agent checks every confirmed finding against this list
  before reporting it.

## First results

On nine open-source web apps it had not seen before (41 to 2,836 GitHub
stars: note-taking, budgeting, a family planner, habit trackers, a grocery
planner, a collaborative editor and an e-book reader), Antagonist confirmed 40
defects. Five of them lose a user's data or take the app down for everyone.

Reported so far:

| Project | What Antagonist found | Report |
|---|---|---|
| [NoteDiscovery](https://github.com/gamosoft/NoteDiscovery) | Creating a note named `B#1`, or `b`, empties the existing note `B` | [#317](https://github.com/gamosoft/NoteDiscovery/issues/317) |
| NoteDiscovery | Renaming a shared note, or its folder, breaks the share link | [#318](https://github.com/gamosoft/NoteDiscovery/issues/318) |
| NoteDiscovery | Export as HTML fails for titles with non-Latin characters | [#319](https://github.com/gamosoft/NoteDiscovery/issues/319) |

The other projects are not named until their maintainers have heard from me.
Among those findings: a server that one request can take down for every
user, a monthly reminder set for the 31st that drifts to the 28th and never
comes back, and a meal planned for Sunday that is saved as Saturday in every
time zone east of UTC.

On the same run it found nothing to report in the places where the apps were
solid: access between users, money arithmetic and shared-expense splits all
held. A tester that finds defects everywhere is not useful; this one says "held"
when things hold.

## Install

You need Node.js 20 or newer.

```sh
npx skills add talhayme/antagonist
```

The installer lets you choose the agents to set it up for (Claude Code,
Codex, Cursor and others). Then install the browser it drives, once, from the
skill's `scripts` folder. For a personal Claude Code install that is:

```sh
cd ~/.claude/skills/antagonist/scripts
npm install
npx playwright install chromium
```

Or copy [`skills/antagonist`](skills/antagonist) into your agent's skills
folder by hand.

## Rules it keeps

- It only attacks an app you run yourself: `localhost`, `127.0.0.1`, or an
  address you say is your own test environment. It refuses anything else.
- It changes your app's data, so point it at a throwaway instance. For apps
  with a server it saves the starting state and puts it back at the end.
- It does not read your source to decide what to attack, and it does not fix
  anything while it tests.

## Limits

- Web apps in a browser, plus their own HTTP API. Not native or mobile apps.
- A small app costs about 100k to 150k tokens and 15 to 30 minutes of agent
  time. The quality follows the model you run it on.
- A check without a model proves that the hostile journey behaves differently
  from the ordinary one. Whether that difference is a defect is still the
  agent's judgement, made against a written list, and you should read the
  report as findings to confirm, not as a verdict.

## License

MIT. See [LICENSE](LICENSE).
