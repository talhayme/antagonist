# Before you report it

`verify.mjs` tells you the attack changes something the control does not. It
does not tell you the change is a fault. Check each confirmed finding against
this list and drop or downgrade it if it matches.

- **Your own tool did it.** Going back from the first page lands on an empty
  tab. A replay that stopped at a failed step shows a half-finished journey.
  A positional target that shifted clicks the wrong control. If the proof
  depends on any of these, it is not a finding. A double-click, a reload or
  Back in the middle of a flow are not tool artefacts: users do them.
  Keys typed with no delay between them, and a drop released the instant the
  pointer arrives, are: no person does either. A finding that needs them is
  the tool's speed, not the app's fault.
- **The control is empty.** If the ordinary side of the proof would pass with
  the feature switched off, the proof shows nothing yet. Rebuild it.
- **The page could not load its own parts.** If BLOCKED HOSTS lists a host
  the app needs, allow it and rerun before believing a blank area or a
  missing feature.
- **It only happens at this hour.** A finding that depends on the clock needs
  the `clock` and `timezone` it was seen with in its `env`. Without them it
  is a suspicion.
- **The app handled it and only logged.** An error in the console next to a
  working screen and a sensible message is the app doing its job. Report a
  console error only when the user also sees something wrong.
- **The environment is incomplete.** A missing API key, a service that is not
  running, a blocked network: the resulting error says nothing about the
  code. List the feature under "Not covered".
- **It is the intended behaviour.** A total that ignores the filter may be
  labelled "all time". A negative amount may be how refunds are entered.
  Look for a label, help text, the README or a test that says so before
  calling it wrong.
- **No user could get there.** A value that only your `storage` step or a
  hand-written request can produce is at most low, unless you show an
  ordinary route to the same state.
- **Two symptoms, one cause.** A crash that shows as an exception, a console
  error and a blank page is one finding. Report the cause once, with the
  worst symptom.
- **Taste.** Missing confirmation dialogs, wording, layout at an unusual
  width. Mention them in one line at the end if at all.

When unsure whether something is intended, report it under "Not proved" with
the question, not under defects.
